import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettings } from "../src/settings.ts";

const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 280"><rect width="640" height="280" fill="#f8fafc"/><text x="20" y="35" font-size="18">Jordan 变换</text><polygon points="20,200 130,200 185,90 75,90" fill="#fbbf24"/></svg>';
const fence = source => `\`\`\`svg\n${source}\n\`\`\``;
const render = source => createMarkdownRenderer({ isSvgEnabled: () => true }).render(fence(source));
function imageSvg(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  const src = root.querySelector(".annotation-markdown-svg-image")?.getAttribute("src");
  return src ? decodeURIComponent(src.slice(src.indexOf(",") + 1)) : null;
}
afterEach(() => { document.body.innerHTML = ""; });

describe("opt-in SVG fences", () => {
  test("preserves the supplied Jordan diagram's shapes, labels and drawing attributes", () => {
    const source = readFileSync("tests/fixtures/jordan.svg", "utf8");
    const before = new DOMParser().parseFromString(source, "application/xml");
    const after = new DOMParser().parseFromString(imageSvg(render(source)), "application/xml");
    const snapshot = xml => [...xml.querySelectorAll("*")].map(node => ({
      name: node.localName,
      attrs: [...node.attributes].map(attr => [attr.name, attr.value]).sort(),
      text: node.children.length ? null : node.textContent
    }));
    expect(snapshot(after)).toEqual(snapshot(before));
    expect(after.querySelectorAll("*")).toHaveLength(24);
  });

  test("persists a boolean SVG preference and treats malformed stored choices as disabled", () => {
    const values = new Map();
    const settings = createSettings({ prefs: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) } });
    settings.setSvgEnabled(true);
    expect(values.get("extensions.annotationMarkdown.svgEnabled")).toBe(true);
    expect(settings.isSvgEnabled()).toBe(true);
    settings.setSvgEnabled(false); expect(settings.isSvgEnabled()).toBe(false);
    for (const value of [undefined, null, "true", "false", 1]) expect(createSettings({ prefs: { get: () => value } }).isSvgEnabled()).toBe(false);
  });
  test("keeps fences as source by default and does not enable raw HTML", () => {
    const renderer = createMarkdownRenderer();
    expect(renderer.render(fence(simple))).toContain('class="language-svg"');
    expect(renderer.render(fence(simple))).not.toContain('data:image/svg+xml');
    expect(imageSvg(renderer.render(simple))).toBeNull();
    expect(imageSvg(render(simple))).toContain("Jordan 变换");
    expect(createSettings().isSvgEnabled()).toBe(false);
  });

  test("renders mixed Markdown, math and multiple isolated images", () => {
    const renderer = createMarkdownRenderer({ isSvgEnabled: () => true });
    document.body.innerHTML = renderer.render(`**diagram** $x^2$\n\n${fence(simple)}\n\n${fence(simple)}`);
    expect(document.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(2);
    expect(document.querySelectorAll(".annotation-markdown-svg-open")).toHaveLength(2);
    expect(document.querySelector("strong").textContent).toBe("diagram");
    expect(document.querySelector(".katex")).not.toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  test("keeps Unicode whitespace and math-looking SVG labels intact", () => {
    const source = simple.replace("Jordan 变换", "Jordan\u00a0变换 $x$ \\\\[\n\\\\]");
    expect(imageSvg(render(source))).toContain("Jordan\u00a0变换 $x$ \\\\[\n\\\\]");
  });

  test("preserves only local marker and gradient references", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><marker id="arrow" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto"><polygon points="0,0 10,3.5 0,7" fill="blue"/></marker><linearGradient id="shade"><stop offset="0%" stop-color="blue"/><stop offset="100%" stop-color="white"/></linearGradient></defs><path d="M10 50H90" stroke="blue" marker-end="url(#arrow)"/><rect width="10" height="10" fill="url(#shade)"/></svg>';
    const output = imageSvg(render(source));
    expect(output).toContain('marker-end="url(#arrow)"');
    expect(output).toContain('fill="url(#shade)"');
    expect(output).toContain("linearGradient");
    expect(output).toContain('<marker id="arrow"');
    expect(output).toContain('<stop offset="0%"');
  });

  test.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    simple.replace('<rect ', '<rect onload="alert(1)" '),
    simple.replace('<rect ', '<rect style="fill:red" '),
    '<svg xmlns="http://www.w3.org/2000/svg"><style>body{color:red}</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/x.png"/></svg>',
    simple.replace('fill="#f8fafc"', 'fill="url(https://example.com/a.svg#x)"'),
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="#self" id="self"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="x"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a "boom">]><svg xmlns="http://www.w3.org/2000/svg"><text>&a;</text></svg>',
    '<svg xmlns="http://www.w3.org/1999/xhtml"><path/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>unclosed',
    simple.replace('640 280', '640 0'),
    simple.replace('640 280', '640 1e999'),
    simple.replace('width="640"', 'width="99999999"'),
    '<svg xmlns="http://www.w3.org/2000/svg"><g id="x"/><g id="x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1" marker-end="url(#missing)"/></svg>'
  ])("falls back to escaped code for unsupported or invalid SVG (%#)", source => {
    const html = render(source);
    expect(imageSvg(html)).toBeNull();
    expect(html).toContain("annotation-markdown-svg-error");
    const root = document.createElement("div"); root.innerHTML = html;
    expect(root.querySelector("code").textContent).toContain(source);
    expect(root.querySelector("svg, script, style, foreignObject")).toBeNull();
  });

  test("limits source size, elements and nesting, and fails closed without a DOM", () => {
    for (const source of [
      simple.replace("Jordan 变换", "x".repeat(33000)),
      `<svg xmlns="http://www.w3.org/2000/svg">${"<rect/>".repeat(513)}</svg>`,
      `<svg xmlns="http://www.w3.org/2000/svg">${"<g>".repeat(33)}${"</g>".repeat(33)}</svg>`
    ]) expect(imageSvg(render(source))).toBeNull();
    const renderer = createMarkdownRenderer({ windowRef: null, isSvgEnabled: () => true });
    expect(imageSvg(renderer.render(fence(simple)))).toBeNull();
  });
});

describe("SVG preview lifecycle", () => {
  async function fixture({ popup = false, fast = true, strategy = "eager", tinyCache = false } = {}) {
    document.body.innerHTML = `${popup ? '<div class="annotation-popup">' : ''}<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="expandable-editor"><div class="content" contenteditable="true"></div></div></div></div>${popup ? '</div>' : ''}`;
    const source = fence(simple); document.querySelector(".content").textContent = source;
    const settings = createSettings(); settings.setSvgEnabled(true); settings.setPopupEnabled(popup); settings.setRenderStrategy(strategy);
    const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => fast, commitComment: () => true });
    const controller = createReaderController({
      reader: { document }, adapter, settings,
      renderer: createMarkdownRenderer({ isSvgEnabled: () => settings.isSvgEnabled() }),
      MutationObserver: null, IntersectionObserver: null,
      ...(tinyCache ? { renderCacheMaxBytes: 1 } : {})
    });
    await controller.start();
    return { source, settings, controller, adapter };
  }

  test.each(["auto", "eager", "lazy"])("refreshes live SVG choices even without a cache (%s)", async strategy => {
    const f = await fixture({ strategy, tinyCache: true });
    try {
      expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
      f.settings.setSvgEnabled(false); f.controller.refresh();
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
      expect(document.querySelector("code.language-svg").textContent.trim()).toBe(simple);
      f.settings.setSvgEnabled(true); f.controller.refresh();
      expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test.each([[false,true], [true,true], [false,false], [true,false]])("opens and closes a large image without editing (popup=%s fast=%s)", async (popup,fast) => {
    const f = await fixture({ popup, fast });
    try {
      const button = document.querySelector(".annotation-markdown-svg-open");
      const preview = document.querySelector(".annotation-markdown-rendered");
      const src = document.querySelector(".annotation-markdown-svg-image").getAttribute("src");
      for (const type of ["pointerdown","mousedown","click"]) button.dispatchEvent(new MouseEvent(type,{ bubbles:true, button:0, cancelable:true }));
      const dialog = document.querySelector("[data-annotation-markdown-svg-viewer]");
      expect(dialog).not.toBeNull();
      expect(dialog.querySelector("img").getAttribute("src")).toBe(src);
      expect(document.querySelector("textarea")).toBeNull();
      expect(document.querySelector(".annotation-markdown-rendered")).toBe(preview);
      const escape = new KeyboardEvent("keydown",{ key:"Escape", bubbles:true, cancelable:true });
      dialog.querySelector("button").dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      expect(document.activeElement).toBe(button);
      button.click(); f.settings.setSvgEnabled(false); f.controller.refresh();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      f.settings.setSvgEnabled(true); f.controller.refresh();
      document.querySelector(".annotation-markdown-svg-open").click(); f.controller.stop();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer], .annotation-markdown-rendered")).toBeNull();
      expect(document.querySelector(".content").textContent).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test("ordinary image clicks still enter source editing", async () => {
    const f = await fixture();
    try {
      document.querySelector(".annotation-markdown-svg-image").dispatchEvent(new MouseEvent("mousedown", { bubbles:true, button:0 }));
      expect(document.querySelector("textarea").value).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test("focus returned to a preview control does not postpone preference refresh", async () => {
    const f = await fixture();
    try {
      const button = document.querySelector(".annotation-markdown-svg-open");
      button.focus(); f.settings.setSvgEnabled(false); f.controller.refresh();
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test("large images use intrinsic dimensions rather than their sidebar layout width", async () => {
    const f = await fixture();
    try {
      const image = document.querySelector(".annotation-markdown-svg-image");
      Object.defineProperties(image, { width: { value: 320 }, height: { value: 140 } });
      document.querySelector(".annotation-markdown-svg-open").click();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer] img").getAttribute("width")).toBe("640");
    } finally { f.controller.stop(); }
  });

  test("shows code if a valid image fails to load", async () => {
    const f = await fixture();
    try {
      document.querySelector(".annotation-markdown-svg-image").dispatchEvent(new Event("error"));
      expect(document.querySelector(".annotation-markdown-svg-fallback").hidden).toBe(false);
      expect(document.querySelector(".annotation-markdown-svg-open").hidden).toBe(true);
    } finally { f.controller.stop(); }
  });
});
