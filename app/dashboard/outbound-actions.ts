"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/tenant/context";
import { normalizePhone, parseContacts } from "@/lib/outbound/pure";
import { razorpayPost } from "@/lib/billing/razorpay";
import { publicEnv } from "@/lib/env/public";

function fail(m: string): never { throw new Error(m); }
const refresh = () => revalidatePath("/dashboard", "layout");
const uuid = z.string().uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const secret = () => randomBytes(24).toString("hex");
const LANGS = ["Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Marathi", "English"] as const;

const fields = z.object({
  name: z.string().trim().min(1).max(80),
  goal: z.string().trim().min(10).max(1500),
  language: z.enum(LANGS),
  agent_name: z.string().trim().min(1).max(30),
  company_name: z.string().trim().max(80),
  call_start: time, call_end: time,
  max_concurrent: z.coerce.number().int().min(1).max(20),
  max_attempts: z.coerce.number().int().min(1).max(6),
  retry_minutes: z.coerce.number().int().min(5).max(2880),
});
const readFields = (fd: FormData) => {
  const p = fields.safeParse({
    name: fd.get("name"), goal: fd.get("goal"), language: fd.get("language"), agent_name: fd.get("agent_name"),
    company_name: fd.get("company_name") ?? "", call_start: fd.get("call_start"), call_end: fd.get("call_end"),
    max_concurrent: fd.get("max_concurrent"), max_attempts: fd.get("max_attempts"), retry_minutes: fd.get("retry_minutes"),
  });
  if (!p.success) fail("Please check the campaign fields (goal needs at least 10 characters, hours as HH:MM).");
  if (p.data.call_start === p.data.call_end) fail("Calling start and end cannot be the same.");
  return p.data;
};

export async function createCampaign(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const f = readFields(fd);
  const { data, error } = await supabase.from("campaigns")
    .insert({ business_id: active.id, ...f, company_name: f.company_name || null }).select("id").single();
  if (error) fail(error.message);
  const id = (data as { id: string }).id;
  const { error: e2 } = await supabase.from("campaign_secrets").insert({ campaign_id: id, business_id: active.id, webhook_secret: secret(), intake_secret: secret() });
  if (e2) fail(e2.message);
  redirect(`/dashboard/campaigns/${id}`);
}

export async function saveCampaign(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const f = readFields(fd);
  const hook = z.string().trim().max(300).refine((v) => v === "" || /^https:\/\//.test(v), "Webhook must start with https://").safeParse(fd.get("outcome_webhook") ?? "");
  if (!hook.success) fail("Outcome webhook must be an https:// URL.");
  const { error } = await supabase.from("campaigns")
    .update({ ...f, company_name: f.company_name || null, outcome_webhook: hook.data || null }).eq("id", id).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function setCampaignStatus(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["running", "paused", "draft"]).parse(fd.get("status"));
  const { error } = await supabase.from("campaigns").update({ status }).eq("id", id).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function rotateSecret(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const which = z.enum(["intake_secret", "webhook_secret"]).parse(fd.get("which"));
  const { error } = await supabase.from("campaign_secrets").update({ [which]: secret() }).eq("campaign_id", id).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function uploadContacts(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  if (fd.get("consent") !== "on") fail("Please confirm these contacts have agreed to be called (or have an existing relationship with you).");
  const { data: camp } = await supabase.from("campaigns").select("id").eq("id", id).eq("business_id", active.id).maybeSingle();
  if (!camp) fail("Campaign not found.");

  let text = String(fd.get("paste") ?? "");
  const file = fd.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 1_000_000) fail("File too large (max 1 MB).");
    text = await file.text();
  }
  const { rows, skipped } = parseContacts(text, 5000);
  if (!rows.length) fail("No valid phone numbers found. Use rows like: name,phone");

  const blocked = new Set<string>();
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await supabase.from("dnc_numbers").select("phone").eq("business_id", active.id).in("phone", rows.slice(i, i + 200).map((r) => r.phone));
    for (const d of (data ?? []) as { phone: string }[]) blocked.add(d.phone);
  }
  const ok = rows.filter((r) => !blocked.has(r.phone));
  for (let i = 0; i < ok.length; i += 500) {
    const { error } = await supabase.from("contacts").upsert(
      ok.slice(i, i + 500).map((r) => ({ business_id: active.id, campaign_id: id, name: r.name || null, phone: r.phone, consent_attested: true })),
      { onConflict: "campaign_id,phone", ignoreDuplicates: true },
    );
    if (error) fail(error.message);
  }
  redirect(`/dashboard/campaigns/${id}?added=${ok.length}&skipped=${skipped + blocked.size}`);
}

export async function addDnc(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  if (!phone) fail("Enter a valid phone number.");
  const { error } = await supabase.from("dnc_numbers").upsert({ business_id: active.id, phone: phone!, reason: "added manually" }, { onConflict: "business_id,phone", ignoreDuplicates: true });
  if (error) fail(error.message);
  await supabase.from("contacts").update({ status: "dnc", last_outcome: "dnc" }).eq("business_id", active.id).eq("phone", phone!).eq("status", "pending");
  refresh();
}

export async function removeDnc(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const { error } = await supabase.from("dnc_numbers").delete().eq("business_id", active.id).eq("phone", String(fd.get("phone")));
  if (error) fail(error.message);
  refresh();
}

export async function createTopup(fd: FormData) {
  const { active } = await requireAdmin();
  const rupees = z.coerce.number().int().min(100).max(50000).parse(fd.get("amount"));
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.SUPABASE_SERVICE_ROLE_KEY) fail("Payments are not configured.");
  const link = await razorpayPost<{ short_url: string }>("/payment_links", {
    amount: rupees * 100, currency: "INR", accept_partial: false, description: "Vaachak credits",
    reference_id: `${active.id.replace(/-/g, "").slice(0, 12)}${Date.now()}`,
    notes: { business_id: active.id, kind: "topup" },
    callback_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard/wallet?paid=1`, callback_method: "get",
  });
  redirect(link.short_url);
}
