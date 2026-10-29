import { describe, expect, it } from "vitest";
import { rankFacts } from "../lib/knowledge/retrieve";

const facts = [
  { keywords: "haircut price cost", answer: "A haircut is 300 rupees." },
  { keywords: "opening hours timing", answer: "Open 9 to 7." },
];
describe("rankFacts", () => {
  it("finds the matching approved fact", () => {
    expect(rankFacts(facts, "what is the haircut price")[0].answer).toContain("300");
  });
  it("returns nothing for unrelated questions", () => {
    expect(rankFacts(facts, "do you sell pizza")).toEqual([]);
  });
  it("returns nothing for empty input", () => {
    expect(rankFacts(facts, "   ")).toEqual([]);
  });
});
