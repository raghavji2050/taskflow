import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeSnippet } from "@/components/chat/CodeSnippet";

describe("CodeSnippet", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders code with language label", () => {
    render(<CodeSnippet code="const x = 1;" language="typescript" />);
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("const x = 1;")).toBeTruthy();
  });

  it("copies code to clipboard", async () => {
    render(<CodeSnippet code="hello" language="plaintext" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("collapses long snippets", () => {
    const code = Array.from({ length: 45 }, (_, i) => `line ${i + 1}`).join("\n");
    render(<CodeSnippet code={code} language="plaintext" collapseAfterLines={40} />);
    expect(screen.getByText(/Show more/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Show more/));
    expect(screen.getByText("Show less")).toBeTruthy();
  });
});
