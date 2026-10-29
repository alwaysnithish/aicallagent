"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/tenant/context";
import { rateLimit } from "@/lib/ratelimit";
import { startSession, handleTurn, endSession } from "@/lib/receptionist/engine";

export async function startTestCall() {
  const { supabase, active, user } = await requireBusiness();
  return { reply: await startSession(supabase, active.id, `test:${user.id}`) };
}

export async function sendTestTurn(text: string) {
  const t = z.string().trim().min(1).max(500).parse(text);
  const { supabase, active, user } = await requireBusiness();
  if (!rateLimit(`test:${user.id}`, 30, 60_000)) throw new Error("Too many messages. Wait a moment.");
  return handleTurn(supabase, active.id, `test:${user.id}`, t);
}

export async function endTestCall() {
  const { supabase, active, user } = await requireBusiness();
  await endSession(supabase, active.id, `test:${user.id}`, "test");
  revalidatePath("/dashboard", "layout");
}
