// Local dialer loop: npm run dialer   (needs CRON_SECRET in .env.local and `npm run dev` running)
const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const secret = process.env.CRON_SECRET;
if (!secret) { console.error("Set CRON_SECRET in .env.local"); process.exit(1); }
console.log(`Dialer running against ${base} (every 10s). Ctrl+C to stop.`);
async function tick() {
  try {
    const r = await fetch(`${base}/api/cron/dial`, { headers: { Authorization: `Bearer ${secret}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) console.log(new Date().toISOString(), "error", r.status, j);
    else if (j.dialed) console.log(new Date().toISOString(), `dialed ${j.dialed} across ${j.campaigns} campaign(s)`);
  } catch (e) { console.log("dialer error:", e.message); }
}
await tick();
setInterval(tick, 10_000);
