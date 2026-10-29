const STOP = new Set(
  "the a an is are what how do you your i me my to of for and or in on at it can please tell about much does have there with this that".split(" "),
);
const toks = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9₹ ]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

export type Fact = { keywords: string; answer: string };

/** Keyword-overlap ranking over APPROVED facts only (caller passes only approved facts). English-only for now. */
export function rankFacts(facts: Fact[], query: string): Fact[] {
  const qt = toks(query);
  if (!qt.length) return [];
  return facts
    .map((f) => {
      const ft = [...new Set(toks(`${f.keywords} ${f.answer}`))];
      const hits = qt.filter(
        (w) => ft.includes(w) || (w.length > 3 && ft.some((x) => x.length > 3 && x.startsWith(w.slice(0, 4)))),
      );
      return { f, score: hits.length / qt.length };
    })
    .filter((x) => x.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}
