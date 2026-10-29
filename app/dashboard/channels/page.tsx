import { requireBusiness } from "@/lib/tenant/context";
import { publicEnv } from "@/lib/env/public";
import { configStatus } from "@/lib/env/server";
import { addPhone, removePhone, saveBooking } from "../more-actions";

type S = { timezone: string; open_time: string; close_time: string; work_days: number[]; slot_minutes: number; booking_enabled: boolean };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function Channels() {
  const { supabase, active } = await requireBusiness();
  if (active.role === "member") return <div className="notice wn">Only owners and admins can manage phone and booking settings.</div>;
  const [{ data: nums }, { data: sec }, { data: st }] = await Promise.all([
    supabase.from("phone_numbers").select("number").eq("business_id", active.id),
    supabase.from("voice_secrets").select("secret").eq("business_id", active.id).maybeSingle(),
    supabase.from("receptionist_settings").select("timezone, open_time, close_time, work_days, slot_minutes, booking_enabled").eq("business_id", active.id).single(),
  ]);
  const s = st as S;
  const cfg = configStatus();
  const app = publicEnv.NEXT_PUBLIC_APP_URL;
  return (
    <>
      <h1>Phone &amp; booking</h1>
      <p className="sub">Connect real phone numbers and set when appointments can be booked.</p>

      <div className="card">
        <b>Phone numbers (Twilio)</b>
        {!cfg.twilio && <div className="notice wn">TWILIO_AUTH_TOKEN is not set on the server, so calls are disabled.</div>}
        <p className="mut">
          In Twilio, open your number and set both &quot;A call comes in&quot; (Webhook, POST) and &quot;Call status changes&quot; to:
        </p>
        <div className="row"><code>{app}/api/voice/twilio</code></div>
        {(nums as { number: string }[] | null)?.map((n) => (
          <form className="row" key={n.number} action={removePhone}>
            <code>{n.number}</code><input type="hidden" name="number" value={n.number} />
            <button className="btn" type="submit">Remove</button>
          </form>
        ))}
        <form className="actions" action={addPhone}>
          <input name="number" placeholder="+14155550123" required aria-label="Phone number in international format" />
          <button className="btn primary" type="submit">Connect number</button>
        </form>
      </div>

      <form className="card" action={saveBooking}>
        <b>Appointment booking</b>
        <label><input type="checkbox" name="enabled" defaultChecked={s.booking_enabled} style={{ width: "auto" }} /> Let the receptionist book appointments</label>
        <label htmlFor="timezone">Timezone (IANA name)</label>
        <input id="timezone" name="timezone" defaultValue={s.timezone} required />
        <div className="actions">
          <div><label htmlFor="open">Opens</label><input id="open" name="open" defaultValue={s.open_time.slice(0, 5)} pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
          <div><label htmlFor="close">Closes</label><input id="close" name="close" defaultValue={s.close_time.slice(0, 5)} pattern="[0-2][0-9]:[0-5][0-9]" required /></div>
          <div><label htmlFor="slot">Slot minutes</label><input id="slot" name="slot" type="number" min={10} max={240} defaultValue={s.slot_minutes} required /></div>
        </div>
        <label>Working days</label>
        <div className="actions">
          {DAYS.map((d, i) => (
            <label key={d}><input type="checkbox" name="days" value={i} defaultChecked={s.work_days.includes(i)} style={{ width: "auto" }} /> {d}</label>
          ))}
        </div>
        <div className="actions"><button className="btn primary" type="submit">Save booking settings</button></div>
        <p className="mut">Booked slots are stored here and cannot be double-booked. Syncing to Google Calendar is not built.</p>
      </form>

      <div className="card">
        <b>Generic voice webhook (any other provider)</b>
        <p className="mut">POST signed JSON. See README for the signature format.</p>
        <div className="row col"><code>{app}/api/voice/generic/{active.id}</code>
          <span className="mut">Signing secret (keep private):</span><code>{(sec as { secret: string } | null)?.secret ?? "unavailable"}</code></div>
      </div>
    </>
  );
}
