"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/tenant/context";
import { createSubscription, cancelSubscription } from "@/lib/billing/razorpay";
import { createAdminClient } from "@/lib/supabase/admin";

function fail(m: string): never { throw new Error(m); }

export async function startCheckout(fd: FormData) {
  const { active } = await requireAdmin();
  const plan = z.enum(["starter", "pro"]).parse(fd.get("plan"));
  const planId = plan === "starter" ? process.env.RAZORPAY_PLAN_STARTER : process.env.RAZORPAY_PLAN_PRO;
  if (!planId || !process.env.RAZORPAY_KEY_ID || !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("Billing is not configured.");
  const sub = await createSubscription(planId!, { business_id: active.id, plan });
  // Remember the pending subscription. The plan itself changes only when Razorpay's webhook confirms payment.
  await createAdminClient().from("business_billing").upsert(
    { business_id: active.id, provider: "razorpay", provider_subscription_id: sub.id, status: "created", updated_at: new Date().toISOString() },
    { onConflict: "business_id" },
  );
  redirect(sub.short_url);
}

export async function cancelPlan() {
  const { supabase, active } = await requireAdmin();
  const { data } = await supabase.from("business_billing").select("provider_subscription_id").eq("business_id", active.id).single();
  const id = (data as { provider_subscription_id: string | null } | null)?.provider_subscription_id;
  if (!id) fail("No subscription to cancel.");
  await cancelSubscription(id!);
  revalidatePath("/dashboard/billing");
}
