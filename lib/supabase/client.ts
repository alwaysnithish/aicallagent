import { createBrowserClient } from "@supabase/ssr";

/** Browser client. Uses only the public anon key. RLS protects the data. */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not set.");
  return createBrowserClient(url, key);
}
