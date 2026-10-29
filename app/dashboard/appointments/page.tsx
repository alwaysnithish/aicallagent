import { requireBusiness } from "@/lib/tenant/context";
import { cancelAppointment } from "../more-actions";

type A = { id: string; starts_at: string; customer_name: string; customer_phone: string; notes: string | null; status: string };

export default async function Appointments() {
  const { supabase, active } = await requireBusiness();
  const [{ data }, { data: st }] = await Promise.all([
    supabase.from("appointments").select("id, starts_at, customer_name, customer_phone, notes, status")
      .eq("business_id", active.id).order("starts_at", { ascending: false }).limit(100),
    supabase.from("receptionist_settings").select("timezone").eq("business_id", active.id).single(),
  ]);
  const tz = (st as { timezone: string }).timezone;
  const fmt = (d: string) => new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
  const rows = (data ?? []) as A[];
  return (
    <>
      <h1>Appointments</h1>
      <p className="sub">Booked by the receptionist during calls. Times shown in {tz}.</p>
      <div className="card tw">
        {rows.length === 0 ? <div className="empty">No appointments yet. In Test call, say &quot;I want to book an appointment&quot;.</div> : (
          <table><thead><tr><th>When</th><th>Customer</th><th>Phone</th><th>For</th><th>Status</th><th></th></tr></thead><tbody>
            {rows.map((a) => (
              <tr key={a.id}><td>{fmt(a.starts_at)}</td><td>{a.customer_name}</td><td>{a.customer_phone}</td><td>{a.notes}</td>
                <td><span className={`tag ${a.status === "booked" ? "ok" : "wn"}`}>{a.status}</span></td>
                <td>{a.status === "booked" && (
                  <form action={cancelAppointment}><input type="hidden" name="id" value={a.id} /><button className="btn" type="submit">Cancel</button></form>)}</td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </>
  );
}
