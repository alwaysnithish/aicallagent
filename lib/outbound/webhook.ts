import "server-only";
import dns from "node:dns/promises";
import net from "node:net";
import { hmacHex } from "./pure";

function isPrivate(ip: string) {
  if (net.isIPv6(ip)) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.toLowerCase().startsWith("::ffff:");
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}
/** SSRF guard: https only, standard port, and the host must not resolve to a private address. */
export async function isSafeUrl(u: string): Promise<boolean> {
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" || (url.port && url.port !== "443")) return false;
    const addrs = await dns.lookup(url.hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivate(a.address));
  } catch { return false; }
}

/** Sends a signed outcome event. Headers: x-vaachak-timestamp, x-vaachak-signature = HMAC-SHA256(secret, `${ts}.${body}`). */
export async function deliverOutcome(url: string, secret: string, payload: unknown): Promise<boolean> {
  if (!(await isSafeUrl(url))) return false;
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  try {
    const r = await fetch(url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(8000), body,
      headers: { "Content-Type": "application/json", "x-vaachak-timestamp": String(ts), "x-vaachak-signature": hmacHex(secret, `${ts}.${body}`) },
    });
    return r.ok;
  } catch { return false; }
}
