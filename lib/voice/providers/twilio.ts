import { createHmac, timingSafeEqual } from "node:crypto";

/** Twilio request validation: base64 HMAC-SHA1 of (url + sorted key/value pairs) with the account auth token. */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
const LANG: Record<string, string> = { Hindi: "hi-IN", Telugu: "te-IN", Tamil: "ta-IN", Kannada: "kn-IN", Malayalam: "ml-IN", Marathi: "mr-IN" };
export const twilioLang = (l: string) => LANG[l] ?? "en-IN";
const head = '<?xml version="1.0" encoding="UTF-8"?>';

/** Say something, then listen for the caller's speech and post it back to `action`. */
export const gatherTwiml = (say: string, action: string, lang: string) =>
  `${head}<Response><Gather input="speech" action="${esc(action)}" method="POST" speechTimeout="auto" language="${lang}">` +
  `<Say language="${lang}">${esc(say)}</Say></Gather><Say language="${lang}">I did not hear anything. Goodbye.</Say><Hangup/></Response>`;
export const sayAndHangupTwiml = (say: string, lang?: string) =>
  `${head}<Response><Say${lang ? ` language="${lang}"` : ""}>${esc(say)}</Say><Hangup/></Response>`;
export const emptyTwiml = `${head}<Response/>`;
