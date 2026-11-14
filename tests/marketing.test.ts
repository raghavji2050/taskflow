import { describe, expect, it } from "vitest";
import { DISPLAY_PRICES, FAQ, HELP_ARTICLES, pricingCards } from "@/lib/marketing";
import { PLANS } from "@/lib/billing-plans";

describe("marketing content", () => {
  it("shows one pricing card per plan with INR display prices", () => {
    const cards = pricingCards();
    expect(cards.map((c) => c.id)).toEqual(["FREE", "PRO", "BUSINESS"]);
    expect(cards.find((c) => c.id === "PRO")?.price).toBe("₹299");
    expect(cards.find((c) => c.id === "BUSINESS")?.price).toBe("₹999");
    expect(cards.filter((c) => c.highlighted)).toHaveLength(1);
    for (const c of cards) expect(c.features).toEqual(PLANS[c.id].features);
  });

  it("help billing article matches plan limits and display prices", () => {
    const billing = HELP_ARTICLES.find((a) => a.id === "billing")!.steps.join(" ");
    expect(billing).toContain(DISPLAY_PRICES.PRO);
    expect(billing).toContain(DISPLAY_PRICES.BUSINESS);
    expect(billing).toContain(`${PLANS.FREE.limits.members} members`);
    expect(billing).toContain(`${PLANS.PRO.limits.members} members`);
  });

  it("help articles have unique anchor ids and steps", () => {
    const ids = HELP_ARTICLES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of HELP_ARTICLES) {
      expect(a.id).toMatch(/^[a-z-]+$/);
      expect(a.steps.length).toBeGreaterThan(0);
    }
    expect(FAQ.length).toBeGreaterThan(0);
  });
});
