import { describe, expect, it } from "vitest";
import { matchPages, normalizeQuery, rankHits, scoreHit, scoreMatch, snippet } from "@/lib/global-search";

describe("normalizeQuery", () => {
  it("trims, collapses spaces and rejects short queries", () => {
    expect(normalizeQuery("  launch   plan ")).toBe("launch plan");
    expect(normalizeQuery("a")).toBe("");
    expect(normalizeQuery(null)).toBe("");
    expect(normalizeQuery("x".repeat(300))).toHaveLength(100);
  });
});

describe("scoreMatch", () => {
  it("ranks exact > prefix > word prefix > substring > all words", () => {
    expect(scoreMatch("Invoice", "invoice")).toBe(100);
    expect(scoreMatch("Invoice client", "invo")).toBe(80);
    expect(scoreMatch("Send invoice", "invo")).toBe(60);
    expect(scoreMatch("Reinvoice", "invo")).toBe(40);
    expect(scoreMatch("Fix login bug on mobile", "mobile login")).toBe(20);
    expect(scoreMatch("Nothing here", "invoice")).toBe(0);
    expect(scoreMatch(null, "x")).toBe(0);
  });

  it("weights secondary text at half", () => {
    expect(scoreHit("Weekly sync", "budget", "Talk about budget")).toBe(30);
    expect(scoreHit("Budget", "budget", "budget")).toBe(100);
  });
});

describe("rankHits", () => {
  it("drops zero scores, sorts by score and keeps recency on ties", () => {
    const hits = [{ id: "a", score: 40 }, { id: "b", score: 0 }, { id: "c", score: 80 }, { id: "d", score: 40 }];
    expect(rankHits(hits, 10).map((h) => h.id)).toEqual(["c", "a", "d"]);
    expect(rankHits(hits, 1).map((h) => h.id)).toEqual(["c"]);
  });
});

describe("matchPages", () => {
  it("finds pages by title or keyword", () => {
    expect(matchPages("insi")[0].href).toBe("/dashboard/reports/insights");
    expect(matchPages("kanban")[0].href).toBe("/dashboard/board");
    expect(matchPages("", 3)).toHaveLength(3);
    expect(matchPages("zzzz")).toEqual([]);
  });
});

describe("snippet", () => {
  it("strips markup and centres on the match", () => {
    expect(snippet("<p>Hello <b>world</b></p>", "world")).toBe("Hello world");
    const long = `${"a ".repeat(60)}needle ${"b ".repeat(60)}`;
    const s = snippet(long, "needle", 40)!;
    expect(s).toContain("needle");
    expect(s.startsWith("…")).toBe(true);
    expect(snippet("", "x")).toBeNull();
  });
});
