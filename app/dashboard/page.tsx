import { requireBusiness } from "@/lib/tenant/context";
import { completeTask } from "./actions";

export default async function Overview() {
  const { supabase, active } = await requireBusiness();
  const head = (t: string) => supabase.from(t).select("id", { count: "exact", head: true }).eq("business_id", active.id);
  const [calls, leads, ok, pending, gaps, tasks, gapRows, taskRows] = await Promise.all([
    head("calls"), head("leads"), head("facts").eq("status", "approved"), head("facts").eq("status", "pending"),
    head("knowledge_gaps"), head("callback_tasks").eq("status", "open"),
    supabase.from("knowledge_gaps").select("question").eq("business_id", active.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("callback_tasks").select("id, note, created_at").eq("business_id", active.id).eq("status", "open").order("created_at", { ascending: false }).limit(5),
  ]);
  const stats: [number | null, string][] = [
    [calls.count, "Calls handled"], [leads.count, "Leads captured"],
    [ok.count, `Approved facts${pending.count ? ` (${pending.count} awaiting review)` : ""}`],
    [gaps.count, "Unanswered questions"], [tasks.count, "Open callback tasks"],
  ];
  return (
    <>
      <h1>{active.name}</h1>
      <p className="sub">Your role: {active.role}. Everything here belongs to this business only.</p>
      <div className="grid">
        {stats.map(([n, l]) => <div className="card" key={l}><div className="big">{n ?? 0}</div><div className="lbl">{l}</div></div>)}
      </div>
      <div className="two">
        <div className="card"><b>Knowledge gaps</b>
          {(gapRows.data as { question: string }[] | null)?.length
            ? (gapRows.data as { question: string }[]).map((g, i) => <div className="row" key={i}>“{g.question}”</div>)
            : <div className="empty">None yet. Questions the receptionist could not confirm appear here.</div>}
        </div>
        <div className="card"><b>Callback tasks</b>
          {(taskRows.data as { id: string; note: string }[] | null)?.length
            ? (taskRows.data as { id: string; note: string }[]).map((t) => (
              <form className="row" key={t.id} action={completeTask}>
                <span>{t.note}</span><input type="hidden" name="id" value={t.id} />
                <button className="btn" type="submit">Done</button>
              </form>))
            : <div className="empty">No open tasks.</div>}
        </div>
      </div>
    </>
  );
}
