import { requireBusiness } from "@/lib/tenant/context";
import { usedSecondsThisMonth } from "@/lib/receptionist/engine";
import { setLimit } from "../actions";

export default async function Usage() {
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const secs = await usedSecondsThisMonth(supabase, active.id);
  const { data } = await supabase.from("receptionist_settings").select("monthly_minute_limit").eq("business_id", active.id).single();
  const limit = (data as { monthly_minute_limit: number }).monthly_minute_limit;
  const mins = secs / 60;
  const pct = Math.min(100, (mins / limit) * 100);
  return (
    <>
      <h1>Usage</h1>
      <p className="sub">Minutes used this month (UTC). When the limit is reached the receptionist stops taking calls.</p>
      <div className="card">
        <b>{mins.toFixed(1)} of {limit} minutes</b>
        <div className="meter"><i style={{ width: `${pct}%` }} /></div>
        <span className={`tag ${pct > 80 ? "wn" : "ok"}`}>{pct > 80 ? "Approaching limit" : "Within limit"}</span>
        {canEdit && (
          <form className="actions" action={setLimit}>
            <input name="limit" type="number" min={10} max={100000} defaultValue={limit} aria-label="Monthly minute limit" style={{ maxWidth: 160 }} />
            <button className="btn primary" type="submit">Save limit</button>
          </form>
        )}
      </div>
      <div className="notice wn">Plan limits are enforced here. Change plans on the Billing tab.</div>
    </>
  );
}
