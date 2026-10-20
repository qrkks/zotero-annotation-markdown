import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const efa = readFileSync("tests/fixtures/efa-class-styles.svg", "utf8");
const svg = (css: string, drawing = '<rect class="node" width="80" height="60"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><style>${css}</style></defs>${drawing}</svg>`;
function preview(source: string, language = "svg") {
  const markdown = language === "raw" ? source : `\`\`\`${language}\n${source}\n\`\`\``;
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown);
  const image = root.querySelector(".annotation-markdown-svg-image");
  const clean = image ? decodeURIComponent(requireValue(image.getAttribute("src")).split(",").slice(1).join(",")) : null;
  return { root, xml: clean ? new DOMParser().parseFromString(clean, "application/xml") : null };
}

describe("bounded SVG class styles", () => {
  test.each(["svg", "", "raw"])("renders the supplied EFA diagram through %s input without changing stored source", language => {
    const result = preview(efa, language);
    expect(result.xml).not.toBeNull();
    expect(requireValue(result.xml).querySelectorAll("*")).toHaveLength(65);
    expect(requireValue(result.xml).querySelector("style, [class]")).toBeNull();
    expect(queryElement(result.xml, "rect").getAttribute("fill")).toBe("#faf8f2");
    const title = queryElement(result.xml, "text");
    expect(title.textContent.trim()).toBe("探索性因素分析（EFA）流程");
    expect(title.getAttribute("font-size")).toBe("25px");
    expect(title.getAttribute("text-anchor")).toBe("middle");
    const edges = [...requireValue(result.xml).querySelectorAll("path[marker-end]")];
    expect(edges.length).toBeGreaterThan(8);
    expect(edges.every(node => node.getAttribute("marker-end") === "url(#efa-arrow)")).toBe(true);
    expect(queryElement(result.xml, 'path[stroke="#b45309"]').getAttribute("stroke-dasharray")).toBe("7 5");
    expect(result.root.querySelector("svg, style")).toBeNull();
    expect(queryElement(result.root, "code").textContent.trimEnd()).toBe(efa.trimEnd());
  });

  test("uses stylesheet order rather than class-token order, including repeated declarations and grouped selectors", () => {
    const source = svg(".first, .other {fill:red;stroke:black}.second{fill:blue}.first{fill:yellow;fill:green}",
      '<rect class="second first" fill="pink" width="80" height="60"/><circle class="other" r="5"/>');
    const result = preview(source);
    expect(queryElement(result.xml, "rect").getAttribute("fill")).toBe("green");
    expect(queryElement(result.xml, "rect").getAttribute("stroke")).toBe("black");
    expect(queryElement(result.xml, "circle").getAttribute("fill")).toBe("red");
  });

  test("preserves inheritance and document order across stylesheets", () => {
    const source = svg(".node {fill:red;font-family:'Noto Sans SC',sans-serif}",
      '<g class="node"><text x="5" y="20">A  B</text><rect fill="blue" width="20" height="20"/></g>' +
      '<style>.node {font-size:21px;fill:green}</style>');
    const result = preview(source);
    expect(queryElement(result.xml, "g").getAttribute("fill")).toBe("green");
    expect(queryElement(result.xml, "g").getAttribute("font-size")).toBe("21px");
    expect(queryElement(result.xml, "text").hasAttribute("fill")).toBe(false);
    expect(queryElement(result.xml, "text").textContent).toBe("A  B");
    expect(queryElement(result.xml, "rect").getAttribute("fill")).toBe("blue");
  });

  test("accepts comments, property-name case, harmless unmatched classes and an empty class list", () => {
    const source = svg("/* note */ .node /* selector */ { FILL: red; /* drawing */ stroke-width: 2; }",
      '<rect class="node unused" width="80" height="60"/><g class=" "/>');
    const result = preview(source);
    expect(queryElement(result.xml, "rect").getAttribute("fill")).toBe("red");
    expect(queryElement(result.xml, "rect").getAttribute("stroke-width")).toBe("2");
    expect(requireValue(result.xml).querySelector("[class]")).toBeNull();
  });

  test("retains restricted embedded fonts while expanding class declarations", () => {
    const font = requireValue(readFileSync("tests/fixtures/issue-3-svg-samples.md", "utf8").match(/data:font\/woff2;base64,([^)]*)/))[1];
    const source = svg(`@font-face{font-family:Cascadia;src:url(data:font/woff2;base64,${font})}.label{font-family:Cascadia;font-size:22px;fill:blue}`,
      '<text class="label" x="5" y="30" style="white-space: pre;">A  B</text>');
    const result = preview(source);
    expect(queryElement(result.xml, "style").textContent).toContain(font);
    expect(queryElement(result.xml, "style").textContent).not.toContain(".label");
    expect(queryElement(result.xml, "text").getAttribute("font-family")).toBe("Cascadia");
    expect(queryElement(result.xml, "text").getAttribute("style")).toBe("white-space: pre;");
    expect(result.root.querySelector("style")).toBeNull();
  });

  test("validates local gradients and markers used only by CSS declarations", () => {
    const source = svg(".node{fill:url(#paint);marker-end:url(#arrow)}",
      '<defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient>' +
      '<marker id="arrow" markerWidth="9" markerHeight="9"><path d="M0 0L9 4L0 9Z"/></marker></defs>' +
      '<path class="node" d="M0 0L80 80"/>');
    const result = preview(source);
    expect(queryElement(result.xml, 'path[marker-end]').getAttribute("fill")).toBe("url(#paint)");
  });

  test.each([
    ".node:hover{fill:red}", ".node.extra{fill:red}", ".outer .node{fill:red}",
    "#node{fill:red}", "foreignObject{fill:red}", ".node > path{fill:red}", "*{fill:red}",
    "@import url(https://example.com/a.css);", "@media all{.node{fill:red}}",
    ".node{fill:red!important}", ".node{color:red}", ".node{font-size:var(--size)}",
    ".node{fill:url(https://example.com/a.svg#paint)}", ".node{fill:url(data:image/svg+xml,x)}",
    ".node{fill:expression(alert(1))}", ".node{fill:red", ".node{fill:red}trailing",
    ".node{fill:red;broken}", ".node{fill:red;stroke:{}}", ".node{font-family:'unfinished}",
    ".n\\6fde{fill:red}", "/* unfinished", ".node{fill:url(#missing)}",
    ".unused{fill:url(https://example.com/a.svg)}", ".unused{fill:url(#missing)}",
    ".node{fill:url(https://example.com/a.svg);fill:red}", ".node{font-size:100001}"
  ])("rejects unsupported CSS without mounting markup (%#)", css => {
    const source = svg(css); const result = preview(source);
    expect(result.xml).toBeNull();
    expect(queryElement(result.root, "code").textContent).toBe(`${source}\n`);
    expect(result.root.querySelector("svg, style, script")).toBeNull();
  });

  test.each([
    svg(".node{fill:red}", '<rect class="node" fill="url(https://example.com/a.svg)"/>'),
    svg(".node{fill:red}", '<rect class="node" onload="alert(1)"/>'),
    svg(".node{fill:red}", '<rect class="node" style="fill:blue"/>'),
    svg(".node{fill:red}").replace('<style>', '<style onload="alert(1)">'),
    svg(".node{fill:red}").replace('class="node"', 'class="node.bad"'),
    svg(".node{fill:red}").replace('class="node"', 'class="node\u00a0other"'),
    svg(".node{fill:red}").replace('class="node"', 'class="\u00a0node\u00a0"'),
    svg(".node{fill:url(#paint)}", '<defs><linearGradient id="paint"/><marker><path class="node" d="M0 0"/></marker></defs>'),
    svg(".node{fill:url(#paint)}", '<mask id="paint"/><rect class="node"/>')
  ])("keeps original attribute and element restrictions even when a rule could overwrite them (%#)", (source: string) => {
    expect(preview(source).xml).toBeNull();
  });

  test.each([
    svg(".node{fill:red}".repeat(257)),
    svg(`.node{${"fill:red;".repeat(1025)}}`),
    svg(`${Array.from({ length: 17 }, (_, i) => `.n${i}`).join(",")}{fill:red}`),
    svg(".node{fill:red}", `<rect class="${Array.from({ length: 17 }, (_, i) => `n${i}`).join(" ")}"/>`)
  ])("bounds rules, declarations, selectors and per-element classes (%#)", (source: string) => {
    expect(preview(source).xml).toBeNull();
  });

  test("still counts original elements before removing styles", () => {
    expect(preview(svg(".node{fill:red}", `${"<style>.node{fill:red}</style>".repeat(512)}<rect class="node"/>`)).xml).toBeNull();
  });
});
