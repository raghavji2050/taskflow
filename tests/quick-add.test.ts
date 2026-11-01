import { describe, it, expect } from "vitest";
import { parseQuickAdd, formatQuickAddPreview } from "@/lib/quick-add";

// Sunday 1 Nov 2026, 07:30 IST
const now = new Date("2026-11-01T02:00:00Z");
const p = (s: string, timeZone?: string) => parseQuickAdd(s, { now, timeZone });

describe("parseQuickAdd", () => {
  it("parses the headline example", () => {
    expect(p("kal 5 baje client call")).toEqual({
      title: "client call", date: "2026-11-02", time: "17:00", priority: null, matched: true,
    });
  });
  it.each([
    ["aaj report bhejo", "2026-11-01"],
    ["kal gym", "2026-11-02"],
    ["parso bill pay", "2026-11-03"],
    ["today review PR", "2026-11-01"],
    ["tomorrow standup", "2026-11-02"],
  ])("relative day: %s", (s, date) => {
    expect(p(s).date).toBe(date);
  });
  it.each([
    ["somvar ko meeting", "2026-11-02", "meeting"],
    ["monday meeting", "2026-11-02", "meeting"],
    ["shukravar demo", "2026-11-06", "demo"],
    ["friday demo", "2026-11-06", "demo"],
    ["sunday plan", "2026-11-08", "plan"],
    ["ravivar plan", "2026-11-08", "plan"],
  ])("weekday: %s", (s, date, title) => {
    const r = p(s);
    expect(r.date).toBe(date);
    expect(r.title).toBe(title);
  });
  it.each([
    ["kal shaam 6 baje party", "18:00", "party"],
    ["kal subah 9 yoga", "09:00", "yoga"],
    ["kal subah 9 baje yoga", "09:00", "yoga"],
    ["call mom 5pm", "17:00", "call mom"],
    ["call mom 5 pm", "17:00", "call mom"],
    ["standup 10:30am", "10:30", "standup"],
    ["dopahar 2 baje lunch", "14:00", "lunch"],
    ["raat 10 baje backup", "22:00", "backup"],
    ["10 baje standup", "10:00", "standup"],
    ["14:15 sync", "14:15", "sync"],
    ["12am deploy", "00:00", "deploy"],
    ["12pm lunch", "12:00", "lunch"],
  ])("time: %s", (s, time, title) => {
    const r = p(s);
    expect(r.time).toBe(time);
    expect(r.title).toBe(title);
  });
  it("time without a day means today", () => {
    expect(p("5pm call").date).toBe("2026-11-01");
  });
  it("priority flags", () => {
    expect(p("kal 5 baje client call !high")).toMatchObject({ title: "client call", priority: "HIGH" });
    expect(p("!low groceries")).toMatchObject({ title: "groceries", priority: "LOW", date: null });
  });
  it("leaves plain titles and bare numbers alone", () => {
    expect(p("buy 2 apples")).toEqual({ title: "buy 2 apples", date: null, time: null, priority: null, matched: false });
    expect(p("shaam ki chai")).toMatchObject({ title: "shaam ki chai", matched: false });
  });
  it("respects timezone", () => {
    // 02:00Z is still Saturday 31 Oct in New York
    expect(p("kal x", "America/New_York").date).toBe("2026-11-01");
    expect(p("kal x", "Not/AZone").date).toBe("2026-11-02");
  });
  it("rejects invalid times", () => {
    expect(p("25:00 thing").time).toBeNull();
  });
  it("formats a preview", () => {
    expect(formatQuickAddPreview(p("kal 5 baje client call !high"), { now })).toBe("Kal (Mon, 2 Nov) · 5:00 PM · High priority");
  });
});
