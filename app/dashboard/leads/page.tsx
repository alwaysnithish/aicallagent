import { requireBusiness } from "@/lib/tenant/context";
import { setLeadStage } from "../actions";

type L = { id: string; name: string; phone: string; interest: string | null; stage: string; created_at: string };

export default async function Leads() {
  const { supabase, active } = await requireBusiness();
  const { data } = await supabase.from("leads").select("id, name, phone, interest, stage, created_at")
    .eq("business_id", active.id).order("created_at", { ascending: false });
  const leads = (data ?? []) as L[];
  return (
    <>
      <h1>Leads</h1>
      <p className="sub">Captured from calls. Repeat callers are not duplicated.</p>
      <div className="card tw">
        {leads.length === 0 ? <div className="empty">No leads yet. Run a test call and ask to book an appointment.</div> : (
          <table><thead><tr><th>Name</th><th>Phone</th><th>Interest</th><th>Date</th><th>Stage</th></tr></thead><tbody>
            {leads.map((l) => (
              <tr key={l.id}><td>{l.name}</td><td>{l.phone}</td><td>{l.interest}</td>
                <td>{new Date(l.created_at).toLocaleDateString("en-IN")}</td>
                <td><form className="bar" action={setLeadStage}><input type="hidden" name="id" value={l.id} />
                  <select name="stage" defaultValue={l.stage}>{["New", "Contacted", "Booked", "Won", "Lost"].map((s) => <option key={s}>{s}</option>)}</select>
                  <button className="btn" type="submit">Save</button></form></td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </>
  );
}
