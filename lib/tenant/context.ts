import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const BIZ_COOKIE = "pickup_biz";
export type Role = "owner" | "admin" | "member";
export type Biz = { id: string; name: string; role: Role };

/** Who is the user and which businesses do they belong to? Membership comes from the DB, never from the cookie alone. */
export async function getContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: ms } = await supabase.from("memberships").select("business_id, role").eq("user_id", user.id);
  const rows = (ms ?? []) as { business_id: string; role: Role }[];
  let businesses: Biz[] = [];
  if (rows.length) {
    const { data: bs } = await supabase
      .from("businesses").select("id, name").in("id", rows.map((r) => r.business_id)).order("created_at");
    businesses = ((bs ?? []) as { id: string; name: string }[]).map((b) => ({
      ...b,
      role: rows.find((r) => r.business_id === b.id)!.role,
    }));
  }
  const wanted = (await cookies()).get(BIZ_COOKIE)?.value;
  const active = businesses.find((b) => b.id === wanted) ?? businesses[0] ?? null;
  return { supabase, user, businesses, active };
}

export async function requireBusiness() {
  const c = await getContext();
  if (!c.active) redirect("/dashboard/new");
  return { ...c, active: c.active };
}

export async function requireAdmin() {
  const c = await requireBusiness();
  if (c.active.role === "member") throw new Error("Only owners and admins can do this.");
  return c;
}
