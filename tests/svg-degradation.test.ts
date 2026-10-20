import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createSvgRenderer } from "../src/svg-renderer.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0L90 90"/><text x="10" y="30">中文 Label</text></svg>';
const hints = '<style>.hint{cursor:default;text-rendering:optimizeLegibility;shape-rendering:crispEdges}</style>';
const styled = (css: string, drawing = '<text class="label" x="10" y="30">Label</text>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>${css}</style>${drawing}</svg>`;
const fallback = (source: string) => `<pre><code>${source.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</code></pre>`;
const dom = (html: string) => { const box = document.createElement("div"); box.innerHTML = html; return box; };
const xml = (html: string) => {
  const source = requireValue(queryElement(dom(html), "img").getAttribute("src"));
  return new DOMParser().parseFromString(decodeURIComponent(source.split(",").slice(1).join(",")), "application/xml");
};

describe("production SVG graded degradation", () => {
  test("exposes structured complete, degraded and fallback results without retrying XML parsing", () => {
    const render = createSvgRenderer(window);
    const parser = vi.spyOn(DOMParser.prototype, "parseFromString");
    const source = simple.replace("</svg>", hints + "</svg>");
    try {
      const result = render.renderDetailed(source, fallback(source));
      expect(result.status).toBe("degraded");
      expect(result.originalSource).toBe(source);
      expect(result.omittedCount).toBe(3);
      expect(result.diagnostics.map(issue => {
        if (issue.kind !== "compatibility") throw new Error("Expected an SVG omission diagnostic");
        return issue.property;
      })).toEqual(["cursor", "text-rendering", "shape-rendering"]);
      expect(parser.mock.calls.filter(([text, type]) => text === source && type === "application/xml")).toHaveLength(1);
      expect(queryElement(dom(result.html), "figure > .annotation-markdown-svg-warning").textContent).toContain("3");
      expect(queryElement(dom(result.html), "code").textContent).toBe(source);
      expect(dom(result.html).querySelector("svg, style, script")).toBeNull();
      expect(render.renderDetailed(simple, fallback(simple)).status).toBe("complete");
      expect(render.renderDetailed(source, fallback(source), { allowDegradation: false }).status).toBe("fallback");
    } finally { parser.mockRestore(); }
  });

  const samples = [...readFileSync("tests/fixtures/issue-3-svg-samples.md", "utf8").matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
  for (const name of ["jordan", "efa-class-styles", "efa-font-shorthand"]) samples.push(readFileSync(`tests/fixtures/${name}.svg`, "utf8"));
  test.each(samples)("preserves an existing diagram while warning about omitted hints (%#)", (source: string) => {
    const render = createSvgRenderer(window);
    const original = render.renderDetailed(source, fallback(source));
    const hinted = source.replace(/<svg(?=[\s>])/, '<svg shape-rendering="crispEdges"').replace("</svg>", hints + "</svg>");
    const result = render.renderDetailed(hinted, fallback(hinted));
    expect(original.status).toBe("complete");
    expect(result.status).toBe("degraded");
    expect(result.omittedCount).toBe(4);
    expect(xml(result.html).documentElement.outerHTML).toBe(xml(original.html).documentElement.outerHTML);
    expect(queryElement(dom(result.html), "code").textContent).toBe(hinted);
  });

  test.each(["svg", "", "raw"])("uses graded rendering in the public Markdown path (%s)", language => {
    const source = styled('.label{font:italic bold 24px serif;cursor:default;font:18px Georgia;fill:red}');
    const markdown = language === "raw" ? source : `\`\`\`${language}\n${source}\n\`\`\``;
    const box = dom(createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown));
    const output = xml(box.innerHTML);
    expect(box.querySelectorAll(".annotation-markdown-svg-warning")).toHaveLength(1);
    expect(queryElement(box, "code").textContent.trimEnd()).toBe(source);
    expect(queryElement(output, "text").getAttribute("font-style")).toBe("normal");
    expect(queryElement(output, "text").getAttribute("font-weight")).toBe("normal");
    expect(queryElement(output, "text").getAttribute("font-size")).toBe("18px");
    expect(queryElement(output, "text").getAttribute("fill")).toBe("red");
  });

  const rejectedCss = [
    '.label{cursor:default;background:url(https://example.com/a)}',
    '.unused{fill:url(https://example.com/a)}.label{cursor:default;fill:red}',
    '.label{cursor:default;fill:url(https://example.com/a);fill:red}',
    '.label{cursor:url(https://example.com/a),default}',
    '@import "https://example.com/a.css";.label{cursor:default}',
    '@font-face{font-family:F;src:url(https://example.com/f.woff2)}.label{cursor:default}',
    '.label{cursor:default;fill:expression(alert(1))}',
    '.label{cursor:default;fill:u\\72l(https://example.com/a)}',
    '.label{cursor:default;broken;fill:red}', '.label{cursor:default;fill:red',
    '.label{cursor:default;fill:red;/* unfinished', '.label{cursor:default!important}',
    '.label{cursor:var(--cursor)}', '.label{cursor:default;color:red}',
    '.label{cursor:default;transform:translate(20px)}', '.label{cursor:default;font-size:100001}',
    '.label{cursor:default;marker-end:url(#missing)}', '.label{cursor:default;filter:blur(2px)}',
    '.label{cursor:default;fill:var(--paint)}', '.label:hover{cursor:default}',
    '@media all{.label{cursor:default}}', '.label{shape-rendering:url(#local)}',
    '.label{cursor:default;mask:url(#mask)}', '.label{cursor:"default"}',
    '.label{cursor:default;stroke-width:calc(1px + 1px)}'
  ];
  const rejectedDrawings = [
    '<script>alert(1)</script>', '<text class="label" onload="alert(1)">Text</text>',
    '<image href="https://example.com/a.png"/>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
    '<use href="#self" id="self"/>', '<animate attributeName="x"/>',
    '<g xmlns="http://www.w3.org/1999/xhtml"/>', '<text style="fill:red">Text</text>',
    '<path d="M0 0L1 1" transform="broken"/>', '<path d="M0 0L1 1" marker-end="url(#missing)"/>',
    '<path d="not a path"/>', '<mask id="mask"><rect width="100" height="100"/></mask>',
    '<g id="duplicate"/><g id="duplicate"/>', '<g><?test keep?></g>',
    '<text cursor="url(https://example.com/a)">Text</text>', '<text shape-rendering="url(#paint)">Text</text>',
    '<text xmlns:x="https://example.com" x:cursor="default">Text</text>'
  ];
  test.each([...rejectedCss.map(css => styled(css)), ...rejectedDrawings.map(drawing => styled('.label{cursor:default}', drawing)),
    simple.replace('</svg>', '<style>.label{<text>cursor:default</text>}</style></svg>'),
    simple.replace('</svg>', '<style><![CDATA[.label{cursor:default}]]></style></svg>'),
    '<?xml-stylesheet href="https://example.com/a.css"?>' + simple.replace('</svg>', hints + '</svg>'),
    '<!DOCTYPE svg [<!ENTITY a "x">]>' + simple.replace('</svg>', hints + '</svg>')
  ])("retains hard failures even alongside removable hints (%#)", (source: string) => {
    const result = createSvgRenderer(window).renderDetailed(source, fallback(source));
    expect(result.status).toBe("fallback");
    expect(result.originalSource).toBe(source);
    expect(requireValue(result.diagnostics.at(-1)).kind).not.toBe("compatibility");
    expect(dom(result.html).querySelector("img, svg, style, script, .annotation-markdown-svg-warning")).toBeNull();
    expect(queryElement(dom(result.html), "code").textContent).toBe(source);
  });

  test.each([
    simple.replace('</svg>', hints + 'x'.repeat(32000) + '</svg>'),
    simple.replace('</svg>', hints + '<g/>'.repeat(512) + '</svg>'),
    simple.replace('</svg>', '<g>'.repeat(32) + hints + '</g>'.repeat(32) + '</svg>'),
    simple.replace('100 100', '5000 5000').replace('</svg>', hints + '</svg>'),
    styled('.label{cursor:default}'.repeat(257)),
    styled('.label{' + 'cursor:default;'.repeat(1025) + '}'),
    styled('.label{' + 'font:16px serif;'.repeat(256) + 'cursor:default}'),
    styled(Array.from({length:17}, (_, i) => `.n${i}`).join(',') + '{cursor:default}')
  ])("counts original complexity before omitting anything (%#)", (source: string) => {
    expect(createSvgRenderer(window).renderDetailed(source, fallback(source)).status).toBe("fallback");
  });

  test("bounds and aggregates diagnostics while retaining the total omission count", () => {
    const source = styled('.label{' + 'cursor:default;'.repeat(20) + '}');
    const result = createSvgRenderer(window).renderDetailed(source, fallback(source));
    expect(result.status).toBe("degraded");
    expect(result.omittedCount).toBe(20);
    expect(result.diagnostics).toEqual([{code:"ignored-display-hint",kind:"compatibility",property:"cursor",location:"stylesheet",count:20}]);
    expect(dom(result.html).querySelectorAll(".annotation-markdown-svg-warning")).toHaveLength(1);
  });

  test("retains the existing empty-declaration compatibility without recovering unknown CSS", () => {
    const render = createSvgRenderer(window);
    const source = styled('.label{;;fill:red; ;cursor:default;;stroke:black;;}');
    const result = render.renderDetailed(source, fallback(source));
    expect(result.status).toBe("degraded");
    expect(result.omittedCount).toBe(1);
    expect(queryElement(xml(result.html), "text").getAttribute("stroke")).toBe("black");
    const dangerous = styled('.label{;;cursor:default;;broken;;fill:url(https://example.com/a)}');
    expect(render.renderDetailed(dangerous, fallback(dangerous)).status).toBe("fallback");
  });
});
