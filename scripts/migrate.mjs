// Usage: npm run migrate   (needs SUPABASE_DB_URL in .env.local)
import pg from "pg";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (Supabase -> Connect -> Session pooler URI, with your password filled in).");
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

// Used only the first time, to recognise migrations you already ran by hand in the SQL Editor.
const markers = {
  "0001_init.sql": "select to_regclass('public.businesses') is not null as ok",
  "0002_rls_and_features.sql": "select to_regclass('public.voice_secrets') is not null as ok",
  "0003_booking_voice_billing_team.sql": "select to_regclass('public.appointments') is not null as ok",
  "0004_razorpay.sql":
    "select exists(select 1 from information_schema.columns where table_schema='public' and table_name='business_billing' and column_name='provider_customer_id') as ok",
};

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query("create table if not exists public.pickup_migrations (name text primary key, applied_at timestamptz not null default now())");

  const { rows: done0 } = await client.query("select name from public.pickup_migrations");
  if (done0.length === 0) {
    for (const f of files) {
      const m = markers[f];
      if (m && (await client.query(m)).rows[0].ok) {
        await client.query("insert into public.pickup_migrations(name) values ($1) on conflict do nothing", [f]);
        console.log(`= ${f} (already in your database, marked as applied)`);
      }
    }
  }

  const done = new Set((await client.query("select name from public.pickup_migrations")).rows.map((r) => r.name));
  let ran = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    process.stdout.write(`> applying ${f} ... `);
    try {
      await client.query("begin");
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("insert into public.pickup_migrations(name) values ($1)", [f]);
      await client.query("commit");
      console.log("done");
      ran++;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.log("FAILED");
      console.error(`\nError in ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  await client.query("notify pgrst, 'reload schema'");
  console.log(ran ? `\nApplied ${ran} migration(s). API schema cache reloaded.` : "\nDatabase is already up to date.");
} catch (e) {
  console.error("Could not connect or run migrations:", e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
