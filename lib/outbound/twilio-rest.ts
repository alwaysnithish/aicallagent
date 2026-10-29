import "server-only";

/** Places an outbound call through Twilio's REST API. Returns the CallSid. */
export async function placeCall(o: { to: string; from: string; url: string; statusUrl: string }): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("Twilio is not configured.");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      To: o.to, From: o.from, Url: o.url, Method: "POST", StatusCallback: o.statusUrl,
      StatusCallbackMethod: "POST", StatusCallbackEvent: "completed", Timeout: "25",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok || !json.sid) throw new Error(json.message ?? `Twilio error ${res.status}`);
  return json.sid;
}
