import { requireBusiness } from "@/lib/tenant/context";
import { configStatus } from "@/lib/env/server";
import { PLANS, isPlan, type PlanId } from "@/lib/billing/plans";
import { startCheckout, cancelPlan } from "./actions";

export default async function Billing() {
  const { supabase, active } = await requireBusiness();
  if (active.role === "member") return <div className="notice wn">Only owners and admins can view billing.</div>;
  const { data } = await supabase.from("business_billing").select("plan, status, provider_subscription_id").eq("business_id", active.id).single();
  const b = data as { plan: string; status: string; provider_subscription_id: string | null } | null;
  const rawPlan = b?.plan;
  const plan: PlanId = isPlan(rawPlan) ? rawPlan : "free";
  const ready = configStatus().razorpay;
  return (
    <>
      <h1>Billing</h1>
      <p className="sub">Current plan: <b>{PLANS[plan].label}</b> ({PLANS[plan].minutes} call minutes per month)</p>
      {!ready && <div className="notice wn">Razorpay is not configured on the server (RAZORPAY_* and SUPABASE_SERVICE_ROLE_KEY), so upgrades are disabled.</div>}
      {b?.status === "created" && <div className="notice ok">A payment is pending. Your plan updates automatically once Razorpay confirms it.</div>}
      <div className="grid">
        {(["starter", "pro"] as const).map((p) => (
          <form className="card" key={p} action={startCheckout}>
            <div className="big">{PLANS[p].label}</div>
            <div className="lbl">{PLANS[p].minutes} minutes per month. Price comes from your Razorpay plan.</div>
            <input type="hidden" name="plan" value={p} />
            <div className="actions"><button className="btn primary" type="submit" disabled={!ready || plan === p}>{plan === p ? "Current plan" : `Choose ${PLANS[p].label}`}</button></div>
          </form>
        ))}
      </div>
      {plan !== "free" && b?.provider_subscription_id && (
        <form action={cancelPlan}><button className="btn" type="submit" disabled={!ready}>Cancel at end of billing cycle</button></form>
      )}
    </>
  );
}
