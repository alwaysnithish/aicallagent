# Vaachak — AI Receptionist for Any Business

AI telecalling for India. Outbound campaigns, instant lead calls, inbound receptionist. Next.js + TypeScript, Supabase Auth + Postgres with RLS, Gemini, Twilio voice, Razorpay billing.

## Setup
1. `npm install`
2. Set `SUPABASE_DB_URL` in `.env.local`, then run `npm run migrate` (applies `supabase/migrations/*.sql` in order and remembers what ran).
3. `cp .env.example .env.local` and fill what you need (Supabase URL + anon key are required; the rest enable features).
4. Supabase -> Authentication -> URL Configuration: Site URL `http://localhost:3000`, redirect `http://localhost:3000/auth/callback`. For local testing you may turn off "Confirm email".
5. `npm test && npm run typecheck && npm run dev`

## Features
Workspaces + roles + team · approved-facts knowledge base · Gemini-phrased answers (fallback to approved text) ·
leads · callback tasks · call records · appointment booking with double-booking protection ·
Twilio phone calls · generic signed webhook · usage limits · Razorpay plans · security headers and rate limits.

## Generic webhook
`POST /api/voice/generic/<businessId>` JSON `{type: start|turn|end, call_id, text?}` with headers
`x-pickup-timestamp` (unix seconds) and `x-pickup-signature` = hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`).
Try it: `node scripts/test-webhook.mjs <businessId> <secret>`.
Add another provider by implementing `VoiceProvider` in `lib/voice/providers/`.

## Outbound
See DEPLOY.md ("Outbound calling"). Dialer: `npm run dialer` locally.

## Not built
Streaming, human-quality Indian-language voices (current speech uses Twilio built-in text-to-speech), WhatsApp mid-call actions, call transfer, CRM connectors, 
Google Calendar sync, secret rotation UI, shared-store rate limiting, end-to-end tests. See SECURITY.md and DEPLOY.md.
