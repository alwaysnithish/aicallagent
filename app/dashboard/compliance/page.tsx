import { requireBusiness } from "@/lib/tenant/context";
import { addDnc, removeDnc } from "../outbound-actions";

export default async function Compliance() {
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const { data } = await supabase.from("dnc_numbers").select("phone, reason, created_at").eq("business_id", active.id).order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as { phone: string; reason: string | null; created_at: string }[];
  return (
    <>
      <h1>Compliance</h1>
      <p className="sub">Guardrails that are always on for outbound calling.</p>
      <div className="card">
        <b>Built-in protections</b>
        <div className="row">Calls only between 9 AM and 9 PM in your timezone, and inside each campaign&apos;s own window.</div>
        <div className="row">Every call opens by saying it is an automated AI assistant.</div>
        <div className="row">Anyone who asks not to be called is added to the list below instantly, and never called again by any campaign.</div>
        <div className="row">Contact uploads require you to confirm consent. Numbers on the list are skipped.</div>
        <div className="row">Prices, dates and offers come only from your approved facts. Anything else becomes a human callback.</div>
        <p className="mut">These help, but you remain responsible for following local telemarketing, consent and registration rules (for example DLT registration in India).</p>
      </div>
      {canEdit && (
        <form className="card" action={addDnc}>
          <b>Add to do-not-call list</b>
          <label htmlFor="phone">Phone number</label><input id="phone" name="phone" required placeholder="+919876543210" />
          <div className="actions"><button className="btn primary" type="submit">Block number</button></div>
        </form>
      )}
      <div className="card tw"><b>Do-not-call list ({rows.length})</b>
        {rows.length ? (
          <table><thead><tr><th>Number</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>
            {rows.map((r) => (
              <tr key={r.phone}><td>{canEdit ? r.phone : r.phone.slice(0, 4) + "••••" + r.phone.slice(-3)}</td><td>{r.reason}</td><td>{new Date(r.created_at).toLocaleDateString("en-IN")}</td>
                <td>{canEdit && <form action={removeDnc}><input type="hidden" name="phone" value={r.phone} /><button className="btn" type="submit">Remove</button></form>}</td></tr>
            ))}
          </tbody></table>
        ) : <div className="empty">Nobody is blocked yet.</div>}
      </div>
    </>
  );
}
