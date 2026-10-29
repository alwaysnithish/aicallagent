import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env/public";
import { rateLimit } from "@/lib/ratelimit";
import { startSession, handleTurn, endSession, sessionExists, getSettings } from "@/lib/receptionist/engine";
import { verifyTwilioSignature, gatherTwiml, sayAndHangupTwiml, emptyTwiml, twilioLang } from "@/lib/voice/providers/twilio";

export const dynamic = "force-dynamic";
const xml = (body: string, status = 200) => new NextResponse(body, { status, headers: { "Content-Type": "text/xml" } });
const ENDED = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

/**
 * One webhook for ALL Twilio numbers. Set it as "A call comes in" (POST) and as the
 * "Call status changes" URL on each number. The called number identifies the business.
 */
export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return xml(sayAndHangupTwiml("Phone service is not configured."), 503);

  const raw = await req.text();
  if (raw.length > 20_000) return xml(emptyTwiml, 413);
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const url = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/voice/twilio`;
  if (!verifyTwilioSignature(url, params, req.headers.get("x-twilio-signature") ?? "", token)) return xml(emptyTwiml, 403);

  const sid = params.CallSid;
  if (!sid || !rateLimit(`twilio:${sid}`, 60, 60_000)) return xml(emptyTwiml, 429);

  let db;
  try { db = createAdminClient(); } catch { return xml(sayAndHangupTwiml("Phone service is not configured."), 503); }

  try {
    const { data } = await db.from("phone_numbers").select("business_id").eq("number", params.To ?? "").maybeSingle();
    if (!data) return xml(sayAndHangupTwiml("This number is not configured. Goodbye."));
    const businessId = (data as { business_id: string }).business_id;
    const key = `voice:${sid}`;

    if (ENDED.has(params.CallStatus ?? "")) { await endSession(db, businessId, key, "phone"); return xml(emptyTwiml); }

    const settings = await getSettings(db, businessId);
    const lang = twilioLang(settings.language);
    if (!params.SpeechResult) {
      if (!(await sessionExists(db, businessId, key))) return xml(gatherTwiml(await startSession(db, businessId, key), url, lang));
      return xml(gatherTwiml("Sorry, I did not catch that. Could you repeat?", url, lang));
    }
    const turn = await handleTurn(db, businessId, key, params.SpeechResult);
    return xml(gatherTwiml(turn.reply, url, lang));
  } catch (e) {
    console.error("twilio webhook error", e instanceof Error ? e.message : e);
    return xml(sayAndHangupTwiml("Sorry, something went wrong. Please call again later."));
  }
}
