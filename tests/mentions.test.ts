import { describe, it, expect } from "vitest";
import {
  MENTION_ALL_LABEL,
  isMentionAllAtPosition,
  parseMentionsFromBody,
  splitMessageBody,
} from "@/lib/mentions";

const members = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
  { id: "3", name: "Carol" },
];

describe("mentions @all", () => {
  it("detects @all token boundary", () => {
    expect(isMentionAllAtPosition("Hey @all please read", 4)).toBe(true);
    expect(isMentionAllAtPosition("Hey @allison", 4)).toBe(false);
  });

  it("expands @all to every member for notifications", () => {
    const mentioned = parseMentionsFromBody("Update @all", members);
    expect(mentioned.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
  });

  it("renders @all in message body segments", () => {
    const parts = splitMessageBody("Hi @all", members);
    expect(parts).toEqual([
      { type: "text", value: "Hi " },
      { type: "mention", value: MENTION_ALL_LABEL },
    ]);
  });

  it("still parses individual mentions alongside @all", () => {
    const mentioned = parseMentionsFromBody("@all and @Bob", members);
    expect(mentioned.map((m) => m.id).sort()).toEqual(["1", "2", "3"]);
  });
});
