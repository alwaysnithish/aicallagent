import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { genericProvider } from "../lib/voice/providers/generic";
import { verifyTwilioSignature } from "../lib/voice/providers/twilio";

const sign = (secret: string, ts: number, raw: string) => createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
describe("generic provider", () => {
  const raw = JSON.stringify({ type: "turn", call_id: "c1", text: "hi" });
  const ts = Math.floor(Date.now() / 1000);
  const h = (sig: string, t: number) => new Headers({ "x-pickup-signature": sig, "x-pickup-timestamp": String(t) });
  it("accepts a valid signature", () => expect(genericProvider.verify(raw, h(sign("s", ts, raw), ts), "s")).toBe(true));
  it("rejects a wrong secret", () => expect(genericProvider.verify(raw, h(sign("x", ts, raw), ts), "s")).toBe(false));
  it("rejects a tampered body", () => expect(genericProvider.verify(raw + " ", h(sign("s", ts, raw), ts), "s")).toBe(false));
  it("rejects replayed (old) requests", () => {
    const old = ts - 3600;
    expect(genericProvider.verify(raw, h(sign("s", old, raw), old), "s")).toBe(false);
  });
});
describe("twilio signature", () => {
  const url = "https://example.com/api/voice/twilio";
  const params = { CallSid: "CA1", To: "+15550001111", SpeechResult: "hello" };
  const data = url + Object.keys(params).sort().map((k) => k + (params as Record<string, string>)[k]).join("");
  const good = createHmac("sha1", "tok").update(data).digest("base64");
  it("accepts valid", () => expect(verifyTwilioSignature(url, params, good, "tok")).toBe(true));
  it("rejects invalid", () => expect(verifyTwilioSignature(url, params, "bad", "tok")).toBe(false));
  it("rejects wrong token", () => expect(verifyTwilioSignature(url, params, good, "other")).toBe(false));
});

import { verifyRazorpaySignature } from "../lib/billing/razorpay-verify";
describe("razorpay signature", () => {
  const body = '{"event":"subscription.activated"}';
  const good = createHmac("sha256", "whsec").update(body).digest("hex");
  it("accepts valid", () => expect(verifyRazorpaySignature(body, good, "whsec")).toBe(true));
  it("rejects tampered body", () => expect(verifyRazorpaySignature(body + "x", good, "whsec")).toBe(false));
  it("rejects wrong secret", () => expect(verifyRazorpaySignature(body, good, "other")).toBe(false));
});
