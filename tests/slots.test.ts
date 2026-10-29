import { describe, expect, it } from "vitest";
import { nextSlots, zonedTimeToUtc } from "../lib/appointments/slots";

const cfg = { timezone: "Asia/Kolkata", open: "09:00", close: "18:00", days: [1, 2, 3, 4, 5, 6], slotMinutes: 30 };
describe("slots", () => {
  it("converts IST wall time to UTC", () => {
    expect(zonedTimeToUtc(2026, 10, 24, 9, 0, "Asia/Kolkata").toISOString()).toBe("2026-10-24T03:30:00.000Z");
  });
  it("respects the 60 minute lead time", () => {
    const now = new Date("2026-10-24T03:30:00Z"); // Sat 09:00 IST
    expect(nextSlots(cfg, [], now).map((d) => d.toISOString())).toEqual([
      "2026-10-24T04:30:00.000Z", "2026-10-24T05:00:00.000Z", "2026-10-24T05:30:00.000Z",
    ]);
  });
  it("skips closed days (Sunday)", () => {
    const now = new Date("2026-10-25T03:30:00Z"); // Sunday
    expect(nextSlots(cfg, [], now)[0].toISOString()).toBe("2026-10-26T03:30:00.000Z"); // Monday 09:00 IST
  });
  it("skips already booked slots", () => {
    const now = new Date("2026-10-24T03:30:00Z");
    const busy = [new Date("2026-10-24T04:30:00Z")];
    expect(nextSlots(cfg, busy, now)[0].toISOString()).toBe("2026-10-24T05:00:00.000Z");
  });
});
