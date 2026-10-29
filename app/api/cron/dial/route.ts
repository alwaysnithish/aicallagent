import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dialCampaign } from "@/lib/outbound/dialer";
import { safeEqual } from "@/lib/outbound/pure";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createAdminClient();
  const { data } = await db.from("campaigns").select("id").eq("status", "running").limit(200);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  let dialed = 0;
  for (const id of ids) {
    try { dialed += (await dialCampaign(db, id)).dialed; } catch (e) { console.error("dial campaign error", id, e instanceof Error ? e.message : e); }
  }
  return NextResponse.json({ campaigns: ids.length, dialed });
}
export const GET = run;
export const POST = run;
