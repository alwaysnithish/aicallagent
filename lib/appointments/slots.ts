export type SlotConfig = { timezone: string; open: string; close: string; days: number[]; slotMinutes: number };

const dtf = (tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

function parts(tz: string, d: Date) {
  const o: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(d)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
}
/** Offset of tz from UTC in minutes at instant d. */
export function offsetMinutes(tz: string, d: Date): number {
  const p = parts(tz, d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000);
}
/** Local wall-clock time in tz -> UTC instant. */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const o1 = offsetMinutes(tz, new Date(guess));
  let t = guess - o1 * 60000;
  const o2 = offsetMinutes(tz, new Date(t));
  if (o2 !== o1) t = guess - o2 * 60000;
  return new Date(t);
}
const hm = (s: string) => { const [h, m] = s.slice(0, 5).split(":").map(Number); return h * 60 + m; };

/** Next free slots. days: 0=Sunday..6=Saturday in the business's local calendar. */
export function nextSlots(cfg: SlotConfig, busy: Date[], now: Date, count = 3, horizonDays = 14, leadMinutes = 60): Date[] {
  const busySet = new Set(busy.map((b) => b.getTime()));
  const open = hm(cfg.open), close = hm(cfg.close);
  const today = parts(cfg.timezone, now);
  const out: Date[] = [];
  for (let off = 0; off <= horizonDays && out.length < count; off++) {
    const cal = new Date(Date.UTC(today.year, today.month - 1, today.day + off));
    if (!cfg.days.includes(cal.getUTCDay())) continue;
    for (let t = open; t + cfg.slotMinutes <= close && out.length < count; t += cfg.slotMinutes) {
      const utc = zonedTimeToUtc(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), Math.floor(t / 60), t % 60, cfg.timezone);
      if (utc.getTime() < now.getTime() + leadMinutes * 60000) continue;
      if (busySet.has(utc.getTime())) continue;
      out.push(utc);
    }
  }
  return out;
}

export const formatSlot = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
