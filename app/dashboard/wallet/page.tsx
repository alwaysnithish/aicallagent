import { requireBusiness } from "@/lib/tenant/context";
import { configStatus } from "@/lib/env/server";
import { ratePaise } from "@/lib/outbound/rate";
import { createTopup } from "../outbound-actions";

type L = { id: number; delta_paise: number; reason: string; created_at: string };
const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function Wallet({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const { supabase, active } = await requireBusiness();
  if (active.role === "member") return <div className="notice wn">Only owners and admins can view the wallet.</div>;
  const [{ data: w }, { data: led }] = await Promise.all([
    supabase.from("business_wallets").select("balance_paise").eq("business_id", active.id).maybeSingle(),
    supabase.from("wallet_ledger").select("id, delta_paise, reason, created_at").eq("business_id", active.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const bal = (w as { balance_paise: number } | null)?.balance_paise ?? 0;
  const rate = ratePaise();
  const ready = configStatus().razorpayTopup;
  return (
    <>
      <h1>Wallet</h1>
      <p className="sub">Prepaid credits. Outbound calls cost {inr(rate)} per started minute. Credits never expire.</p>
      {paid && <div className="notice ok">Thanks. Your balance updates as soon as the payment is confirmed (usually a few seconds).</div>}
      <div className="grid">
        <div className="card"><div className="big">{inr(bal)}</div><div className="lbl">Balance</div></div>
        <div className="card"><div className="big">{Math.max(0, Math.floor(bal / rate))}</div><div className="lbl">Minutes of calling left</div></div>
      </div>
      <form className="card" action={createTopup}>
        <b>Add credits</b>
        {!ready && <div className="notice wn">Top-ups need RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET and SUPABASE_SERVICE_ROLE_KEY in .env.local.</div>}
        <label htmlFor="amount">Amount in ₹ (100 to 50,000)</label>
        <input id="amount" name="amount" type="number" min={100} max={50000} step={1} defaultValue={500} required />
        <div className="actions"><button className="btn primary" type="submit" disabled={!ready}>Pay with Razorpay</button></div>
      </form>
      <div className="card tw"><b>History</b>
        {(led as L[] | null)?.length ? (
          <table><thead><tr><th>When</th><th>What</th><th>Amount</th></tr></thead><tbody>
            {(led as L[]).map((l) => <tr key={l.id}><td>{new Date(l.created_at).toLocaleString("en-IN")}</td><td>{l.reason}</td>
              <td><span className={`tag ${l.delta_paise > 0 ? "ok" : ""}`}>{l.delta_paise > 0 ? "+" : "−"}{inr(Math.abs(l.delta_paise))}</span></td></tr>)}
          </tbody></table>
        ) : <div className="empty">No transactions yet.</div>}
      </div>
    </>
  );
}
