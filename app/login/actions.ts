"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env/public";

const creds = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(72),
});

const back = (kind: "error" | "message", text: string): never =>
  redirect(`/login?${kind}=${encodeURIComponent(text)}`);

function parse(formData: FormData) {
  return creds.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(formData: FormData) {
  const c = parse(formData);
  if (!c.success) back("error", "Enter a valid email and a password of at least 8 characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(c.data!);
  if (error) back("error", "Invalid email or password.");
  redirect("/dashboard");
}

export async function signUp(formData: FormData) {
  const c = parse(formData);
  if (!c.success) back("error", "Enter a valid email and a password of at least 8 characters.");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...c.data!,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  if (error) back("error", error.message);
  if (data.session) redirect("/dashboard");
  back("message", "Account created. Check your email to confirm, then sign in.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
