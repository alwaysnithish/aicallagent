import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { VoiceProvider } from "../types";

const body = z.object({
  type: z.enum(["start", "turn", "end"]),
  call_id: z.string().min(1).max(100),
  text: z.string().max(1000).optional(),
  from: z.string().max(40).optional(),
});

/**
 * Signed JSON webhook. Headers: x-pickup-timestamp (unix seconds, max 5 min old) and
 * x-pickup-signature = hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
 */
export const genericProvider: VoiceProvider = {
  id: "generic",
  verify(raw, headers, secret) {
    const ts = Number(headers.get("x-pickup-timestamp"));
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
    const sig = headers.get("x-pickup-signature") ?? "";
    const expected = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  },
  parse(raw) {
    const j = body.parse(JSON.parse(raw));
    return { type: j.type, callId: j.call_id, text: j.text, from: j.from };
  },
  formatReply: (reply) => ({ reply }),
};
