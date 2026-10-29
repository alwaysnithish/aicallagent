"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { startTestCall, sendTestTurn, endTestCall } from "./actions";

type Msg = { r: "a" | "u"; x: string; src?: string | null };
const label = (s?: string | null) => (s === "gemini" ? "Gemini, from approved facts" : s === "approved_fact" ? "Approved fact" : null);

export default function TestCall() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, run] = useTransition();
  const booted = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    startTestCall().then((r) => setMsgs([{ r: "a", x: r.reply }])).catch(() => setErr("Could not start the call."));
  }, []);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [msgs]);

  function send(t: string) {
    t = t.trim();
    if (!t || busy) return;
    setText(""); setErr(null);
    setMsgs((m) => [...m, { r: "u", x: t }]);
    run(async () => {
      try { const r = await sendTestTurn(t); setMsgs((m) => [...m, { r: "a", x: r.reply, src: r.source }]); }
      catch { setErr("Something went wrong. Try again."); }
    });
  }
  function end() {
    run(async () => {
      try { await endTestCall(); const r = await startTestCall(); setMsgs([{ r: "a", x: r.reply }]); setErr(null); }
      catch { setErr("Could not end the call."); }
    });
  }

  return (
    <div className="card">
      <div className="chat" ref={box}>
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.r}`}>
            {m.x}
            {label(m.src) && <small>Source: {label(m.src)}</small>}
          </div>
        ))}
      </div>
      {err && <div className="notice er">{err}</div>}
      <form className="actions" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type what the caller says" maxLength={500} autoComplete="off" />
        <button className="btn primary" type="submit" disabled={busy}>Send</button>
        <button className="btn" type="button" onClick={end} disabled={busy}>End call</button>
      </form>
      <div className="actions">
        {["What is the price?", "When are you open?", "I want to book an appointment", "Can I talk to a person?"].map((q) => (
          <button key={q} className="btn" type="button" disabled={busy} onClick={() => send(q)}>{q}</button>
        ))}
      </div>
    </div>
  );
}
