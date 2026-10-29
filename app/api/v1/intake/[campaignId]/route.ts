import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { dialCampaign } from "@/lib/outbound/dialer";
import { normalizePhone, safeEqual } from "@/lib/outbound/pure";

export const dynamic = "force-dynamic";
const j = (b: unknown, status: number) => NextResponse.json(b, { status });
const body = z.object({ phone: z.string().min(5).max(30), name: z.string().max(80).optional() });

/** POST /api/v1/intake/<campaignId>  header x-vaachak-secret  body {phone, name?}. Queues the lead and calls within seconds. */
export async function POST(req: Request, ctx: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await ctx.params;
  if (!z.string().uuid().safeParse(campaignId).success) return j({ error: "not found" }, 404);
  if (!rateLimit(`intake:${campaignId}`, 120, 60_000)) return j({ error: "rate limited" }, 429);
  const raw = await req.text();
  if (raw.length > 5000) return j({ error: "too large" }, 413);
  let db;
  try { db = createAdminClient(); } catch { return j({ error: "not configured" }, 503); }

  const { data: sec } = await db.from("campaign_secrets").select("intake_secret, business_id").eq("campaign_id", campaignId).maybeSingle();
  const s = sec as { intake_secret: string; business_id: string } | null;
  if (!s || !safeEqual(req.headers.get("x-vaachak-secret") ?? "", s.intake_secret)) return j({ error: "unauthorized" }, 401);

  let parsed;
  try { parsed = body.parse(JSON.parse(raw)); } catch { return j({ error: "bad request" }, 400); }
  const phone = normalizePhone(parsed.phone);
  if (!phone) return j({ error: "invalid phone number" }, 400);

  const { data: dnc } = await db.from("dnc_numbers").select("phone").eq("business_id", s.business_id).eq("phone", phone).maybeSingle();
  if (dnc) return j({ status: "skipped", reason: "on do-not-call list" }, 200);

  const { data: ins, error } = await db.from("contacts").insert({
    business_id: s.business_id, campaign_id: campaignId, name: parsed.name ?? null, phone, consent_attested: true,
  }).select("id").single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return j({ status: "duplicate" }, 200);
    console.error("intake error", error.message);
    return j({ error: "internal" }, 500);
  }
  let note: string | undefined, dialed = 0;
  try { const r = await dialCampaign(db, campaignId, 1); dialed = r.dialed; note = r.note; } catch (e) { console.error("intake dial error", e instanceof Error ? e.message : e); }
  return j({ contact_id: (ins as { id: string }).id, status: dialed ? "calling" : "queued", ...(note ? { note } : {}) }, 202);
}
