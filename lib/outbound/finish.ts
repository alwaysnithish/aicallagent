import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OutState } from "./types";
import { deliverOutcome } from "./webhook";
import { label } from "./labels";
import { ratePaise } from "./rate";

type DB = SupabaseClient;

/** Called when Twilio reports an outbound call has ended. Idempotent per CallSid. */
export async function finishOutboundCall(db: DB, contactId: string, p: { sid: string; status: string; durationSec: number }) {
  const { data: ct } = await db.from("contacts").select("id, business_id, campaign_id, name, phone, attempts").eq("id", contactId).maybeSingle();
  const c = ct as { id: string; business_id: string; campaign_id: string; name: string | null; phone: string; attempts: number } | null;
  if (!c) return;
  const { data: cp } = await db.from("campaigns").select("name, max_attempts, retry_minutes, outcome_webhook").eq("id", c.campaign_id).single();
  const camp = cp as { name: string; max_attempts: number; retry_minutes: number; outcome_webhook: string | null };
  const key = `out:${p.sid}`;
  const { data: ss } = await db.from("call_sessions").select("state").eq("business_id", c.business_id).eq("session_key", key).maybeSingle();
  const st = (ss as { state: OutState } | null)?.state;

  const spoke = (st?.turns ?? 0) > 0 && p.status === "completed";
  let outcome: string | null = st?.outcome ?? null;
  let status: string, last: string, retry = false;
  if (outcome) { status = outcome === "dnc" ? "dnc" : "done"; last = outcome; }
  else if (spoke) { status = "done"; last = "no_decision"; outcome = "no_decision"; }
  else if (c.attempts >= camp.max_attempts) { status = "done"; last = "no_answer"; outcome = "no_answer"; }
  else { status = "pending"; last = p.status; retry = true; outcome = p.status; }

  const captured = st?.captured ?? {};
  const summary = [label(outcome), ...Object.entries(captured).map(([k, v]) => `${k}: ${v}`)].join(". ");
  const { error: callErr } = await db.from("calls").insert({
    business_id: c.business_id, source: "phone", direction: "outbound", campaign_id: c.campaign_id, contact_id: c.id,
    external_id: p.sid, started_at: new Date(Date.now() - p.durationSec * 1000).toISOString(), duration_seconds: p.durationSec,
    outcome: label(outcome), summary, transcript: st?.history ?? null,
  });
  if (callErr) { if ((callErr as { code?: string }).code === "23505") return; throw new Error(callErr.message); }

  await db.from("contacts").update({
    status, last_outcome: last, ...(retry ? { next_attempt_at: new Date(Date.now() + camp.retry_minutes * 60000).toISOString() } : {}),
  }).eq("id", c.id);

  if (p.durationSec > 0) {
    await db.rpc("wallet_debit", { p_business: c.business_id, p_amount: Math.ceil(p.durationSec / 60) * ratePaise(), p_reason: "outbound call", p_ref: `call:${p.sid}` });
  }
  if (outcome === "dnc") await db.from("dnc_numbers").upsert({ business_id: c.business_id, phone: c.phone, reason: "asked on call" }, { onConflict: "business_id,phone", ignoreDuplicates: true });
  if (outcome === "interested" || outcome === "booked" || outcome === "callback") {
    await db.from("leads").upsert({ business_id: c.business_id, name: c.name ?? "Unknown", phone: c.phone.replace(/\D/g, ""), interest: camp.name, stage: "New" },
      { onConflict: "business_id,phone", ignoreDuplicates: true });
  }
  await db.from("call_sessions").delete().eq("business_id", c.business_id).eq("session_key", key);

  if (camp.outcome_webhook && !retry) {
    const { data: sec } = await db.from("campaign_secrets").select("webhook_secret").eq("campaign_id", c.campaign_id).maybeSingle();
    if (sec) {
      await deliverOutcome(camp.outcome_webhook, (sec as { webhook_secret: string }).webhook_secret, {
        event: "call.completed", campaign_id: c.campaign_id, call_id: p.sid, contact: { id: c.id, name: c.name, phone: c.phone },
        outcome, captured, summary, duration_seconds: p.durationSec,
      });
    }
  }
}
