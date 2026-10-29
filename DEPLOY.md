# Deploy (Vercel + Supabase)

1. Push the project to a private GitHub repo (`.env.local` is git-ignored).
2. Supabase: run `0001` to `0004` migrations in order. Turn **Confirm email** ON.
3. Vercel: New Project -> import the repo. Add all variables from `.env.example` (use production values).
   Set `NEXT_PUBLIC_APP_URL` to your real https URL (it is used to verify Twilio signatures and for payment links).
4. Supabase -> Authentication -> URL Configuration: Site URL = your https URL; add `<url>/auth/callback` as a redirect URL.
5. Twilio: on each number set Voice webhook (POST) and Status callback to `<url>/api/voice/twilio`; add the number under "Phone & booking".
6. Razorpay (use Test Mode first): Subscriptions -> Plans -> create two plans (Starter, Pro) and put their ids (plan_...) in `RAZORPAY_PLAN_STARTER/PRO`.
   Settings -> Webhooks -> add `<url>/api/razorpay/webhook`, tick `subscription.activated`, `subscription.charged`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.paused`, set a secret and put it in `RAZORPAY_WEBHOOK_SECRET`. Put API keys in `RAZORPAY_KEY_ID/SECRET`.
7. Run `npm test`, `npm run typecheck`, `npm run build` locally before deploying.

## Outbound calling (campaigns)
- Run migration `0005_outbound.sql` (`npm run migrate`).
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` (16+ random chars), optional `OUTBOUND_RATE_PAISE_PER_MIN`.
- Twilio: buy a voice number, add it under "Phone & booking". Outbound webhooks are created automatically per call; `NEXT_PUBLIC_APP_URL` must be your public https URL.
- The dialer is `GET/POST /api/cron/dial` with header `Authorization: Bearer $CRON_SECRET`. Call it every minute:
  Vercel Cron (Pro plan; Hobby allows once a day), an external scheduler such as cron-job.org, or locally `npm run dialer`.
- Leads from the API start calling immediately; the cron picks up everything else (retries, uploaded lists).
- Razorpay: the same webhook (`/api/razorpay/webhook`) must also have the event `payment_link.paid` ticked, for wallet top-ups.
