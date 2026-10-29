import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rankFacts, type Fact } from "@/lib/knowledge/retrieve";
import { phraseAnswer } from "@/lib/ai/gemini";
import { nextSlots, formatSlot } from "@/lib/appointments/slots";

/**
 * Channel-independent receptionist brain. Works with the signed-in user's client (RLS applies)
 * or the admin client (webhooks; every query filters by business_id explicitly).
 */
type DB = SupabaseClient;
export type State = {
  step: null | "name" | "phone" | "slot"; book: boolean; slots: string[];
  lead: { name?: string; phone?: string; interest?: string }; outcome: string; notes: string[];
};
export type Turn = { reply: string; source: "approved_fact" | "gemini" | null };
const fresh = (): State => ({ step: null, book: false, slots: [], lead: {}, outcome: "Answered", notes: [] });

function must<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

export type Settings = {
  persona: string; greeting: string; language: string; handoff_number: string | null; monthly_minute_limit: number;
  timezone: string; open_time: string; close_time: string; work_days: number[]; slot_minutes: number; booking_enabled: boolean;
};
export async function getSettings(db: DB, businessId: string) {
  return must(
    await db.from("receptionist_settings")
      .select("persona, greeting, language, handoff_number, monthly_minute_limit, timezone, open_time, close_time, work_days, slot_minutes, booking_enabled")
      .eq("business_id", businessId).single(),
  ) as Settings;
}

export async function usedSecondsThisMonth(db: DB, businessId: string) {
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const rows = must(
    await db.from("calls").select("duration_seconds").eq("business_id", businessId).gte("started_at", start.toISOString()),
  ) as { duration_seconds: number }[] | null;
  return (rows ?? []).reduce((a, r) => a + r.duration_seconds, 0);
}

export async function startSession(db: DB, businessId: string, key: string) {
  const s = await getSettings(db, businessId);
  const now = new Date().toISOString();
  must(await db.from("call_sessions").upsert(
    { business_id: businessId, session_key: key, state: fresh(), started_at: now, updated_at: now },
    { onConflict: "business_id,session_key" },
  ));
  return s.greeting;
}

async function load(db: DB, businessId: string, key: string) {
  const r = await db.from("call_sessions").select("state, started_at")
    .eq("business_id", businessId).eq("session_key", key).maybeSingle();
  return must(r) as { state: State; started_at: string } | null;
}
export async function sessionExists(db: DB, businessId: string, key: string) {
  return (await load(db, businessId, key)) !== null;
}

function parsePick(t: string): number | null {
  const s = t.toLowerCase();
  if (/\b(none|no|neither|cancel|nothing)\b/.test(s)) return -1;
  if (/\b(1|one|first)\b/.test(s)) return 0;
  if (/\b(2|two|second)\b/.test(s)) return 1;
  if (/\b(3|three|third)\b/.test(s)) return 2;
  return null;
}

export async function handleTurn(db: DB, businessId: string, key: string, rawText: string): Promise<Turn> {
  const text = rawText.trim().slice(0, 500);
  if (!text) return { reply: "Sorry, I did not catch that.", source: null };

  const settings = await getSettings(db, businessId);
  let sess = await load(db, businessId, key);
  if (!sess) { await startSession(db, businessId, key); sess = await load(db, businessId, key); }
  const state: State = { ...fresh(), ...(sess!.state ?? {}) };
  const save = async () =>
    must(await db.from("call_sessions").update({ state, updated_at: new Date().toISOString() })
      .eq("business_id", businessId).eq("session_key", key));
  const say = async (reply: string, source: Turn["source"] = null): Promise<Turn> => { await save(); return { reply, source }; };

  if ((await usedSecondsThisMonth(db, businessId)) / 60 >= settings.monthly_minute_limit) {
    state.outcome = "Over plan limit";
    return say("Sorry, we cannot take your call right now. Please try again later.");
  }

  async function offerSlots(prefix = ""): Promise<Turn> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 15 * 86400000);
    const busy = (must(await db.from("appointments").select("starts_at").eq("business_id", businessId)
      .eq("status", "booked").gte("starts_at", now.toISOString()).lte("starts_at", horizon.toISOString())) ?? []) as { starts_at: string }[];
    const slots = nextSlots(
      { timezone: settings.timezone, open: settings.open_time, close: settings.close_time, days: settings.work_days, slotMinutes: settings.slot_minutes },
      busy.map((b) => new Date(b.starts_at)), now, 3,
    );
    if (!slots.length) {
      must(await db.from("callback_tasks").insert({ business_id: businessId, note: `No free slot found for ${state.lead.name} (${state.lead.phone}). Please call to schedule.` }));
      state.step = null; state.outcome = "Lead captured";
      return say("I could not find a free slot right now. Our team will call you back to fix a time.");
    }
    state.slots = slots.map((s) => s.toISOString()); state.step = "slot";
    const list = slots.map((s, i) => `${i + 1}: ${formatSlot(s, settings.timezone)}`).join(". ");
    return say(`${prefix}I have ${list}. Which one would you like? Say 1, 2 or 3, or say none.`);
  }

  // Booking flow
  if (state.step === "name") {
    state.lead.name = text.slice(0, 60); state.step = "phone";
    return say(`Thanks ${state.lead.name}. What phone number can we reach you on?`);
  }
  if (state.step === "phone") {
    const digits = text.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return say("I did not catch a valid phone number. Could you say it again?");
    state.lead.phone = digits;
    must(await db.from("leads").upsert(
      { business_id: businessId, name: state.lead.name ?? "Unknown", phone: digits, interest: state.lead.interest ?? "General enquiry" },
      { onConflict: "business_id,phone", ignoreDuplicates: true },
    ));
    state.notes.push(`Captured lead ${state.lead.name} (${digits}).`);
    if (state.book) return offerSlots();
    state.step = null; state.outcome = "Lead captured";
    return say("Done. A team member will call you back soon.");
  }
  if (state.step === "slot") {
    const pick = parsePick(text);
    if (pick === null || pick >= state.slots.length) return say("Please say 1, 2 or 3, or say none.");
    if (pick === -1) {
      state.step = null; state.outcome = "Lead captured";
      return say("No problem. We will call you back to arrange a time.");
    }
    const start = new Date(state.slots[pick]);
    const end = new Date(start.getTime() + settings.slot_minutes * 60000);
    const { error } = await db.from("appointments").insert({
      business_id: businessId, starts_at: start.toISOString(), ends_at: end.toISOString(),
      customer_name: state.lead.name ?? "Unknown", customer_phone: state.lead.phone ?? "", notes: state.lead.interest ?? null, source: "call",
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return offerSlots("Sorry, that slot was just taken. ");
      throw new Error(error.message);
    }
    state.step = null; state.outcome = "Appointment booked";
    state.notes.push(`Booked ${formatSlot(start, settings.timezone)} for ${state.lead.name}.`);
    return say(`You are booked for ${formatSlot(start, settings.timezone)}. We will see you then.`);
  }

  // Handoff
  if (/human|person|staff|manager|someone|owner/i.test(text)) {
    must(await db.from("callback_tasks").insert({ business_id: businessId, note: "Caller asked for a human. Please call back." }));
    state.outcome = "Human handoff"; state.notes.push("Caller asked for a human; callback task created.");
    const n = settings.handoff_number ? ` You can also reach us on ${settings.handoff_number}.` : "";
    return say(`Of course. I am arranging a callback.${n}`);
  }

  // Booking / callback intent
  if (/book|appointment|callback|call me|quote|visit|slot/i.test(text)) {
    state.step = "name"; state.book = settings.booking_enabled; state.lead.interest = text.slice(0, 80);
    state.notes.push(settings.booking_enabled ? "Caller wanted to book." : "Caller wanted a callback.");
    return say(settings.booking_enabled ? "Happy to help you book. What is your name?" : "Happy to help. I will take a callback request. What is your name?");
  }

  // Knowledge answer: approved facts only
  const facts = (must(
    await db.from("facts").select("keywords, answer").eq("business_id", businessId).eq("status", "approved").limit(300),
  ) ?? []) as Fact[];
  const matches = rankFacts(facts, text).slice(0, 3);

  if (matches.length) {
    const { data: b } = await db.from("businesses").select("name").eq("id", businessId).single();
    const phrased = await phraseAnswer({
      business: (b as { name: string } | null)?.name ?? "the business",
      persona: settings.persona, language: settings.language, question: text, facts: matches,
    });
    if (phrased && phrased !== "NO_ANSWER") {
      state.notes.push(`Answered (AI): "${text.slice(0, 50)}".`);
      return say(phrased, "gemini");
    }
    if (phrased === null) {
      state.notes.push(`Answered (fact): "${text.slice(0, 50)}".`);
      return say(matches[0].answer, "approved_fact");
    }
  }

  must(await db.from("knowledge_gaps").insert({ business_id: businessId, question: text }));
  state.outcome = "Unanswered question"; state.notes.push(`Could not confirm: "${text.slice(0, 60)}".`);
  return say("I cannot confirm that right now. I can arrange a callback from our staff. Would you like that?");
}

export async function endSession(db: DB, businessId: string, key: string, source: "test" | "phone") {
  const sess = await load(db, businessId, key);
  if (!sess) return null;
  const state: State = { ...fresh(), ...(sess.state ?? {}) };
  const seconds = Math.max(1, Math.round((Date.now() - new Date(sess.started_at).getTime()) / 1000));
  must(await db.from("calls").insert({
    business_id: businessId, source, started_at: sess.started_at, duration_seconds: seconds,
    outcome: state.outcome, summary: state.notes.join(" ") || "Caller did not ask anything.",
  }));
  must(await db.from("call_sessions").delete().eq("business_id", businessId).eq("session_key", key));
  return { seconds, outcome: state.outcome };
}
