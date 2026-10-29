import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env/public";
import { placeCall } from "./twilio-rest";
import { withinCallingHours, localMinutes } from "./pure";
import { ratePaise } from "./rate";

type DB = SupabaseClient;
type Camp = { id: string; business_id: string; status: string; call_start: string; call_end: string; max_concurrent: number; max_attempts: number; retry_minutes: number };

/**
 * Dials due contacts for one running campaign. Safe to call repeatedly (cron, intake API):
 * respects calling hours (and a hard 09:00-21:00 window), concurrency, wallet balance and the DNC list.
 */
export async function dialCampaign(db: DB, campaignId: string, max?: number): Promise<{ dialed: number; note?: string }> {
  const { data: c } = await db.from("campaigns")
    .select("id, business_id, status, call_start, call_end, max_concurrent, max_attempts, retry_minutes").eq("id", campaignId).maybeSingle();
  const camp = c as Camp | null;
  if (!camp || camp.status !== "running") return { dialed: 0, note: "campaign not running" };
  const bid = camp.business_id;

  const { data: st } = await db.from("receptionist_settings").select("timezone").eq("business_id", bid).single();
  const tz = (st as { timezone: string } | null)?.timezone ?? "Asia/Kolkata";
  const now = new Date(), lm = localMinutes(tz, now);
  if (lm < 9 * 60 || lm >= 21 * 60 || !withinCallingHours(now, tz, camp.call_start, camp.call_end)) return { dialed: 0, note: "outside calling hours" };

  await db.from("contacts").update({ status: "pending" }).eq("campaign_id", campaignId).eq("status", "calling")
    .lt("claimed_at", new Date(Date.now() - 15 * 60000).toISOString());
  const { count } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", "calling");
  let room = camp.max_concurrent - (count ?? 0);
  if (max !== undefined) room = Math.min(room, max);
  if (room <= 0) return { dialed: 0, note: "at concurrency limit" };

  const { data: w } = await db.from("business_wallets").select("balance_paise").eq("business_id", bid).maybeSingle();
  const balance = (w as { balance_paise: number } | null)?.balance_paise ?? 0;
  room = Math.min(room, Math.floor(balance / ratePaise()));
  if (room <= 0) return { dialed: 0, note: "insufficient credits" };

  const { data: nums } = await db.from("phone_numbers").select("number").eq("business_id", bid).limit(1);
  const from = (nums as { number: string }[] | null)?.[0]?.number;
  if (!from) return { dialed: 0, note: "no phone number connected" };

  const { data: claimed, error } = await db.rpc("claim_contacts", { p_campaign: campaignId, p_limit: room });
  if (error) throw new Error(error.message);
  const rows = (claimed ?? []) as { id: string; phone: string; attempts: number }[];

  const { data: dncRows } = rows.length
    ? await db.from("dnc_numbers").select("phone").eq("business_id", bid).in("phone", rows.map((r) => r.phone))
    : { data: [] };
  const dnc = new Set(((dncRows ?? []) as { phone: string }[]).map((r) => r.phone));

  const app = publicEnv.NEXT_PUBLIC_APP_URL;
  let dialed = 0;
  for (const r of rows) {
    if (dnc.has(r.phone)) { await db.from("contacts").update({ status: "dnc", last_outcome: "dnc" }).eq("id", r.id); continue; }
    try {
      await placeCall({
        to: r.phone, from,
        url: `${app}/api/voice/twilio/outbound?contact=${r.id}`,
        statusUrl: `${app}/api/voice/twilio/outbound/status?contact=${r.id}`,
      });
      dialed++;
    } catch (e) {
      console.error("dial error", e instanceof Error ? e.message : e);
      await db.from("contacts").update({
        status: r.attempts >= camp.max_attempts ? "failed" : "pending", last_outcome: "dial_error",
        next_attempt_at: new Date(Date.now() + camp.retry_minutes * 60000).toISOString(),
      }).eq("id", r.id);
    }
  }
  const { count: left } = await db.from("contacts").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).in("status", ["pending", "calling"]);
  if (left === 0) await db.from("campaigns").update({ status: "completed" }).eq("id", campaignId);
  return { dialed };
}
