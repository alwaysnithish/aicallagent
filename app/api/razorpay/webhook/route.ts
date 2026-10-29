import { NextResponse } from "next/server";
import { z } from "zod";
import { PLANS, isPlan, type PlanId } from "@/lib/billing/plans";
import { verifyRazorpaySignature } from "@/lib/billing/razorpay-verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const LIVE = new Set(["subscription.activated", "subscription.charged"]);
const ENDED = new Set(["subscription.halted", "subscription.cancelled", "subscription.completed", "subscription.paused"]);
type Notes = Record<string, string> | unknown[] | undefined;
type SubEntity = { id: string; status: string; customer_id?: string | null; notes?: Notes };
type LinkEntity = { id: string; amount?: number; amount_paid?: number; notes?: Notes };
const notesOf = (n: Notes) => (Array.isArray(n) ? {} : n ?? {}) as Record<string, string>;
const uuid = z.string().uuid();

async function apply(businessId: string, plan: PlanId, status: string, customer: string | null, sub: string) {
  if (!uuid.safeParse(businessId).success) return;
  const db = createAdminClient();
  await db.from("business_billing").upsert({
    business_id: businessId, plan, status, provider: "razorpay",
    provider_customer_id: customer, provider_subscription_id: sub, updated_at: new Date().toISOString(),
  }, { onConflict: "business_id" });
  await db.from("receptionist_settings").update({ monthly_minute_limit: PLANS[plan].minutes }).eq("business_id", businessId);
}

export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifyRazorpaySignature(raw, req.headers.get("x-razorpay-signature") ?? "", secret))
    return NextResponse.json({ error: "bad signature" }, { status: 400 });

  try {
    const ev = JSON.parse(raw) as { event?: string; payload?: { subscription?: { entity?: SubEntity }; payment_link?: { entity?: LinkEntity } } };
    if (ev.event === "payment_link.paid") {
      const l = ev.payload?.payment_link?.entity;
      const n = notesOf(l?.notes);
      const paise = l?.amount_paid ?? l?.amount ?? 0;
      if (l && n.kind === "topup" && uuid.safeParse(n.business_id).success && paise > 0) {
        await createAdminClient().rpc("wallet_credit", { p_business: n.business_id, p_amount: paise, p_ref: `pl:${l.id}` });
      }
    } else {
      const e = ev.payload?.subscription?.entity;
      if (e && ev.event) {
        const n = notesOf(e.notes);
        if (n.business_id) {
          if (LIVE.has(ev.event) && isPlan(n.plan)) await apply(n.business_id, n.plan, e.status, e.customer_id ?? null, e.id);
          else if (ENDED.has(ev.event)) await apply(n.business_id, "free", e.status, e.customer_id ?? null, e.id);
        }
      }
    }
  } catch (err) {
    console.error("razorpay webhook error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
