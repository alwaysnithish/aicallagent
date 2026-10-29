"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireBusiness } from "@/lib/tenant/context";

const refresh = () => revalidatePath("/dashboard", "layout");
function fail(m: string): never { throw new Error(m); }
const uuid = z.string().uuid();

export async function addPhone(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const n = z.string().trim().regex(/^\+[1-9]\d{7,14}$/).safeParse(fd.get("number"));
  if (!n.success) fail("Use international format, for example +14155550123.");
  const { error } = await supabase.from("phone_numbers").insert({ number: n.data, business_id: active.id, provider: "twilio" });
  if (error) fail(error.code === "23505" ? "That number is already connected." : error.message);
  refresh();
}

export async function removePhone(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const { error } = await supabase.from("phone_numbers").delete().eq("number", String(fd.get("number"))).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function saveBooking(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
  const p = z.object({
    timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }),
    open: time, close: time,
    days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
    slot: z.coerce.number().int().min(10).max(240),
  }).safeParse({
    timezone: fd.get("timezone"), open: fd.get("open"), close: fd.get("close"),
    days: fd.getAll("days"), slot: fd.get("slot"),
  });
  if (!p.success) fail("Check timezone, hours (HH:MM), days and slot length.");
  if (p.data.open >= p.data.close) fail("Opening time must be before closing time.");
  const { error } = await supabase.from("receptionist_settings").update({
    timezone: p.data.timezone, open_time: p.data.open, close_time: p.data.close,
    work_days: [...new Set(p.data.days)].sort(), slot_minutes: p.data.slot, booking_enabled: fd.get("enabled") === "on",
  }).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function cancelAppointment(fd: FormData) {
  const { supabase, active } = await requireBusiness();
  const { error } = await supabase.from("appointments").update({ status: "cancelled" })
    .eq("id", uuid.parse(fd.get("id"))).eq("business_id", active.id);
  if (error) fail(error.message);
  refresh();
}

export async function addMember(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const p = z.object({ email: z.string().trim().email().max(254), role: z.enum(["admin", "member"]) })
    .safeParse({ email: fd.get("email"), role: fd.get("role") });
  if (!p.success) fail("Enter a valid email and role.");
  const { error } = await supabase.rpc("add_member_by_email", { p_business: active.id, p_email: p.data.email, p_role: p.data.role });
  if (error) fail(error.message);
  refresh();
}

export async function removeMember(fd: FormData) {
  const { supabase, active } = await requireAdmin();
  const { error } = await supabase.rpc("remove_member", { p_business: active.id, p_user: uuid.parse(fd.get("user")) });
  if (error) fail(error.message);
  refresh();
}
