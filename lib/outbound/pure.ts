import { createHmac, timingSafeEqual } from "node:crypto";

/** Normalise to E.164. Defaults to India (+91) for 10-digit numbers. Returns null if invalid. */
export function normalizePhone(input: string, defaultCountry = "91"): string | null {
  let s = String(input ?? "").trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (!s.startsWith("+")) {
    const d = s.replace(/\D/g, "");
    if (d.length === 10) {
      if (defaultCountry === "91" && !/^[6-9]/.test(d)) return null;
      s = "+" + defaultCountry + d;
    } else if (d.length === 11 && d.startsWith("0")) s = "+" + defaultCountry + d.slice(1);
    else if (d.length >= 11 && d.length <= 15) s = "+" + d;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

const DNC = [
  /do not call/i, /don'?t call/i, /stop calling/i, /remove (me|my number)/i, /take me off/i, /\bunsubscribe\b/i,
  /\b(call|phone|calling)\s+(mat|nahi|nahin)\b/i, /\bmat\s+(call|phone)\b/i, /number\s+(hata|delete|remove)/i,
  /(कॉल|फोन|फ़ोन)\s*(मत|नहीं)/, /नंबर\s*(हटा|डिलीट)/,
];
/** True if the person is asking not to be called again. */
export const isDncRequest = (t: string) => DNC.some((r) => r.test(t));

const mins = (s: string) => { const [h, m] = s.slice(0, 5).split(":").map(Number); return h * 60 + m; };
export function localMinutes(tz: string, d: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}
export function withinCallingHours(now: Date, tz: string, start: string, end: string): boolean {
  const n = localMinutes(tz, now), s = mins(start), e = mins(end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

function splitCsv(line: string) {
  const out: string[] = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
/** Parses "name,phone" or "phone,name" CSV, with or without a header row. Dedupes by phone. */
export function parseContacts(text: string, max = 5000): { rows: { name: string; phone: string }[]; skipped: number } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0 };
  const first = splitCsv(lines[0]).map((s) => s.toLowerCase());
  const PH = ["phone", "mobile", "number", "phone number", "mobile number"];
  const hasHeader = first.some((c) => PH.includes(c) || c === "name");
  let phoneIdx = 1, nameIdx = 0, start = 0;
  if (hasHeader) {
    phoneIdx = first.findIndex((c) => PH.includes(c)); nameIdx = first.findIndex((c) => c === "name"); start = 1;
    if (phoneIdx < 0) return { rows: [], skipped: lines.length - 1 };
  } else if (normalizePhone(first[0] ?? "")) { phoneIdx = 0; nameIdx = 1; }
  const seen = new Set<string>(); const rows: { name: string; phone: string }[] = []; let skipped = 0;
  for (const line of lines.slice(start, start + max)) {
    const c = splitCsv(line);
    const phone = normalizePhone(c[phoneIdx] ?? "");
    if (!phone || seen.has(phone)) { skipped++; continue; }
    seen.add(phone);
    rows.push({ name: (nameIdx >= 0 ? c[nameIdx] ?? "" : "").slice(0, 80), phone });
  }
  return { rows, skipped };
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export const hmacHex = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");
