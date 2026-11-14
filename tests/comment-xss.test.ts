// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { escapeHtml, renderCommentBody } from "@/lib/mentions";

function renderToDom(body: string) {
  const el = document.createElement("p");
  el.innerHTML = renderCommentBody(body);
  return el;
}

describe("renderCommentBody (stored XSS)", () => {
  it("escapes a <script> tag so it renders as text", () => {
    const body = '<script>alert("xss")</script>';
    const html = renderCommentBody(body);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    const el = renderToDom(body);
    expect(el.querySelector("script")).toBeNull();
    expect(el.textContent).toBe(body);
  });

  it("neutralises <img onerror>", () => {
    const body = "<img src=x onerror=alert(document.cookie)>";
    const el = renderToDom(body);
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelectorAll("[onerror]").length).toBe(0);
    expect(el.textContent).toBe(body);
  });

  it("neutralises javascript: links", () => {
    const body = '<a href="javascript:alert(1)">click</a>';
    const el = renderToDom(body);
    expect(el.querySelector("a")).toBeNull();
    expect(el.textContent).toBe(body);
  });

  it("does not let quotes break out of the mention span attribute", () => {
    const body = `@Alice" onmouseover="alert(1)`;
    const el = renderToDom(body);
    expect(el.querySelectorAll("[onmouseover]").length).toBe(0);
    expect(el.textContent).toBe(body);
  });

  it("escapes HTML inside text around a mention", () => {
    const html = renderCommentBody("<b>hi</b> @Alice <svg onload=alert(1)>");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(html).toContain("&lt;svg onload=alert(1)&gt;");
    expect(html).not.toMatch(/<(b|svg)\b/);
  });

  it("still highlights @mentions", () => {
    const el = renderToDom("Thanks @Alice for the review");
    const span = el.querySelector("span.font-semibold");
    expect(span?.textContent).toBe("@Alice for the review");
    expect(el.textContent).toBe("Thanks @Alice for the review");
  });

  it("keeps plain text and ampersands readable", () => {
    const el = renderToDom("Q&A at 5 > 4 and 'quotes'");
    expect(el.textContent).toBe("Q&A at 5 > 4 and 'quotes'");
  });

  it("escapeHtml escapes all five special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
