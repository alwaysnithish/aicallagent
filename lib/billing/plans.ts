// Minutes per month per plan. Prices live in your Razorpay plans (RAZORPAY_PLAN_* env), not here. Edit minutes to taste.
export const PLANS = {
  free: { label: "Free", minutes: 100 },
  starter: { label: "Starter", minutes: 300 },
  pro: { label: "Pro", minutes: 1500 },
} as const;
export type PlanId = keyof typeof PLANS;
export const isPlan = (x: unknown): x is PlanId => typeof x === "string" && x in PLANS;
