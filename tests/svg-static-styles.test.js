import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createSvgRenderer } from "../src/svg-renderer.ts";

const supplied = readFileSync("tests/fixtures/facit-cost-validation.svg", "utf8");
const svg = (css, drawing = '<text x="10" y="30">Label</text>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>${css}</style>${drawing}</svg>`;
function preview(source, language = "svg") {
  const markdown = language === "raw" ? source : `\`\`\`${language}\n${source}\n\`\`\``;
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown);
  const image = root.querySelector(".annotation-markdown-svg-image");
  const xml = image ? new DOMParser().parseFromString(decodeURIComponent(image.getAttribute("src").split(",").slice(1).join(",")), "application/xml") : null;
  return { root, image, xml };
}

describe("bounded SVG type and class styles", () => {
  test.each(["svg", "", "raw"])("renders the supplied FACIT-COST diagram through %s without source edits", language => {
    const { root, image, xml } = preview(supplied, language);
    expect(image).not.toBeNull();
    expect(xml.querySelector("style, [class], [role], [aria-labelledby]")).toBeNull();
    const heading = xml.querySelector('text[y="38"]');
    expect(heading.getAttribute("font-family")).toBe('"Noto Sans CJK SC", "Microsoft YaHei", sans-serif');
    expect(heading.getAttribute("font-size")).toBe("23px");
    expect(heading.getAttribute("fill")).toBe("#1e293b");
    expect(xml.querySelector('text[y="251"]').getAttribute("fill")).toBe("#475569");
    // A CSS type selector also outranks a presentation attribute in SVG.
    expect(xml.querySelector('text[y="91"]').getAttribute("fill")).toBe("#1e293b");
    expect(xml.querySelectorAll("path[marker-end]")).toHaveLength(4);
    expect(image.alt).toContain("印度尼西亚版 FACIT-COST 的验证研究");
    expect(image.title).toContain("概括研究问题");
    expect(root.querySelector("svg, style, script, .annotation-markdown-svg-warning")).toBeNull();
    expect(root.querySelector("code").textContent.trimEnd()).toBe(supplied.trimEnd());
  });

  test("styles elements without class attributes and preserves ordinary inheritance", () => {
    const { xml } = preview(svg('g{fill:red} text,tspan{font-size:18px} rect{stroke:blue}',
      '<g><text><tspan>Label</tspan></text><rect width="5" height="5"/></g>'));
    expect(xml.querySelector("g").getAttribute("fill")).toBe("red");
    expect(xml.querySelector("text").hasAttribute("fill")).toBe(false);
    expect(xml.querySelector("tspan").getAttribute("font-size")).toBe("18px");
    expect(xml.querySelector("rect").getAttribute("stroke")).toBe("blue");
  });

  test.each([
    '.label{fill:red} text{fill:blue}',
    'text{fill:blue} .label{fill:red}',
    '.label,text{fill:red} text{fill:blue}'
  ])("uses matched selector specificity rather than stylesheet order alone (%#)", css => {
    const { xml } = preview(svg(css, '<text class="label" fill="pink">Class</text><text fill="pink">Type</text>'));
    expect(xml.querySelector('text:first-of-type').getAttribute("fill")).toBe("red");
    expect(xml.querySelector('text:last-of-type').getAttribute("fill")).toBe("blue");
  });

  test("uses later declarations at equal specificity across stylesheet elements", () => {
    const { xml } = preview(svg('text{fill:red;fill:green}', '<text>Label</text><style>text{fill:blue}</style>'));
    expect(xml.querySelector("text").getAttribute("fill")).toBe("blue");
  });

  test("resolves expanded font shorthand by specificity for each property", () => {
    const { xml } = preview(svg('.label{font-style:italic;font-size:24px} text{font:20px serif}', '<text class="label">Label</text>'));
    const text = xml.querySelector("text");
    expect(text.getAttribute("font-style")).toBe("italic");
    expect(text.getAttribute("font-size")).toBe("24px");
    expect(text.getAttribute("font-family")).toBe("serif");
    expect(text.getAttribute("font-weight")).toBe("normal");
  });

  test("uses the existing SVG element allowlist, including case-sensitive gradient names", () => {
    const { xml } = preview(svg('svg{font-size:18px} linearGradient{stop-color:red} stop{stop-opacity:0.5}',
      '<defs><linearGradient id="paint"><stop offset="0"/></linearGradient></defs><rect fill="url(#paint)"/>'));
    expect(xml.documentElement.getAttribute("font-size")).toBe("18px");
    expect(xml.querySelector("stop").getAttribute("stop-opacity")).toBe("0.5");
  });

  test.each(["svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path", "text", "tspan", "title", "desc", "defs", "marker", "linearGradient", "radialGradient", "stop"])("supports the existing %s element as a simple type selector", tag => {
    const drawing = tag === "svg" ? '<rect/>' : `<${tag}/>`;
    const { xml } = preview(svg(`${tag}{fill:red}`, drawing));
    expect(xml).not.toBeNull();
    const node = tag === "svg" ? xml.documentElement : xml.querySelector(tag);
    expect(node.getAttribute("fill")).toBe("red");
  });

  test.each([
    'text.label{fill:red}', 'g text{fill:red}', 'text:hover{fill:red}', '#label{fill:red}',
    '*{fill:red}', 'svg|text{fill:red}', '*|text{fill:red}', 'Text{fill:red}',
    'foreignObject{fill:red}', 'script{fill:red}', 'image{fill:red}', 'lineargradient{fill:red}',
    'text[font-size]{fill:red}', 'text{fill:red!important}',
    'text{fill:url(https://example.com/a.svg)}', 'rect{fill:url(#missing)}',
    'rect{fill:url(https://example.com/a.svg);fill:red}', 'text{font-size:var(--size)}',
    'text{transform:translate(10px)}', 'text{fill:red;broken}'
  ])("retains selector, resource and value restrictions, including unused rules (%#)", css => {
    const { root, xml } = preview(svg(css));
    expect(xml).toBeNull();
    expect(root.querySelector("svg, style, script, img")).toBeNull();
  });

  test.each([
    'text{fill:red}'.repeat(257),
    `text{${'fill:red;'.repeat(1025)}}`,
    `${Array(17).fill('text').join(',')}{fill:red}`
  ])("shares the existing rule, declaration and selector budgets (%#)", css => {
    expect(preview(svg(css)).xml).toBeNull();
  });

  test("supports the existing warned degradation on type rules", () => {
    const source = svg('text{fill:red;cursor:default}');
    const result = createSvgRenderer(window).renderDetailed(source, '<pre>source</pre>');
    expect(result.status).toBe("degraded");
    expect(result.omittedCount).toBe(1);
    expect(result.originalSource).toBe(source);
    expect(preview(source).xml.querySelector("text").getAttribute("fill")).toBe("red");
  });
});
