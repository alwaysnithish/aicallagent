import Link from "next/link";

const features: [string, string, string][] = [
  ["⚡", "Calls every lead in seconds", "Send a lead through the API or a form and the AI is on the phone before the interest cools."],
  ["☎", "Bulk campaigns that run themselves", "Upload a list, set calling hours, pace and retries. Busy or no answer? It tries again later."],
  ["◎", "Inbound receptionist too", "The same AI answers your number day and night, books appointments and hands over to a human."],
  ["✦", "Never makes up a price", "Offers, fees and policies come only from facts you approve. Anything else becomes a human callback."],
  ["❖", "Seven languages", "Hindi, Telugu, Tamil, Kannada, Malayalam, Marathi and English, chosen per campaign."],
  ["⌘", "API and signed webhooks", "Leads in with one request. Every outcome back to your CRM, signed so you can trust it."],
  ["✓", "Compliance built in", "Calling windows, an instant do-not-call list, consent gate on uploads, and an AI disclosure on every call."],
  ["₹", "Prepaid, pay per minute", "Top up with Razorpay. You only pay for talk time, and credits never expire."],
];

export default function Home() {
  return (
    <div className="l-wrap">
      <header className="l-nav">
        <span className="logo">vaach<i>ak</i></span>
        <nav className="l-links">
          <a className="t" href="#features">Features</a><a className="t" href="#how">How it works</a><a className="t" href="#trust">Trust</a>
          <Link className="btn" href="/login">Sign in</Link>
          <Link className="btn primary" href="/login">Start free</Link>
        </nav>
      </header>

      <section className="hero">
        <div>
          <span className="pill"><b />AI telecalling for India</span>
          <h1>Every lead called. <span className="grad-text">Every outcome logged.</span></h1>
          <p className="lead">Vaachak is the AI telecaller that qualifies leads, confirms visits and follows up in seven Indian languages, grounded in facts you approve so it never invents a price.</p>
          <div className="cta-row">
            <Link className="btn primary lg" href="/login">Build your first caller</Link>
            <a className="btn lg" href="#how">See how it works</a>
          </div>
        </div>
        <div className="card phone" aria-label="Example call">
          <div className="who"><div className="avatar">M</div><div><b>Meera</b><div className="mut">Sunrise Clinic · Hindi + English</div></div>
            <div className="wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div></div>
          <div className="chat" style={{ height: "auto" }}>
            <div className="bubble a">Namaste Priya ji, main Meera bol rahi hoon Sunrise Clinic se, ek AI assistant. Kal ke checkup ke baare mein do minute baat kar sakti hoon?</div>
            <div className="bubble u">Haan boliye.</div>
            <div className="bubble a">Kal subah 10 baje ka slot confirm hai. Kya aap aa payengi?</div>
            <div className="bubble u">Haan, main aa jaungi.</div>
          </div>
          <div className="chips"><span className="tag ok">Confirmed</span><span className="tag">Lead updated</span><span className="tag">0:48</span></div>
        </div>
      </section>

      <section className="section" id="features">
        <h2>Everything a calling team does, <span className="grad-text">without the team.</span></h2>
        <div className="feat">
          {features.map(([i, t, d]) => (<div className="card" key={t}><div className="ico">{i}</div><h3>{t}</h3><p>{d}</p></div>))}
        </div>
      </section>

      <section className="section" id="how">
        <h2>Live in three steps</h2>
        <div className="steps">
          <div className="card"><h3>Describe the job</h3><p className="mut">Tell the AI what to achieve in plain words: confirm an enquiry, remind about a renewal, book a demo.</p></div>
          <div className="card"><h3>Add leads</h3><p className="mut">Upload a CSV or send leads from your forms and ads through the API.</p></div>
          <div className="card"><h3>Watch outcomes</h3><p className="mut">See interested, call back and no answer in real time, with transcripts and webhooks to your CRM.</p></div>
        </div>
      </section>

      <section className="section" id="trust">
        <h2>Built to be <span className="grad-text">trusted</span></h2>
        <div className="feat">
          <div className="card"><h3>Honest by design</h3><p>Every call starts by saying it is an automated assistant. No pretending to be human.</p></div>
          <div className="card"><h3>Private workspaces</h3><p>Each business is isolated at the database level. Your leads and calls are only yours.</p></div>
          <div className="card"><h3>You stay in control</h3><p>Pause any campaign instantly, set a spend floor with your wallet, and review every transcript.</p></div>
        </div>
      </section>

      <section className="section"><div className="card cta">
        <h2>Your first AI caller can be dialling today</h2>
        <p className="lead" style={{ margin: "0 auto 24px" }}>Create a workspace, add a campaign and test it on your own phone.</p>
        <Link className="btn primary lg" href="/login">Get started</Link>
      </div></section>

      <footer className="l-foot"><span>© Vaachak</span><span>AI telecalling for India</span></footer>
    </div>
  );
}
