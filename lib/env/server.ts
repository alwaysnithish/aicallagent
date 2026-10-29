import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1).optional(),
  RAZORPAY_PLAN_STARTER: z.string().min(1).optional(),
  RAZORPAY_PLAN_PRO: z.string().min(1).optional(),
});
const keys = Object.keys(schema.shape) as (keyof z.infer<typeof schema>)[];

export function serverEnv() {
  const raw: Record<string, string | undefined> = {};
  for (const k of keys) raw[k] = process.env[k] || undefined;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment variables: ${problems}`);
  }
  return parsed.data;
}

/** Booleans only. Never return secret values. */
export function configStatus() {
  const s = serverEnv();
  return {
    supabaseUrlAndAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRole: Boolean(s.SUPABASE_SERVICE_ROLE_KEY),
    gemini: Boolean(s.GEMINI_API_KEY),
    twilio: Boolean(s.TWILIO_AUTH_TOKEN),
    outbound: Boolean(s.TWILIO_AUTH_TOKEN && s.TWILIO_ACCOUNT_SID && s.GEMINI_API_KEY && s.SUPABASE_SERVICE_ROLE_KEY),
    cron: Boolean(s.CRON_SECRET),
    razorpayTopup: Boolean(s.RAZORPAY_KEY_ID && s.RAZORPAY_KEY_SECRET && s.RAZORPAY_WEBHOOK_SECRET && s.SUPABASE_SERVICE_ROLE_KEY),
    razorpay: Boolean(
      s.RAZORPAY_KEY_ID && s.RAZORPAY_KEY_SECRET && s.RAZORPAY_WEBHOOK_SECRET &&
      s.RAZORPAY_PLAN_STARTER && s.RAZORPAY_PLAN_PRO && s.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}
