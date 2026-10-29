import Link from "next/link";
import { requireBusiness } from "@/lib/tenant/context";
import { createCampaign } from "../outbound-actions";

type C = { id: string; name: string; status: string; language: string; created_at: string };
const LANGS = ["Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "English"];
const tone = (s: string) => (s === "running" ? "ok" : s === "paused" ? "wn" : "");

export default async function Campaigns() {
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const { data } = await supabase.from("campaigns").select("id, name, status, language, created_at").eq("business_id", active.id).order("created_at", { ascending: false });
  const list = (data ?? []) as C[];
  const counts = await Promise.all(list.map(async (c) => {
    const [t, i] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", c.id),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("last_outcome", ["interested", "booked"]),
    ]);
    return [t.count ?? 0, i.count ?? 0] as const;
  }));
  return (
    <>
      <h1>Campaigns</h1>
      <p className="sub">AI telecallers that phone your leads and lists, then report every outcome.</p>
      <div className="card tw">
        {list.length === 0 ? <div className="empty">No campaigns yet. Create your first one below.</div> : (
          <table><thead><tr><th>Campaign</th><th>Status</th><th>Language</th><th>Contacts</th><th>Interested</th></tr></thead><tbody>
            {list.map((c, i) => (
              <tr key={c.id}><td><Link href={`/dashboard/campaigns/${c.id}`}><b>{c.name}</b></Link></td>
                <td><span className={`tag ${tone(c.status)}`}>{c.status}</span></td><td>{c.language}</td><td>{counts[i][0]}</td><td>{counts[i][1]}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
      {canEdit ? (
        <form className="card" action={createCampaign}>
          <b>New campaign</b>
          <label htmlFor="name">Name</label><input id="name" name="name" required maxLength={80} placeholder="Site-visit follow-up" />
          <label htmlFor="goal">What should the AI do on each call?</label>
          <textarea id="goal" name="goal" rows={3} required minLength={10} maxLength={1500}
            placeholder="Confirm the person enquired about a 2BHK, ask if it is to live in or invest, note their budget, and offer a site visit this Saturday at 11 AM." />
          <div className="actions">
            <div><label htmlFor="language">Language</label><select id="language" name="language" defaultValue="Hindi">{LANGS.map((l) => <option key={l}>{l}</option>)}</select></div>
            <div><label htmlFor="agent_name">Agent name</label><input id="agent_name" name="agent_name" defaultValue="Meera" maxLength={30} required /></div>
            <div><label htmlFor="company_name">Spoken company name</label><input id="company_name" name="company_name" defaultValue={active.name} maxLength={80} /></div>
          </div>
          <div className="actions">
            <div><label htmlFor="call_start">Calls from</label><input id="call_start" name="call_start" defaultValue="10:00" pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
            <div><label htmlFor="call_end">Calls until</label><input id="call_end" name="call_end" defaultValue="19:00" pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
            <div><label htmlFor="max_concurrent">Calls at once</label><input id="max_concurrent" name="max_concurrent" type="number" min={1} max={20} defaultValue={3} required /></div>
            <div><label htmlFor="max_attempts">Max attempts</label><input id="max_attempts" name="max_attempts" type="number" min={1} max={6} defaultValue={3} required /></div>
            <div><label htmlFor="retry_minutes">Retry after (min)</label><input id="retry_minutes" name="retry_minutes" type="number" min={5} max={2880} defaultValue={120} required /></div>
          </div>
          <div className="actions"><button className="btn primary" type="submit">Create campaign</button></div>
        </form>
      ) : <div className="notice wn">Only owners and admins can create campaigns.</div>}
    </>
  );
}
