# Security review

## Controls in place
- **Tenant isolation:** RLS on every table (`0001`, `0002`, `0003`); policies use `is_member` / `has_role`. Server actions re-check role and always filter by the active business id.
- **Deny by default:** direct INSERT/DELETE on `businesses` and `memberships` is impossible; they go through security-definer functions that check `auth.uid()`.
- **Secrets:** service-role key, Gemini, Twilio and Razorpay keys are server-only (`server-only` import). Nothing secret uses `NEXT_PUBLIC_`.
- **Auth:** server code uses `getUser()` (validated), not `getSession()`.
- **Webhooks:** generic = HMAC + 5-minute timestamp (replay protection); Twilio = official signature scheme; Razorpay = HMAC-SHA256 of the raw body. All use constant-time comparison. Unknown/invalid requests get 401/403 without detail.
- **AI safety:** Gemini sees only approved facts, caller text is marked untrusted, replies containing numbers not present in the facts are discarded.
- **Billing integrity:** `business_billing` has no client write policy; only the Razorpay webhook (service role, signature-verified) changes plans. Users cannot raise their own minute limit above the plan.
- **Headers:** CSP, HSTS (production), no framing, nosniff.
- **Abuse limits:** in-memory rate limits on webhooks and test calls; per-user business cap (5); input length limits via zod.

## Known gaps (do before real customers)
- Rate limiting is per server instance; use a shared store (e.g. Upstash Redis) on serverless.
- CSP allows `unsafe-inline` scripts/styles (Next.js default); move to nonces if you need stricter.
- Webhook secrets are shown in plain text to owners/admins and cannot be rotated from the UI yet.
- No audit log, no email verification enforcement beyond Supabase settings, no automated end-to-end tests.
- Call recordings and transcripts are not stored; call data privacy law (consent notices, retention) is your responsibility.
