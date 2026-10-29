"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContext, requireAdmin, requireBusiness, BIZ_COOKIE } from "@/lib/tenant/context";
import { PLANS, isPlan } from "@/lib/billing/plans";

const refresh = () => revalidatePath("/dashboard", "layout");
const setBiz = async (id: string) =>
  (await cookies()).set(BIZ_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
const uuid = z.string().uuid();
function fail(m: string): never { throw new Error(m); }
function backToNew(m: string): never { redirect(`/dashboard/new?error=${encodeURIComponent(m)}`); }

export async function createBusiness(fd: FormData) {
  const { supabase } = await getContext();
  const p = z.object({ name: z.string().trim().min(1).max(80), category: z.string().trim().max(60).optional() })
    .safeParse({ name: fd.get("name"), category: fd.get("category") || undefined });
  if (!p.success) backToNew("Enter a business name (max 80 characters).");
  const { data, error } = await supabase.rpc("create_business", { p_name: p.data!.name, p_category: p.data!.category ?? null });
  if (error) backToNew(error.message);
  await setBiz(String(data));
  redirect("/dashboard");
}

export async function switchBusiness(fd: FormData) {
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) fail("Invalid business.");
  const { businesses } = await getContext();
  if (!businesses.some((b) => b.id === id.data)) fail("You are not a member of that business.");
  await setBiz(id.data!);
  redirect("/dashboard");
}

export async function addFact(fd: FormData) {
  const { supabase, active, user } = await requireAdmin();
  const p = z.object({ keywords: z.string().trim().min(2).max(200), answer: z.string().trim().min(2).max(600) })
    .safeParse({ keywords: fd.get("keywords"), answer: fd.get("answer") });
  if (!p.success) fail("Keywords and an answer are required.");
  const high = fd.get("high") === "on";
  const { error } = await supabase.from("facts").insert({
    business_id: active.id, keywords: p.data!.keywords, answer: p.data!.answer, high_impact: high,
    status: high ? "pending" : "approved", approved_by: high ? null : user.id,
  });
  if (error) fail(error.message);
  refresh();
}

export async function setFactStatus(fd: FormData) {
  const { supabase, active, user } = await requireAdmin();
  const id = uuid.parse(fd.get("id"));
  const status = z.enum(["approved", "rejected", "pending"]).parse(fd.get("status"));
  const { error } = await supabase.from("facts")
    .update({ status, approved_by: status === "approved" ? user.id : null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function deleteFact(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const { error } = await supabase.from("facts").delete().eq("id", uuid.parse(fd.get("id"))).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function publishSettings(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const p = z.object({
    persona: z.string().trim().min(1).max(40), greeting: z.string().trim().min(1).max(300),
    hours: z.string().trim().max(120), handoff: z.string().trim().max(30), language: z.enum(["English", "Hindi", "Telugu"]),
  }).safeParse({
    persona: fd.get("persona"), greeting: fd.get("greeting"), hours: fd.get("hours") ?? "",
    handoff: fd.get("handoff") ?? "", language: fd.get("language"),
  });
  if (!p.success) fail("Please check the receptionist fields.");
  const { data: cur } = await supabase.from("receptionist_settings").select("version").eq("business_id", active.id).single();
  const { error } = await supabase.from("receptionist_settings").update({
    persona: p.data!.persona, greeting: p.data!.greeting, hours: p.data!.hours, handoff_number: p.data!.handoff,
    language: p.data!.language, version: ((cur as { version: number } | null)?.version ?? 1) + 1,
    updated_at: new Date().toISOString(),
  }).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function setLeadStage(fd: FormData) {
  const { supabase, active } = await requireBusiness();
  const stage = z.enum(["New", "Contacted", "Booked", "Won", "Lost"]).parse(fd.get("stage"));
  const { error } = await supabase.from("leads").update({ stage }).eq("id", uuid.parse(fd.get("id"))).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function completeTask(fd: FormData) {
  const { supabase, active } = await requireBusiness();
  const { error } = await supabase.from("callback_tasks").update({ status: "done" })
    .eq("id", uuid.parse(fd.get("id"))).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function setLimit(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const n = z.coerce.number().int().min(10).max(100000).parse(fd.get("limit"));
  const { data: bill } = await supabase.from("business_billing").select("plan").eq("business_id", active.id).single();
  const plan = (bill as { plan: string } | null)?.plan;
  const cap = PLANS[isPlan(plan) ? plan : "free"].minutes;
  if (n > cap) fail(`Your plan allows at most ${cap} minutes per month. Upgrade on the Billing page.`);
  const { error } = await supabase.from("receptionist_settings").update({ monthly_minute_limit: n }).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}
