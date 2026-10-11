import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><text x="5" y="25">Label</text></svg>';
const issueSamples = [...readFileSync("tests/fixtures/issue-3-svg-samples.md", "utf8").matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
const samples = [...issueSamples, readFileSync("tests/fixtures/jordan.svg", "utf8").trim()];
const fence = (source, language = "svg") => `\`\`\`${language}\n${source}\n\`\`\``;
function preview(source, options = {}) {
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true, ...options }).render(source);
  return root;
}
function imageSource(root) {
  return root.querySelector(".annotation-markdown-svg-image")?.getAttribute("src");
}

describe("standalone raw SVG blocks", () => {
  test.each(samples.map((source, index) => [index + 1, source]))("uses the existing image policy for sample %s", (_index, source) => {
    for (const math of [false, true]) {
      const result = preview(source, { isMathEnabled: () => math });
      expect(imageSource(result)).toBe(imageSource(preview(fence(source))));
      expect(result.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
      expect(result.querySelector("code").textContent).toBe(`${source}\n`);
      expect(result.querySelector("svg, style, script")).toBeNull();
    }
  });

  test.each(samples.map((source, index) => [index + 1, source]))("renders sample %s next to Markdown without blank lines", (_index, source) => {
    const root = preview(`**Before** $x$\n${source}\n**After** $y$`);
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
    expect(imageSource(root)).toBe(imageSource(preview(fence(source))));
    expect(root.querySelector("code").textContent).toBe(`${source}\n`);
    expect([...root.querySelectorAll("strong")].map(node => node.textContent)).toEqual(["Before", "After"]);
    expect(root.querySelectorAll(".katex")).toHaveLength(2);
  });

  test.each([false, true])("renders separate SVG blocks between normal Markdown and math (math=%s)", math => {
    const source = `**Before** $x^2$\n\n${simple}\n\n## Between\n\n${simple}\n\n**After** $y$`;
    const root = preview(source, { isMathEnabled: () => math });
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(2);
    expect([...root.querySelectorAll("strong")].map(node => node.textContent)).toEqual(["Before", "After"]);
    expect(root.querySelector("h2").textContent).toBe("Between");
    expect(root.querySelectorAll(".katex").length).toBe(math ? 2 : 0);
  });

  test.each([
    ["paragraphs on both sides", "**Before** $x$", simple, "**After** $y$"],
    ["paragraph before", "Before", simple, ""],
    ["paragraph after", "", simple, "After"],
    ["headings", "# Before", simple, "## After"],
    ["multiline SVG", "Before", simple.replace("<text", "\n<text").replace("</svg>", "\n</svg>"), "After"],
    ["XML declaration and comments", "Before", `<?xml version="1.0"?>\n<!-- diagram -->\n${simple}`, "After"],
    ["list after", "Before", simple, "- After"],
    ["code block after", "Before", simple, "```text\nAfter\n```"],
    ["display math after", "Before", simple, "$$\ny^2\n$$"],
    ["copied non-breaking indentation", "Before", `\u00a0\u202f${simple}`, "After"]
  ])("recognizes independent lines without blank separators (%s)", (_name, before, svg, after) => {
    const source = [before, svg, after].filter(Boolean).join("\n");
    const expected = [before, fence(svg), after].filter(Boolean).join("\n");
    for (const math of [false, true]) {
      const root = preview(source, { isMathEnabled: () => math });
      expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
      expect(root.innerHTML).toBe(preview(expected, { isMathEnabled: () => math }).innerHTML);
      expect(root.querySelector("code").textContent).toBe(`${svg}\n`);
    }
  });

  test("recognizes consecutive standalone diagrams without empty lines", () => {
    const source = `Before\n${simple}\n${simple}\nAfter`;
    const root = preview(source);
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(2);
    expect(root.innerHTML).toBe(preview(`Before\n${fence(simple)}\n${fence(simple)}\nAfter`).innerHTML);
  });

  test("recognizes independent SVG lines with Windows line endings", () => {
    const source = `Before\r\n${simple}\r\nAfter`;
    expect(preview(source).innerHTML).toBe(preview(`Before\n${fence(simple)}\nAfter`).innerHTML);
    expect(preview(source).querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
  });

  test.each([
    `  ${simple}  `,
    `\u00a0\u202f${simple}`,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- diagram -->\n${simple}\n<!-- end -->`,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"/>',
    simple.replace("<text", "<!-- literal </svg> and <svg> -->\n<text"),
    simple.replace("<text", "<!--\n```\n~~~\n-->\n<text")
  ])("recognizes complete XML boundaries without being fooled by comments or fence markers (%#)", source => {
    const root = preview(source);
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
    expect(imageSource(root)).toBe(imageSource(preview(`~~~~svg\n${source}\n~~~~`)));
    expect(root.querySelector("code").textContent).toBe(`${source}\n`);
  });

  test("preserves literal SVG labels while rendering formulas outside the image", () => {
    const label = 'A\u00a0B\u202fC $x$ **bold** `code` \\[\n\\]';
    const svg = simple.replace("Label", label);
    const root = preview(`Equation $z$\n${svg}`);
    const data = imageSource(root);
    const xml = new DOMParser().parseFromString(decodeURIComponent(data.slice(data.indexOf(",") + 1)), "application/xml");
    expect(xml.querySelector("text").textContent).toBe(label);
    expect(root.querySelectorAll(".katex")).toHaveLength(1);
    expect(root.querySelector("strong")).toBeNull();
    expect(root.querySelector("code").textContent).toBe(`${svg}\n`);
  });

  test("keeps disabled SVG literal and uses the existing preference on refresh", () => {
    let enabled = false;
    const renderer = createMarkdownRenderer({ isSvgEnabled: () => enabled });
    const source = simple.replace("Label", "A\u00a0B $x$ **bold**");
    const before = document.createElement("div"); before.innerHTML = renderer.render(source);
    expect(before.querySelector("img, .katex, strong, svg")).toBeNull();
    expect(before.querySelector("code").textContent).toBe(`${source}\n`);
    enabled = true;
    const rendered = document.createElement("div"); rendered.innerHTML = renderer.render(source);
    expect(imageSource(rendered)).toBeDefined();
    enabled = false;
    expect(renderer.render(source)).toBe(before.innerHTML);
  });

  test.each([
    `Before ${simple} after`,
    `Before ${simple}\nAfter`,
    `Before\n${simple} after`,
    `\`${simple}\``,
    `    ${simple}`,
    `\t${simple}`,
    `> ${simple}`,
    `> Before\n${simple}\nAfter`,
    `- ${simple}`,
    `1. ${simple}`,
    `- Item\n\n  ${simple}`,
    `- Before\n  ${simple}\n  After`,
    `<div>\n${simple}\n</div>`,
    `<div>\n\n${simple}\n\n</div>`,
    `<!-- example\n\n${simple}\n\n-->`,
    ...["xml", "html", "text", "javascript"].map(language => fence(simple, language))
  ])("keeps inline, nested, HTML-wrapped and explicitly fenced source examples unchanged (%#)", source => {
    expect(preview(source).innerHTML).toBe(preview(source, { isSvgEnabled: () => false }).innerHTML);
    expect(preview(source).querySelector(".annotation-markdown-svg-image, svg")).toBeNull();
  });

  test("an unfinished SVG does not consume later Markdown or a complete diagram", () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg">\n<text>unfinished\n\n## Still readable\n\n**After** $x$\n\n${simple}`;
    const root = preview(source);
    expect(root.querySelector("h2").textContent).toBe("Still readable");
    expect(root.querySelector("strong").textContent).toBe("After");
    expect(root.querySelectorAll(".katex")).toHaveLength(1);
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
  });

  test.each(["$$", "\\[", "\\\\["])("keeps SVG-looking examples inside display math unchanged (%s)", opening => {
    const closing = opening === "$$" ? "$$" : opening.slice(0, -1) + "]";
    const root = preview(`${opening}\n\n${simple}\n\n${closing}\n\n${simple}`);
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
    expect(root.querySelector(".katex, .katex-error").textContent).not.toContain("```svg");
  });

  test.each([
    simple.replace("<text", "<script>alert(1)</script><text"),
    simple.replace("<text", '<image href="https://example.com/x.png"/><text'),
    simple.replace("<text", '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject><text'),
    simple.replace("<text ", '<text onload="alert(1)" '),
    simple.replace("<text", '<animate attributeName="x"/><text'),
    simple.replace("<text", '<style>text{fill:red}</style><text'),
    simple.replace("<text", '<![CDATA[literal </svg>]]><text'),
    simple.replace("</text>", "</g>"),
    simple.replace("http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml"),
    simple.replace("Label", "x".repeat(33000))
  ])("retains the original code and following text for unsupported, malformed or oversized SVG (%#)", svg => {
    const root = preview(`${svg}\n**After** $x$`);
    expect(root.querySelector(".annotation-markdown-svg-image, svg, script, style, foreignObject")).toBeNull();
    expect(root.querySelector("code").textContent).toBe(`${svg}\n`);
    expect(root.querySelector(".annotation-markdown-svg-error")).not.toBeNull();
    expect(root.querySelector("strong").textContent).toBe("After");
    expect(root.querySelectorAll(".katex")).toHaveLength(1);
  });

  test("still escapes ordinary HTML instead of opening a general HTML rendering path", () => {
    const root = preview(`<div onclick="alert(1)">**Visible source**</div>\n\n${simple}\n\n<script>alert(1)</script>`);
    expect(root.querySelector("svg, script, [onclick]")).toBeNull();
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
    expect(root.textContent).toContain('<script>alert(1)</script>');
  });
});
