import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env/public";
import { rateLimit } from "@/lib/ratelimit";
import { verifyTwilioSignature, gatherTwiml, sayAndHangupTwiml, emptyTwiml, twilioLang } from "@/lib/voice/providers/twilio";
import { nextTurn } from "@/lib/outbound/agent";
import { isDncRequest } from "@/lib/outbound/pure";
import type { OutState } from "@/lib/outbound/types";
import type { Fact } from "@/lib/knowledge/retrieve";

export const dynamic = "force-dynamic";
const xml = (b: string, status = 200) => new NextResponse(b, { status, headers: { "Content-Type": "text/xml" } });

/** Twilio fetches this when the callee answers an outbound call, and again after each spoken reply. */
export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return xml(sayAndHangupTwiml("Service is not configured."), 503);
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const u = new URL(req.url);
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}${u.pathname}${u.search}`;
  if (!verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature") ?? "", token)) return xml(emptyTwiml, 403);
  const contactId = u.searchParams.get("contact");
  const sid = params.CallSid;
  if (!z.string().uuid().safeParse(contactId).success || !sid) return xml(emptyTwiml, 400);
  if (!rateLimit(`out:${sid}`, 60, 60_000)) return xml(emptyTwiml, 429);

  try {
    const db = createAdminClient();
    const { data: ct } = await db.from("contacts").select("id, business_id, campaign_id, name, phone, status").eq("id", contactId!).maybeSingle();
    const c = ct as { id: string; business_id: string; campaign_id: string; name: string | null; phone: string; status: string } | null;
    if (!c) return xml(sayAndHangupTwiml("Goodbye."));
    const { data: dnc } = await db.from("dnc_numbers").select("phone").eq("business_id", c.business_id).eq("phone", c.phone).maybeSingle();
    if (dnc || c.status === "dnc") return xml(sayAndHangupTwiml("Goodbye."));

    const { data: cp } = await db.from("campaigns").select("goal, language, agent_name, company_name").eq("id", c.campaign_id).single();
    const camp = cp as { goal: string; language: string; agent_name: string; company_name: string | null };
    const { data: bz } = await db.from("businesses").select("name").eq("id", c.business_id).single();
    const company = camp.company_name || (bz as { name: string }).name;
    const lang = twilioLang(camp.language);

    const key = `out:${sid}`;
    const { data: ss } = await db.from("call_sessions").select("state").eq("business_id", c.business_id).eq("session_key", key).maybeSingle();
    const state: OutState = (ss as { state: OutState } | null)?.state ?? { history: [], outcome: null, captured: {}, turns: 0 };
    const save = () => db.from("call_sessions").upsert(
      { business_id: c.business_id, session_key: key, state, updated_at: new Date().toISOString() }, { onConflict: "business_id,session_key" });

    const speech = params.SpeechResult?.trim();
    if (speech) {
      state.history.push({ r: "u", x: speech.slice(0, 400) });
      if (isDncRequest(speech)) {
        state.outcome = "dnc"; state.turns++; await save();
        return xml(sayAndHangupTwiml("Understood. We will not call you again. Goodbye.", "en-IN"));
      }
    }
    state.turns++;

    const { data: fr } = await db.from("facts").select("keywords, answer").eq("business_id", c.business_id).eq("status", "approved").limit(100);
    const t = await nextTurn({
      agent: camp.agent_name, company, language: camp.language, goal: camp.goal, contactName: c.name,
      facts: (fr ?? []) as Fact[], history: state.history, turnNo: state.turns,
    });

    let say: string, end = false;
    if (!t) {
      say = state.history.length ? "Thank you. A member of our team will call you back." : `Hello, this is ${camp.agent_name} from ${company}, an automated assistant. Our team will call you shortly.`;
      state.outcome ??= "callback"; end = true;
    } else {
      say = t.say;
      if (t.outcome) state.outcome = t.outcome;
      Object.assign(state.captured, t.captured);
      end = t.end || state.turns >= 14 || t.outcome === "dnc";
    }
    state.history.push({ r: "a", x: say });
    await save();
    return end ? xml(sayAndHangupTwiml(say, lang)) : xml(gatherTwiml(say, url, lang));
  } catch (e) {
    console.error("outbound webhook error", e instanceof Error ? e.message : e);
    return xml(sayAndHangupTwiml("Sorry, something went wrong. Goodbye."));
  }
}
