import { createHmac, timingSafeEqual } from "node:crypto";

/** Razorpay webhook: X-Razorpay-Signature = hex HMAC-SHA256(rawBody, webhookSecret). */
export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
