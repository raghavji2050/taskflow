import { describe, it, expect } from "vitest";
import { getMentionableMembersForTest } from "@/lib/rich-message-extensions";

describe("rich-message mention members", () => {
  it("reads latest members from source when conversation changes", () => {
    let members = [{ id: "1", name: "Karan Bhardwaj" }];
    const source = {
      getMembers: () => members,
      getCurrentUserId: () => "self",
    };

    expect(getMentionableMembersForTest({ mentionMembers: source }).map((m) => m.name)).toEqual([
      "Karan Bhardwaj",
    ]);

    members = [{ id: "2", name: "Parveen Kumar" }];
    expect(getMentionableMembersForTest({ mentionMembers: source }).map((m) => m.name)).toEqual([
      "Parveen Kumar",
    ]);
  });

  it("excludes the current user from suggestions", () => {
    const source = {
      getMembers: () => [
        { id: "self", name: "Demo User" },
        { id: "2", name: "Parveen Kumar" },
      ],
      getCurrentUserId: () => "self",
    };

    expect(getMentionableMembersForTest({ mentionMembers: source }).map((m) => m.id)).toEqual(["2"]);
  });
});
