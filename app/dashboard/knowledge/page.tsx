import { requireBusiness } from "@/lib/tenant/context";
import { addFact, setFactStatus, deleteFact } from "../actions";

type F = { id: string; keywords: string; answer: string; high_impact: boolean; status: string };
const tag = (s: string) => (s === "approved" ? "ok" : s === "pending" ? "wn" : "er");

export default async function Knowledge() {
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const { data } = await supabase.from("facts").select("id, keywords, answer, high_impact, status")
    .eq("business_id", active.id).order("created_at", { ascending: false });
  const facts = (data ?? []) as F[];
  return (
    <>
      <h1>Knowledge base</h1>
      <p className="sub">The receptionist answers only from approved facts. Prices, dates and policies need approval first.</p>
      {canEdit ? (
        <form className="card" action={addFact}>
          <b>Add a fact</b>
          <label htmlFor="keywords">Keywords callers might use</label>
          <input id="keywords" name="keywords" required maxLength={200} placeholder="e.g. facial price cost" />
          <label htmlFor="answer">Answer the receptionist will give</label>
          <textarea id="answer" name="answer" rows={2} required maxLength={600} />
          <label><input type="checkbox" name="high" style={{ width: "auto" }} /> Contains a price, date or policy (needs approval)</label>
          <div className="actions"><button className="btn primary" type="submit">Add fact</button></div>
        </form>
      ) : <div className="notice wn">Only owners and admins can edit knowledge.</div>}
      <div className="card">
        {facts.length === 0 && <div className="empty">No facts yet. Add your first FAQ above.</div>}
        {facts.map((f) => (
          <div className="row col" key={f.id}>
            <div><span className={`tag ${tag(f.status)}`}>{f.status === "pending" ? "Needs review" : f.status}</span>{" "}
              {f.high_impact && <span className="tag wn">High impact</span>}</div>
            <div><b>{f.keywords}</b><br />{f.answer}</div>
            {canEdit && (
              <div className="actions">
                {(["approved", "rejected"] as const).map((s) => (
                  <form key={s} action={setFactStatus}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="status" value={s} />
                    <button className="btn" type="submit">{s === "approved" ? "Approve" : "Reject"}</button></form>
                ))}
                <form action={deleteFact}><input type="hidden" name="id" value={f.id} /><button className="btn" type="submit">Delete</button></form>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
