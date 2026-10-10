import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

// Samples supplied by YemingMeng in issue #3:
// https://github.com/qrkks/zotero-annotation-markdown/issues/3#issuecomment-6082324605
const samples = [...readFileSync("tests/fixtures/issue-3-svg-samples.md", "utf8")
  .matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0L10 10"/><text x="5" y="20">Label</text></svg>';

function preview(source, language = "svg") {
  const html = createMarkdownRenderer({ isSvgEnabled: () => true }).render(`\`\`\`${language}\n${source}\n\`\`\``);
  const root = document.createElement("div"); root.innerHTML = html;
  const src = root.querySelector(".annotation-markdown-svg-image")?.getAttribute("src");
  const svg = src ? decodeURIComponent(src.slice(src.indexOf(",") + 1)) : null;
  return { root, svg, xml: svg ? new DOMParser().parseFromString(svg, "application/xml") : null };
}

function drawingSnapshot(xml) {
  return [...xml.querySelectorAll("*")]
    .filter(node => !["svg", "metadata", "style", "mask"].includes(node.localName))
    .map(node => ({
      name: node.localName,
      attrs: [...node.attributes].map(attr => [attr.name, attr.value]).sort(),
      text: ["text", "tspan", "title", "desc"].includes(node.localName) ? node.textContent : null
    }));
}

describe("real SVG samples and bounded export compatibility", () => {
  test.each([1, 3, 4, 5])("previews issue sample %s without changing its drawing or fallback source", sample => {
    expect(samples).toHaveLength(5);
    const source = samples[sample - 1];
    // Sample 4 has NBSP indentation in markup, rather than in its labels.
    const before = new DOMParser().parseFromString(sample === 4 ? source.replace(/\u00a0/g, " ") : source, "application/xml");
    for (const language of ["svg", ""]) {
      const result = preview(source, language);
      expect(result.svg).not.toBeNull();
      expect(drawingSnapshot(result.xml)).toEqual(drawingSnapshot(before));
      expect(result.xml.querySelector("metadata, style, mask")).toBeNull();
      expect(result.root.querySelector("svg")).toBeNull();
      expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
    }
  });

  test("preserves the embedded WOFF2 font and text layout in issue sample 2", () => {
    for (const language of ["svg", ""]) {
      const result = preview(samples[1], language);
      expect(result.svg).not.toBeNull();
      const before = new DOMParser().parseFromString(samples[1], "application/xml");
      expect(drawingSnapshot(result.xml)).toEqual(drawingSnapshot(before));
      expect(result.xml.querySelector("style").textContent).toContain("data:font/woff2;base64,");
      expect(result.root.querySelector("svg, style")).toBeNull();
      expect(result.root.querySelector("code").textContent).toBe(`${samples[1]}\n`);
    }
  });

  test.each(["body", "forms", "location"])("preserves local gradient IDs that overlap DOM properties: %s", id => {
    const source = simple.replace('<path ', `<defs><linearGradient id="${id}"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><path fill="url(#${id})" `);
    const result = preview(source);
    expect(result.svg).not.toBeNull();
    expect(result.xml.querySelector("linearGradient").getAttribute("id")).toBe(id);
    expect(result.xml.querySelector("path").getAttribute("fill")).toBe(`url(#${id})`);
    expect(result.root.querySelector("svg, linearGradient")).toBeNull();
  });

  test.each(["max-width:100%", " MAX-WIDTH : 100% ; "])("ignores only the root's known responsive layout style: %s", style => {
    const result = preview(simple.replace('<svg ', `<svg style="${style}" `));
    expect(result.svg).not.toBeNull();
    expect(result.xml.documentElement.hasAttribute("style")).toBe(false);
  });

  test("removes empty, unreferenced export extras from the preview only", () => {
    const source = simple.replace('<svg ', '<svg version="1.1" ')
      .replace('<path ', '<metadata/><defs><style class="style-fonts" type="text/css"> \n </style></defs><mask id="unused"/><path ');
    const result = preview(source);
    expect(result.svg).not.toBeNull();
    expect(result.xml.querySelector("metadata, style, mask")).toBeNull();
    expect(result.xml.documentElement.hasAttribute("version")).toBe(false);
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });

  test.each([
    simple.replace('<svg ', '<svg style="max-width:100%;fill:red" '),
    simple.replace('<svg ', '<svg style="max-width:50%" '),
    simple.replace('<path ', '<path style="max-width:100%" '),
    simple.replace('<path ', '<metadata>important data</metadata><path '),
    simple.replace('<path ', '<metadata onload="alert(1)"/><path '),
    simple.replace('<path ', '<style onload="alert(1)"/><path '),
    simple.replace('<path ', '<style>path { fill: red; }</style><path '),
    simple.replace('<path ', '<mask><rect width="10" height="10"/></mask><path '),
    simple.replace('<path ', '<mask id="paint"/><path fill="url(#paint)" '),
    simple.replace('<path ', '<metadata id="same"/><path id="same" ')
  ])("keeps unknown styles and nontrivial or unsafe export extras as escaped source (%#)", source => {
    const result = preview(source);
    expect(result.svg).toBeNull();
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
    expect(result.root.querySelector("svg, script, style, mask")).toBeNull();
  });

  test("counts original export extras before removing them", () => {
    const source = simple.replace('<path ', `${"<metadata/>".repeat(512)}<path `);
    const result = preview(source);
    expect(result.svg).toBeNull();
    expect(result.root.querySelector(".annotation-markdown-svg-error").textContent).toContain("512 elements");
  });

  test("normalizes markup whitespace while preserving text and quoted attribute values", () => {
    const source = '\u00a0<svg\u00a0xmlns="http://www.w3.org/2000/svg"\n\u202fviewBox="0 0 100 100">\n<text\u00a0x="5"\u202fy="20" font-family="Noto\u202fSans">First\u00a0second $x$</text>\n</svg>\u202f';
    const result = preview(source, "");
    expect(result.svg).not.toBeNull();
    expect(result.xml.querySelector("text").textContent).toBe("First\u00a0second $x$");
    expect(result.xml.querySelector("text").getAttribute("font-family")).toBe("Noto\u202fSans");
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });

  test.each([
    simple.replace('<path ', '<path\u00a0onload\u202f="alert(1)" '),
    simple.replace('<path ', '<path\u00a0fill="url(https://example.com/a.svg#x)" '),
    simple.replace('Label', '<![CDATA[<path\u00a0d="M0 0"/>]]>')
  ])("does not make unsupported content safe by normalizing whitespace (%#)", source => {
    const result = preview(source);
    expect(result.svg).toBeNull();
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });
});

describe("SVG path grammar", () => {
  test.each([
    "M100-200L70-12m-3-17 18 18z",
    "M0.6.5L.1-.2",
    "M1e2-2e1L-3.5.5",
    "M0 0A10 10 0 0110-10Z",
    "M0 0h10v-2l1 1c0 1 2 3 4 5s2 3 4 5q1 2 3 4t5 6a1 2 0 0 1 4 5z"
  ])("preserves valid compact path data: %s", path => {
    const result = preview(simple.replace("M0 0L10 10", path));
    expect(result.svg).not.toBeNull();
    expect(result.xml.querySelector("path").getAttribute("d")).toBe(path);
  });

  test.each([
    "L0 0", "M0", "M0 0L10", "M0 0Z0", "M0,,0", "M0 0,", "M0 0L1e- 3",
    "M0 0A10 10 0 2 0 2 3", "M0 0A-1 10 0 0 1 2 3", "M100001 0", "M1e999 0"
  ])("falls back for malformed or unbounded path data: %s", path => {
    const source = simple.replace("M0 0L10 10", path);
    const result = preview(source);
    expect(result.svg).toBeNull();
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });
});
