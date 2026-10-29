import { notFound } from "next/navigation";
import { z } from "zod";
import { requireBusiness } from "@/lib/tenant/context";
import { configStatus } from "@/lib/env/server";
import { publicEnv } from "@/lib/env/public";
import { label, tone } from "@/lib/outbound/labels";
import { ratePaise } from "@/lib/outbound/rate";
import { saveCampaign, setCampaignStatus, uploadContacts, rotateSecret } from "../../outbound-actions";

type Camp = { id: string; name: string; goal: string; language: string; agent_name: string; company_name: string | null; status: string; call_start: string; call_end: string; max_concurrent: number; max_attempts: number; retry_minutes: number; outcome_webhook: string | null };
type Contact = { id: string; name: string | null; phone: string; status: string; attempts: number; last_outcome: string | null };
type Call = { id: string; started_at: string; duration_seconds: number; outcome: string; summary: string | null; transcript: { r: string; x: string }[] | null };
const LANGS = ["Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "English"];
const mask = (p: string) => p.slice(0, 4) + "••••" + p.slice(-3);

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string; skipped?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const { data } = await supabase.from("campaigns").select("*").eq("id", id).eq("business_id", active.id).maybeSingle();
  if (!data) notFound();
  const c = data as Camp;

  const head = () => supabase.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", id);
  const [total, pending, calling, dnc, interested, booked, callback, notInt, noAns, contacts, calls, nums, wallet, sec] = await Promise.all([
    head(), head().eq("status", "pending"), head().eq("status", "calling"), head().eq("status", "dnc"),
    head().eq("last_outcome", "interested"), head().eq("last_outcome", "booked"), head().eq("last_outcome", "callback"),
    head().eq("last_outcome", "not_interested"), head().eq("last_outcome", "no_answer"),
    supabase.from("contacts").select("id, name, phone, status, attempts, last_outcome").eq("campaign_id", id).order("created_at", { ascending: false }).limit(100),
    supabase.from("calls").select("id, started_at, duration_seconds, outcome, summary, transcript").eq("campaign_id", id).order("started_at", { ascending: false }).limit(15),
    supabase.from("phone_numbers").select("number").eq("business_id", active.id).limit(1),
    canEdit ? supabase.from("business_wallets").select("balance_paise").eq("business_id", active.id).maybeSingle() : Promise.resolve({ data: null }),
    canEdit ? supabase.from("campaign_secrets").select("webhook_secret, intake_secret").eq("campaign_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const T = total.count ?? 0, P = pending.count ?? 0, K = calling.count ?? 0;
  const called = T - P - K;
  const win = (interested.count ?? 0) + (booked.count ?? 0);
  const balance = ((wallet.data as { balance_paise: number } | null)?.balance_paise ?? 0) / 100;
  const cfg = configStatus();
  const s = sec.data as { webhook_secret: string; intake_secret: string } | null;
  const app = publicEnv.NEXT_PUBLIC_APP_URL;
  const warn: string[] = [];
  if (!cfg.outbound) warn.push("Server is missing Twilio account SID/token, Gemini key or Supabase service key.");
  if (!(nums.data as unknown[] | null)?.length) warn.push("Connect a phone number under Phone & booking.");
  if (canEdit && balance * 100 < ratePaise()) warn.push("Wallet is empty. Add credits on the Wallet page.");
  const bar = (n: number) => `${T ? Math.round((n / T) * 100) : 0}%`;
  const stats: [string, number][] = [["Contacts", T], ["Called", called], ["Interested", win], ["Call back", callback.count ?? 0], ["Not interested", notInt.count ?? 0], ["No answer", noAns.count ?? 0], ["Do not call", dnc.count ?? 0]];

  return (
    <>
      <div className="bar" style={{ justifyContent: "space-between" }}>
        <div><h1>{c.name}</h1><p className="sub">{c.language} · {c.agent_name} · {c.call_start.slice(0, 5)}–{c.call_end.slice(0, 5)} · <span className={`tag ${c.status === "running" ? "ok" : c.status === "paused" ? "wn" : ""}`}>{c.status}</span></p></div>
        {canEdit && (
          <form action={setCampaignStatus} className="bar"><input type="hidden" name="id" value={c.id} />
            {c.status !== "running" && <button className="btn primary" name="status" value="running" type="submit">{c.status === "paused" ? "Resume" : "Start calling"}</button>}
            {c.status === "running" && <button className="btn" name="status" value="paused" type="submit">Pause</button>}
          </form>
        )}
      </div>
      {sp.added && <div className="notice ok">Added {sp.added} contacts. Skipped {sp.skipped ?? 0} (invalid, duplicate or on your do-not-call list).</div>}
      {warn.map((w) => <div className="notice wn" key={w}>{w}</div>)}

      <div className="grid">{stats.map(([l, n]) => <div className="card" key={l}><div className="big">{n}</div><div className="lbl">{l}</div></div>)}</div>
      <div className="card"><b>Progress</b><div className="meter"><i style={{ width: bar(called) }} /></div>
        <span className="mut">{called} of {T} contacts called · {P} waiting · {K} on a call now{win ? ` · ${win} interested` : ""}</span></div>

      {canEdit && (
        <form className="card" action={uploadContacts}>
          <b>Add contacts</b>
          <p className="mut">CSV with rows like <code>name,phone</code>. 10-digit Indian numbers are fine. Up to 5,000 per upload.</p>
          <input type="hidden" name="id" value={c.id} />
          <label htmlFor="file">CSV file</label><input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" />
          <label htmlFor="paste">…or paste rows</label><textarea id="paste" name="paste" rows={3} placeholder={"Aman Verma,9876543210\nRiya Shah,9123456789"} />
          <label><input type="checkbox" name="consent" style={{ width: "auto" }} /> I confirm these people agreed to receive calls or have an existing relationship with us.</label>
          <div className="actions"><button className="btn primary" type="submit">Upload contacts</button></div>
        </form>
      )}

      <div className="card tw"><b>Contacts</b>
        {(contacts.data as Contact[] | null)?.length ? (
          <table><thead><tr><th>Name</th><th>Phone</th><th>Status</th><th>Attempts</th><th>Last outcome</th></tr></thead><tbody>
            {(contacts.data as Contact[]).map((r) => (
              <tr key={r.id}><td>{r.name ?? "—"}</td><td>{canEdit ? r.phone : mask(r.phone)}</td><td>{r.status}</td><td>{r.attempts}</td>
                <td><span className={`tag ${tone(r.last_outcome)}`}>{label(r.last_outcome)}</span></td></tr>
            ))}
          </tbody></table>
        ) : <div className="empty">No contacts yet.</div>}
      </div>

      <div className="card"><b>Recent calls</b>
        {(calls.data as Call[] | null)?.length ? (calls.data as Call[]).map((k) => (
          <details className="row col" key={k.id}>
            <summary>{new Date(k.started_at).toLocaleString("en-IN")} · {k.duration_seconds}s · <span className={`tag ${tone(k.outcome.toLowerCase().replace(/ /g, "_"))}`}>{k.outcome}</span> {k.summary}</summary>
            {(k.transcript ?? []).map((m, i) => <div key={i} className={`bubble ${m.r}`}>{m.x}</div>)}
          </details>
        )) : <div className="empty">Calls appear here with full transcripts.</div>}
      </div>

      {canEdit && (
        <>
          <form className="card" action={saveCampaign}>
            <b>Campaign settings</b><input type="hidden" name="id" value={c.id} />
            <label htmlFor="name">Name</label><input id="name" name="name" defaultValue={c.name} required maxLength={80} />
            <label htmlFor="goal">Goal for the AI</label><textarea id="goal" name="goal" rows={3} defaultValue={c.goal} required minLength={10} maxLength={1500} />
            <div className="actions">
              <div><label htmlFor="language">Language</label><select id="language" name="language" defaultValue={c.language}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select></div>
              <div><label htmlFor="agent_name">Agent</label><input id="agent_name" name="agent_name" defaultValue={c.agent_name} maxLength={30} required /></div>
              <div><label htmlFor="company_name">Company</label><input id="company_name" name="company_name" defaultValue={c.company_name ?? ""} maxLength={80} /></div>
            </div>
            <div className="actions">
              <div><label htmlFor="call_start">From</label><input id="call_start" name="call_start" defaultValue={c.call_start.slice(0, 5)} pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
              <div><label htmlFor="call_end">Until</label><input id="call_end" name="call_end" defaultValue={c.call_end.slice(0, 5)} pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
              <div><label htmlFor="max_concurrent">At once</label><input id="max_concurrent" name="max_concurrent" type="number" min={1} max={20} defaultValue={c.max_concurrent} required /></div>
              <div><label htmlFor="max_attempts">Attempts</label><input id="max_attempts" name="max_attempts" type="number" min={1} max={6} defaultValue={c.max_attempts} required /></div>
              <div><label htmlFor="retry_minutes">Retry (min)</label><input id="retry_minutes" name="retry_minutes" type="number" min={5} max={2880} defaultValue={c.retry_minutes} required /></div>
            </div>
            <label htmlFor="outcome_webhook">Send every call outcome to (https URL, optional)</label>
            <input id="outcome_webhook" name="outcome_webhook" defaultValue={c.outcome_webhook ?? ""} maxLength={300} placeholder="https://yourapp.com/hooks/vaachak" />
            <div className="actions"><button className="btn primary" type="submit">Save settings</button></div>
          </form>

          <div className="card"><b>API: send leads in, get outcomes out</b>
            <p className="mut">Each lead posted here is queued and called within seconds (if the campaign is running and inside calling hours). By sending leads you confirm they consented to be called.</p>
            <div className="row col"><code>POST {app}/api/v1/intake/{c.id}</code>
              <code>x-vaachak-secret: {s?.intake_secret ?? "—"}</code><code>{`{"phone":"+919876543210","name":"Aman"}`}</code></div>
            <p className="mut">Outcome webhooks carry <code>x-vaachak-timestamp</code> and <code>x-vaachak-signature</code> = hex HMAC-SHA256 of <code>timestamp.body</code> with this secret:</p>
            <div className="row col"><code>{s?.webhook_secret ?? "—"}</code></div>
            <div className="actions">
              {(["intake_secret", "webhook_secret"] as const).map((w) => (
                <form key={w} action={rotateSecret}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="which" value={w} />
                  <button className="btn" type="submit">Rotate {w === "intake_secret" ? "intake" : "webhook"} secret</button></form>))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
