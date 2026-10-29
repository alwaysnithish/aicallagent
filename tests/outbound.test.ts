import { describe, expect, it } from "vitest";
import { normalizePhone, isDncRequest, withinCallingHours, parseContacts } from "../lib/outbound/pure";

describe("normalizePhone", () => {
  it("handles Indian formats", () => {
    expect(normalizePhone("98765 43210")).toBe("+919876543210");
    expect(normalizePhone("09876543210")).toBe("+919876543210");
    expect(normalizePhone("+919876543210")).toBe("+919876543210");
    expect(normalizePhone("919876543210")).toBe("+919876543210");
  });
  it("keeps other countries", () => expect(normalizePhone("+14155550123")).toBe("+14155550123"));
  it("rejects junk", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5876543210")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});
describe("isDncRequest", () => {
  it("detects opt-outs", () => {
    for (const t of ["please do not call me again", "stop calling", "call mat karo", "remove my number", "कॉल मत करना"]) expect(isDncRequest(t)).toBe(true);
  });
  it("ignores normal speech", () => expect(isDncRequest("yes you can call me tomorrow")).toBe(false));
});
describe("withinCallingHours", () => {
  it("uses the business timezone", () => {
    expect(withinCallingHours(new Date("2026-10-27T05:00:00Z"), "Asia/Kolkata", "10:00", "19:00")).toBe(true);  // 10:30 IST
    expect(withinCallingHours(new Date("2026-10-27T14:00:00Z"), "Asia/Kolkata", "10:00", "19:00")).toBe(false); // 19:30 IST
  });
});
describe("parseContacts", () => {
  it("parses header CSV, dedupes and skips bad rows", () => {
    const r = parseContacts("name,phone\nAman,98765 43210\nAman again,+919876543210\nBad,123\nRiya,\"9123456789\"");
    expect(r.rows.map((x) => x.phone)).toEqual(["+919876543210", "+919123456789"]);
    expect(r.skipped).toBe(2);
  });
  it("parses headerless phone-first CSV", () => expect(parseContacts("9876543210,Aman").rows[0]).toEqual({ name: "Aman", phone: "+919876543210" }));
});
