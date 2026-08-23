import { describe, expect, test, vi } from "vitest";

import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

describe("createMarkdownRenderer", () => {
  test("preserves single line breaks as visible breaks", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("first line\nsecond line");

    expect(html).toContain("first line<br>");
    expect(html).toContain("second line");
  });

  test("renders common markdown and automatically links bare URLs", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("**bold** and `code`\nhttps://example.com");

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("https://example.com");
    expect(html).toContain("<a href=\"https://example.com\">https://example.com</a>");
  });

  test("preserves and linkifies Zotero links handled by Weavero", () => {
    const renderer = createMarkdownRenderer();
    const url = "zotero://open/library/items/9X3PTDDP?annotation=NXKFRI46";

    const bareHtml = renderer.render(url);
    const markdownHtml = renderer.render(`[open annotation](${url})`);

    expect(bareHtml).toContain(`<a href="${url}">${url}</a>`);
    expect(markdownHtml).toContain(`<a href="${url}">open annotation</a>`);
    expect(renderer.render("zotero://select/library/items/9X3PTDDP"))
      .toContain('href="zotero://select/library/items/9X3PTDDP"');
    expect(renderer.render("zotero://open-pdf/library/items/9X3PTDDP?page=2"))
      .toContain('href="zotero://open-pdf/library/items/9X3PTDDP?page=2"');
    expect(renderer.render("zotero://note/u/9X3PTDDP"))
      .toContain('href="zotero://note/u/9X3PTDDP"');
  });

  test("continues to remove unsafe link protocols", () => {
    const renderer = createMarkdownRenderer({
      markdown: {
        render: () => (
          '<p><a href="javascript:alert(1)">unsafe</a>' +
          '<a href="zotero://debug/library/items/9X3PTDDP">unsupported</a></p>'
        ),
        use: vi.fn()
      }
    });

    const html = renderer.render("ignored");

    expect(html).toContain("<a>unsafe</a>");
    expect(html).toContain("<a>unsupported</a>");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("zotero://debug/");
  });

  test("does not trust raw HTML from annotation comments", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("<img src=x onerror=\"alert(1)\"><script>alert(2)</script>");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script");
  });

  test("sanitizes HTML returned by an injected Markdown renderer", () => {
    const renderer = createMarkdownRenderer({
      markdown: {
        render: () => '<p>safe</p><img src="x" onerror="alert(1)">',
        use: vi.fn()
      }
    });

    const html = renderer.render("ignored");

    expect(html).toContain("<p>safe</p>");
    expect(html).not.toContain("onerror");
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

  test("loads the math plugin only after math syntax appears", () => {
    const markdown = {
      render: vi.fn((source) => `<p>${source}</p>`),
      use: vi.fn()
    };
    const mathPlugin = vi.fn();
    const renderer = createMarkdownRenderer({
      markdown,
      mathPlugin,
      isMathEnabled: () => true
    });

    renderer.render("plain markdown only");
    renderer.render("area is $a^2$");
    renderer.render("another $b^2$");

    expect(markdown.use).toHaveBeenCalledTimes(1);
    expect(markdown.use).toHaveBeenCalledWith(
      mathPlugin,
      expect.objectContaining({ delimiters: ["dollars", "brackets"] })
    );
  });

  test("does not load the math plugin when math rendering is disabled", () => {
    const markdown = {
      render: vi.fn((source) => `<p>${source}</p>`),
      use: vi.fn()
    };
    const renderer = createMarkdownRenderer({
      markdown,
      mathPlugin: vi.fn(),
      mathPluginOptions: undefined,
      isMathEnabled: () => false
    });

    renderer.render("area is $a^2$");

    expect(markdown.use).not.toHaveBeenCalled();
  });

  test("renders math as plain markdown again after math rendering is disabled", () => {
    let mathEnabled = true;
    const renderer = createMarkdownRenderer({
      isMathEnabled: () => mathEnabled
    });

    expect(renderer.render("area is $a^2$")).toContain("katex");

    mathEnabled = false;

    expect(renderer.render("area is $a^2$")).toContain("$a^2$");
    expect(renderer.render("area is $a^2$")).not.toContain("katex");
  });

  test("renders inline LaTeX math with the default renderer", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("area is $a^2$");

    expect(html).toContain("katex");
    expect(html).toContain("a");
  });

  test("renders display LaTeX math with the default renderer", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("$$a^2$$");

    expect(html).toContain("katex-display");
    expect(html).toContain("a");
  });

  test("renders bracket-delimited inline LaTeX math with the default renderer", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("area is \\(a^2\\)");

    expect(html).toContain("katex");
    expect(html).toContain("a");
  });

  test("renders bracket-delimited display LaTeX math with the default renderer", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render("\\[a^2\\]");

    expect(html).toContain("katex-display");
    expect(html).toContain("a");
  });

  test("renders copied bracket display math without surrounding blank lines", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render(String.raw`怎么定义“贴近”？我们用**误差平方和**：
\[
S(a,b) = \sum_{i=1}^n (y_i - \hat{y}_i)^2 = \sum_{i=1}^n (y_i - a - bx_i)^2
\]
我们的目标是：找到参数 \(a,b\)，让 \(S(a,b)\) 取到**最小值**。`);

    expect(html).toContain("katex-display");
    expect(html).toContain("S");
    expect(html).toContain("katex");
  });

  test("renders copied double-escaped bracket display math without surrounding blank lines", () => {
    const renderer = createMarkdownRenderer();

    const html = renderer.render(String.raw`定义：
\\[
a^2 + b^2 = c^2
\\]
结论。`);

    expect(html).toContain("katex-display");
    expect(html).toContain("c");
  });

  test("renders copied bracket display math in list items with CRLF line endings", () => {
    const renderer = createMarkdownRenderer();
    const source = String.raw`### 2. 导数（dy/dx）是什么？
- 导数的原始定义是极限：
  \[
  f'(x) = \lim_{\Delta x \to 0} \frac{\Delta y}{\Delta x}
  \]
- 有了微分的定义之后，因为 \(dy = f'(x)dx\)，我们就可以把导数写成：
  \[
  f'(x) = \frac{dy}{dx}
  \]`.replaceAll("\n", "\r\n");

    const html = renderer.render(source);

    expect(html.match(/katex-display/g)).toHaveLength(2);
    expect(html).not.toContain("[<br>");
  });

  test("renders copied bracket display math in list items with non-breaking space indentation", () => {
    const renderer = createMarkdownRenderer();
    const indent = "\u00a0\u00a0";
    const source = [
      "### 2. 导数（dy/dx）是什么？",
      "- 导数的原始定义是极限：",
      `${indent}\\[`,
      `${indent}f'(x) = \\lim_{\\Delta x \\to 0} \\frac{\\Delta y}{\\Delta x}`,
      `${indent}\\]`,
      "- 有了微分的定义之后，因为 \\(dy = f'(x)dx\\)，我们就可以把导数写成：",
      `${indent}\\[`,
      `${indent}f'(x) = \\frac{dy}{dx}`,
      `${indent}\\]`
    ].join("\r\n");

    const html = renderer.render(source);

    expect(html.match(/katex-display/g)).toHaveLength(2);
    expect(html).not.toContain("[<br>");
  });
});
