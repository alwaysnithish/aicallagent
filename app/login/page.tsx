import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { signIn, signUp } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  const ok = isSupabaseConfigured();

  return (
    <>
      <header className="topbar">
        <Link className="logo" href="/">
          vaach<i>ak</i>
        </Link>
      </header>
      <main className="wrap narrow">
        <h1>Sign in to Vaachak</h1>
        <p className="sub">Use one account per person. Create your business workspace after signing in.</p>

        {!ok && (
          <div className="notice wn">
            Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and
            NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local and restart the dev server.
          </div>
        )}
        {error && <div className="notice er">{error}</div>}
        {message && <div className="notice ok">{message}</div>}

        <form className="card" action={signIn}>
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password (8+ characters)</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={8}
            maxLength={72}
            required
          />
          <div className="actions">
            <button className="btn primary" type="submit" disabled={!ok}>
              Sign in
            </button>
            <button className="btn" type="submit" formAction={signUp} disabled={!ok}>
              Create account
            </button>
          </div>
        </form>
      </main>
    </>
  );
}
