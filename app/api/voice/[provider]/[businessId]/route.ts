import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/voice";
import { rateLimit } from "@/lib/ratelimit";
import { startSession, handleTurn, endSession } from "@/lib/receptionist/engine";

export const dynamic = "force-dynamic";
const deny = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function POST(req: Request, ctx: { params: Promise<{ provider: string; businessId: string }> }) {
  const { provider, businessId } = await ctx.params;
  const p = getProvider(provider);
  if (!p || !z.string().uuid().safeParse(businessId).success) return deny();

  const raw = await req.text();
  if (raw.length > 10_000) return NextResponse.json({ error: "too large" }, { status: 413 });

  let db;
  try { db = createAdminClient(); } catch { return NextResponse.json({ error: "not configured" }, { status: 503 }); }

  const { data } = await db.from("voice_secrets").select("secret").eq("business_id", businessId).maybeSingle();
  if (!data || !p.verify(raw, req.headers, (data as { secret: string }).secret)) return deny();

  let ev;
  try { ev = p.parse(raw); } catch { return NextResponse.json({ error: "bad request" }, { status: 400 }); }
  if (!rateLimit(`voice:${businessId}:${ev.callId}`, 60, 60_000)) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  const key = `voice:${ev.callId}`;
  try {
    if (ev.type === "start") return NextResponse.json(p.formatReply(await startSession(db, businessId, key)));
    if (ev.type === "end") { await endSession(db, businessId, key, "phone"); return NextResponse.json({ ok: true }); }
    if (!ev.text) return NextResponse.json({ error: "text required" }, { status: 400 });
    const turn = await handleTurn(db, businessId, key, ev.text);
    return NextResponse.json(p.formatReply(turn.reply));
  } catch (e) {
    console.error("voice webhook error", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
