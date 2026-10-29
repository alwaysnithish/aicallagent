import "server-only";

function auth() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay is not configured.");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(json.error?.description ?? `Razorpay error ${res.status}`);
  return json;
}

/** Creates a subscription; the customer pays on Razorpay's hosted page (short_url). */
export const createSubscription = (planId: string, notes: Record<string, string>) =>
  call<{ id: string; short_url: string }>("/subscriptions", { plan_id: planId, total_count: 120, customer_notify: 1, notes });

/** Cancels at the end of the current paid cycle. */
export const cancelSubscription = (subscriptionId: string) =>
  call<{ id: string; status: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, { cancel_at_cycle_end: 1 });

export const razorpayPost = call;
