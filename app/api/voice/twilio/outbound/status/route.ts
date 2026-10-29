import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env/public";
import { verifyTwilioSignature } from "@/lib/voice/providers/twilio";
import { finishOutboundCall } from "@/lib/outbound/finish";

export const dynamic = "force-dynamic";
const TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  const u = new URL(req.url);
  if (!verifyTwilioSignature(`${publicEnv.NEXT_PUBLIC_APP_URL}${u.pathname}${u.search}`, params, req.headers.get("x-twilio-signature") ?? "", token))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const contactId = u.searchParams.get("contact");
  if (!z.string().uuid().safeParse(contactId).success || !params.CallSid) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (!TERMINAL.has(params.CallStatus ?? "")) return NextResponse.json({ ok: true });
  try {
    await finishOutboundCall(createAdminClient(), contactId!, {
      sid: params.CallSid, status: params.CallStatus, durationSec: Math.max(0, Math.min(14400, parseInt(params.CallDuration ?? "0", 10) || 0)),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("outbound status error", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
