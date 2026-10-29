// Usage: node scripts/test-webhook.mjs <businessId> <secret> [baseUrl]
import { createHmac } from "node:crypto";
const [businessId, secret, base = "http://localhost:3000"] = process.argv.slice(2);
if (!businessId || !secret) { console.error("usage: node scripts/test-webhook.mjs <businessId> <secret> [baseUrl]"); process.exit(1); }
const url = `${base}/api/voice/generic/${businessId}`;
const callId = `demo-${Date.now()}`;
async function send(payload, signSecret = secret) {
  const raw = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", signSecret).update(`${ts}.${raw}`).digest("hex");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-pickup-signature": sig, "x-pickup-timestamp": String(ts) }, body: raw });
  console.log(payload.type, payload.text ?? "", "->", res.status, await res.text());
}
await send({ type: "start", call_id: callId });
await send({ type: "turn", call_id: callId, text: "What are your opening hours?" });
await send({ type: "turn", call_id: callId, text: "Can I talk to a person?" });
await send({ type: "end", call_id: callId });
console.log("--- expect 401 below (wrong secret) ---");
await send({ type: "start", call_id: "x" }, "wrong-secret");
