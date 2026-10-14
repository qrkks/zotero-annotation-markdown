import { describe, expect, test } from "vitest";
import { createSvgRenderer } from "../src/svg-renderer.ts";

const svg = (attributes = '', drawing = '<title id="title">Diagram title</title><desc id="desc">Diagram description</desc><text id="label">Visible label</text>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${attributes}>${drawing}</svg>`;
function preview(source) {
  const result = createSvgRenderer(window).renderDetailed(source, '<pre>source</pre>');
  const root = document.createElement("div"); root.innerHTML = result.html;
  return { ...result, root, image: root.querySelector("img") };
}

describe("static SVG accessibility metadata", () => {
  test("maps validated root metadata to image text rather than live SVG nodes", () => {
    const source = svg('role="img" aria-labelledby="title label" aria-describedby="desc"');
    const result = preview(source);
    expect(result.status).toBe("complete");
    expect(result.image.alt).toBe("Diagram title Visible label");
    expect(result.image.title).toBe("Diagram description");
    expect(result.originalSource).toBe(source);
    const xml = new DOMParser().parseFromString(decodeURIComponent(result.image.src.split(',').slice(1).join(',')), "application/xml");
    expect(xml.querySelector("[role], [aria-labelledby], [aria-describedby]")).toBeNull();
    expect(xml.querySelector("title").textContent).toBe("Diagram title");
    expect(result.root.querySelector("svg, style, script")).toBeNull();
  });

  test.each([
    ['aria-label="Custom label"', 'Custom label'],
    ['aria-label="Custom label" aria-labelledby="label"', 'Visible label'],
    ['role="img" aria-label="" aria-labelledby=""', 'Diagram title']
  ])("uses references, then direct labels, then the SVG title (%#)", (attributes, label) => {
    expect(preview(svg(attributes)).image.alt).toBe(label);
  });

  test("uses aria-describedby before the SVG description", () => {
    expect(preview(svg('aria-describedby="label"')).image.title).toBe("Visible label");
  });

  test("retains escaped metadata as literal text without adding markup or resources", () => {
    const label = '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;';
    const result = preview(svg(`role="img" aria-label="${label}"`));
    expect(result.status).toBe("complete");
    expect(result.image.alt).toBe('"><img src=x onerror=alert(1)>');
    expect(result.root.querySelectorAll("img")).toHaveLength(1);
    expect(result.root.querySelector("[onerror], script")).toBeNull();
  });

  test("bounds metadata output and retains the existing title fallback", () => {
    const result = preview(svg('role="img"', `<title>${'A'.repeat(200)}</title><desc>${'B'.repeat(2000)}</desc>`));
    expect(result.image.alt).toHaveLength(160);
    expect(result.image.title).toHaveLength(1024);
  });

  test.each([
    svg('role="button"'), svg('aria-live="assertive"'), svg('aria-labelledby="missing"'),
    svg('aria-describedby="missing"'), svg('aria-labelledby="https://example.com/title"'),
    svg('aria-labelledby="#title"'), svg(`aria-labelledby="${Array(17).fill('title').join(' ')}"`),
    svg(`aria-label="${'A'.repeat(1025)}"`),
    svg('', '<text role="img">Nested role</text>'),
    svg('', '<text aria-label="Nested label">Text</text>'),
    svg('xmlns:a="https://example.com" a:aria-label="Label"'),
    svg('role="img" onload="alert(1)"'),
    svg('role="img"', '<script>alert(1)</script>'),
    svg('role="img"', '<image href="https://example.com/a.png"/>')
  ])("rejects unsupported roles, references and resources without changing the source (%#)", source => {
    const result = preview(source);
    expect(result.status).toBe("fallback");
    expect(result.originalSource).toBe(source);
    expect(result.root.querySelector("img, svg, script, style")).toBeNull();
  });
});
