import { requireBusiness } from "@/lib/tenant/context";
import { publishSettings } from "../actions";

type S = { persona: string; greeting: string; hours: string | null; language: string; handoff_number: string | null; version: number };

export default async function Receptionist() {
  const { supabase, active } = await requireBusiness();
  const canEdit = active.role !== "member";
  const { data } = await supabase.from("receptionist_settings")
    .select("persona, greeting, hours, language, handoff_number, version").eq("business_id", active.id).single();
  const s = data as S;
  return (
    <>
      <h1>Receptionist</h1>
      <p className="sub">Published version {s.version}. Phone numbers and booking rules are on the &quot;Phone &amp; booking&quot; tab.</p>
      <form className="card" action={publishSettings}>
        <fieldset disabled={!canEdit} style={{ border: 0, padding: 0, margin: 0 }}>
          <label htmlFor="persona">Receptionist name</label><input id="persona" name="persona" defaultValue={s.persona} maxLength={40} required />
          <label htmlFor="greeting">Greeting</label><input id="greeting" name="greeting" defaultValue={s.greeting} maxLength={300} required />
          <label htmlFor="hours">Business hours (spoken text)</label><input id="hours" name="hours" defaultValue={s.hours ?? ""} maxLength={120} />
          <label htmlFor="handoff">Human handoff number</label><input id="handoff" name="handoff" defaultValue={s.handoff_number ?? ""} maxLength={30} />
          <label htmlFor="language">Language</label>
          <select id="language" name="language" defaultValue={s.language}>{["English", "Hindi", "Telugu"].map((l) => <option key={l}>{l}</option>)}</select>
          {canEdit && <div className="actions"><button className="btn primary" type="submit">Publish new version</button></div>}
        </fieldset>
      </form>
      <div className="card">
        <b>Safety rules (always on)</b>
        <div className="row">Answers only from approved facts. Never invents fees, dates or policies.</div>
        <div className="row">Says it cannot confirm when no approved answer exists, then offers a callback.</div>
        <div className="row">Cannot see any other business&apos;s data.</div>
      </div>
    </>
  );
}
