import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createSvgRenderer } from "../src/svg-renderer.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const sample = readFileSync("tests/fixtures/variance-decomposition.svg", "utf8");
const clip = '<clipPath id="crop"><rect x="5" y="5" width="90" height="90" rx="10"/></clipPath>';
const simple = (definitions = clip, drawing = '<rect width="100" height="100" fill="blue" clip-path="url(#crop)"/>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${definitions}</defs>${drawing}</svg>`;

function preview(source: string) {
  const result = createSvgRenderer(window).renderDetailed(source, "<pre>source</pre>");
  const root = document.createElement("div"); root.innerHTML = result.html;
  const src = root.querySelector("img")?.getAttribute("src");
  const xml = src ? new DOMParser().parseFromString(decodeURIComponent(src.slice(src.indexOf(",") + 1)), "application/xml") : null;
  return { result, root, xml };
}

describe("bounded static SVG clipping", () => {
  test.each(["svg", "", null])("preserves the variance example in %s input", language => {
    const markdown = language === null ? sample : `\`\`\`${language}\n${sample}\`\`\``;
    const root = document.createElement("div");
    root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown);
    const src = queryElement(root, "img", HTMLImageElement).src;
    const xml = new DOMParser().parseFromString(decodeURIComponent(src.slice(src.indexOf(",") + 1)), "application/xml");
    expect(queryElement(xml, "clipPath").id).toBe("variance-bar");
    expect(queryElement(xml, "clipPath rect").getAttribute("rx")).toBe("11");
    expect(queryElement(xml, "g[clip-path]").getAttribute("clip-path")).toBe("url(#variance-bar)");
    expect(xml.documentElement.textContent).toContain("一道题目的总方差 = 100%");
    expect(xml.documentElement.textContent).toContain("65%");
    expect(root.querySelector("svg, clipPath, script")).toBeNull();
    expect(queryElement(root, "code").textContent).toContain(sample.trimEnd());
    expect(root.querySelector(".annotation-markdown-svg > .annotation-markdown-svg-error, .annotation-markdown-svg-warning")).toBeNull();
  });

  test.each([undefined, "userSpaceOnUse", "objectBoundingBox"])("preserves clipping coordinates: %s", units => {
    const definition = clip.replace('<clipPath ', `<clipPath ${units ? `clipPathUnits="${units}" ` : ""}`);
    const { result, xml } = preview(simple(definition));
    expect(result.status).toBe("complete");
    expect(queryElement(xml, "clipPath").getAttribute("clipPathUnits")).toBe(units ?? null);
  });

  test("flattens safe class clipping and preserves none overrides", () => {
    const source = simple(`${clip}<style>.cropped { clip-path: url(#crop); } .plain { clip-path: none; }</style>`,
      '<rect class="cropped" width="100" height="100"/><circle class="cropped plain" cx="50" cy="50" r="20"/>');
    const { result, xml } = preview(source);
    expect(result.status).toBe("complete");
    expect(queryElement(xml, "svg > rect").getAttribute("clip-path")).toBe("url(#crop)");
    expect(queryElement(xml, "svg > circle").getAttribute("clip-path")).toBe("none");
  });

  test.each([
    '<rect x="5" y="5" width="90" height="90" rx="10"/>',
    '<circle cx="50" cy="50" r="40"/>',
    '<ellipse cx="50" cy="50" rx="40" ry="30"/>',
    '<line x1="5" y1="5" x2="90" y2="90"/>',
    '<polyline points="0,0 100,0 100,100 0,100"/>',
    '<polygon points="0,0 100,0 100,100 0,100"/>',
    '<path d="M0 0H100V100H0Z" clip-rule="evenodd" transform="translate(1 1)"/>'
  ])("accepts direct validated clipping geometry (%#)", shape => {
    expect(preview(simple(`<clipPath id="crop">${shape}</clipPath>`)).result.status).toBe("complete");
  });

  test.each([
    simple().replace('url(#crop)', 'url(https://example.com/c.svg#crop)'),
    simple().replace('url(#crop)', 'url(data:image/svg+xml;base64,AAAA)'),
    simple().replace('url(#crop)', 'url(#missing)'),
    simple('<linearGradient id="crop"><stop offset="0" stop-color="red"/></linearGradient>'),
    simple(clip, '<rect width="100" height="100" fill="url(#crop)"/>'),
    simple(clip, '<path d="M0 0L10 10" marker-end="url(#crop)"/>'),
    simple(clip.replace('<rect ', '<rect onload="alert(1)" ')),
    simple(clip.replace('<rect ', '<image href="https://example.com/image.png"/><rect ')),
    simple(clip.replace('<rect ', '<use href="#shape"/><rect ')),
    simple(clip.replace('<rect ', '<text x="0" y="10">unsupported clipping text</text><rect ')),
    simple(clip.replace('<rect ', '<g/><rect ')),
    simple(clip.replace('<rect ', '<clipPath id="nested"/><rect ')),
    simple(clip.replace('<rect ', '<rect clip-path="url(#crop)" ')),
    simple(clip.replace('id="crop"', 'id="crop" clip-path="url(#crop)"')),
    simple(clip.replace('<rect ', '<rect fill="url(#shade)" ') + '<linearGradient id="shade"/>'),
    simple(clip.replace('<rect ', '<rect class="recursive" ') + '<style>.recursive { clip-path: url(#crop); }</style>'),
    simple(clip.replace('id="crop"', 'id="crop" clipPathUnits="invalid"')),
    simple().replace('fill="blue"', 'fill="blue" clipPathUnits="userSpaceOnUse"'),
    simple(clip + clip),
    simple(clip + '<style>.unused { clip-path: url(https://example.com/a.svg#x); }</style>'),
    simple(clip + '<style>.unused { clip-path: url(#missing); }</style>'),
    simple('<clipPath id="crop" clip-path="url(#other)"><rect width="1" height="1"/></clipPath><clipPath id="other" clip-path="url(#crop)"><circle r="1"/></clipPath>')
  ])("rejects unsafe, unresolved or recursive clipping (%#)", source => {
    const { result, root, xml } = preview(source);
    expect(result.status).toBe("fallback");
    expect(result.originalSource).toBe(source);
    expect(xml).toBeNull();
    expect(root.querySelector("img, svg, clipPath, script, image, use")).toBeNull();
  });

  test("counts all clipping geometry toward the existing element limit", () => {
    const { result } = preview(simple(`<clipPath id="crop">${'<rect width="1" height="1"/>'.repeat(510)}</clipPath>`));
    expect(result.status).toBe("fallback");
    expect(requireValue(result.reason)).toContain("512 elements");
  });
});
