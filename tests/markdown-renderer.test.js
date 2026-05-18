import { describe, expect, test } from "vitest";

import { createMarkdownRenderer } from "../src/markdown-renderer.js";

describe("createMarkdownRenderer", () => {
  test("preserves single line breaks as visible breaks", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("first line\nsecond line");

    expect(html).toContain("first line<br>");
    expect(html).toContain("second line");
  });

  test("renders common markdown without enabling URL auto-linking", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("**bold** and `code`\nhttps://example.com");

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("https://example.com");
    expect(html).not.toContain("<a href=\"https://example.com\"");
  });

  test("does not trust raw HTML from annotation comments", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("<img src=x onerror=\"alert(1)\"><script>alert(2)</script>");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script");
  });

  test("falls back to escaped plain text if markdown rendering throws", () => {
    const renderer = createMarkdownRenderer({
      markdown: {
        render() {
          throw new Error("boom");
        }
      }
    });

    const html = renderer.render("<b>x</b>\ny");

    expect(html).toBe("&lt;b&gt;x&lt;/b&gt;<br>y");
  });
});
