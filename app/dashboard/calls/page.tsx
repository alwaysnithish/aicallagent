import { requireBusiness } from "@/lib/tenant/context";

type C = { id: string; source: string; started_at: string; duration_seconds: number; outcome: string; summary: string | null };

export default async function Calls() {
  const { supabase, active } = await requireBusiness();
  const { data } = await supabase.from("calls").select("id, source, started_at, duration_seconds, outcome, summary")
    .eq("business_id", active.id).order("started_at", { ascending: false }).limit(100);
  const calls = (data ?? []) as C[];
  return (
    <>
      <h1>Calls</h1>
      <p className="sub">Summary and outcome for every call (latest 100).</p>
      <div className="card tw">
        {calls.length === 0 ? <div className="empty">No calls yet. End a test call to save it here.</div> : (
          <table><thead><tr><th>Time</th><th>Source</th><th>Length</th><th>Outcome</th><th>Summary</th></tr></thead><tbody>
            {calls.map((c) => (
              <tr key={c.id}><td>{new Date(c.started_at).toLocaleString("en-IN")}</td><td>{c.source}</td><td>{c.duration_seconds}s</td>
                <td><span className={`tag ${c.outcome === "Answered" || c.outcome === "Lead captured" ? "ok" : "wn"}`}>{c.outcome}</span></td>
                <td>{c.summary}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </>
  );
}
