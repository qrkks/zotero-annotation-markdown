import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettings } from "../src/settings.ts";
import { missingIntersectionObserver, missingMutationObserver } from "./helpers/stubs.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 280"><rect width="640" height="280" fill="#f8fafc"/><text x="20" y="35" font-size="18">Jordan 变换</text><polygon points="20,200 130,200 185,90 75,90" fill="#fbbf24"/></svg>';
const fence = (source: string) => `\`\`\`svg\n${source}\n\`\`\``;
const unlabeledFence = (source: string) => `\`\`\`\n${source}\n\`\`\``;
const render = (source: string) => createMarkdownRenderer({ isSvgEnabled: () => true }).render(fence(source));
function imageSvg(html: string) {
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
    const after = new DOMParser().parseFromString(requireValue(imageSvg(render(source))), "application/xml");
    const snapshot = (xml: Document) => [...xml.querySelectorAll("*")].map(node => ({
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

  test.each([false, true] as const)("recognizes a complete unlabeled SVG in a copied reply (math enabled: %s)", mathEnabled => {
    const source = readFileSync("tests/fixtures/jordan.svg", "utf8");
    const reply = `**Jordan diagram** $x^2$\n\n${unlabeledFence(source)}\n\nThe original source stays editable.\n\n${unlabeledFence("const x = 2;")}`;
    const html = createMarkdownRenderer({ isSvgEnabled: () => true, isMathEnabled: () => mathEnabled }).render(reply);
    const root = document.createElement("div"); root.innerHTML = html;
    expect(root.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(1);
    expect(imageSvg(html)).toContain("Jordan 变换后");
    expect(queryElement(root, "strong", HTMLElement).textContent).toBe("Jordan diagram");
    expect(Boolean(root.querySelector(".katex"))).toBe(mathEnabled);
    expect([...root.querySelectorAll("code")].map(node => node.textContent)).toContain(`${source}\n`);
    expect(root.textContent).toContain("const x = 2;");
    expect(root.querySelector("svg")).toBeNull();
    expect(imageSvg(createMarkdownRenderer().render(reply))).toBeNull();
  });

  test.each([
    ` \n${simple}\n `,
    `<?xml version="1.0" encoding="UTF-8"?>\n<!-- copied diagram -->\n${simple}\n<!-- end -->`,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>'
  ] as const)("recognizes a standalone unlabeled SVG document (%#)", (source: string) => {
    const renderer = createMarkdownRenderer({ isSvgEnabled: () => true });
    expect(imageSvg(renderer.render(unlabeledFence(source)))).not.toBeNull();
    expect(imageSvg(renderer.render(`~~~   \n${source}\n~~~`))).not.toBeNull();
  });

  test.each([
    "ordinary code",
    `const diagram = '${simple}';`,
    `Example:\n${simple}`,
    `${simple}\nexplanation`,
    `${simple}\n${simple}`,
    `<div>${simple}</div>`,
    '<rect width="100" height="100"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>unfinished',
    '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 100 100"/>',
    '<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"/>'
  ] as const)("leaves unlabeled examples and SVG fragments as ordinary code (%#)", (source: string) => {
    const markdown = unlabeledFence(source);
    expect(createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown))
      .toBe(createMarkdownRenderer().render(markdown));
  });

  test.each(["xml", "html", "text", "javascript", "svg example"] as const)("respects an explicit %s code-block language", language => {
    const markdown = `\`\`\`${language}\n${simple}\n\`\`\``;
    expect(createMarkdownRenderer({ isSvgEnabled: () => true }).render(markdown))
      .toBe(createMarkdownRenderer().render(markdown));
  });

  test.each([
    simple.replace('<rect ', '<rect onload="alert(1)" '),
    simple.replace('<rect ', '<rect style="fill:red" '),
    simple.replace('<rect width="640" height="280" fill="#f8fafc"/>', '<image href="https://example.com/x.png"/>'),
    simple.replace("Jordan 变换", "x".repeat(33000))
  ] as const)("applies the same SVG restrictions to inferred fences (%#)", (source: string) => {
    const html = createMarkdownRenderer({ isSvgEnabled: () => true }).render(unlabeledFence(source));
    expect(imageSvg(html)).toBeNull();
    expect(html).toContain("annotation-markdown-svg-error");
    const root = document.createElement("div"); root.innerHTML = html;
    expect(queryElement(root, "code", HTMLElement).textContent).toBe(`${source}\n`);
    expect(root.querySelector("svg, script, style")).toBeNull();
  });

  test("renders mixed Markdown, math and multiple isolated images", () => {
    const renderer = createMarkdownRenderer({ isSvgEnabled: () => true });
    document.body.innerHTML = renderer.render(`**diagram** $x^2$\n\n${fence(simple)}\n\n${fence(simple)}`);
    expect(document.querySelectorAll(".annotation-markdown-svg-image")).toHaveLength(2);
    expect(document.querySelectorAll(".annotation-markdown-svg-open")).toHaveLength(2);
    expect(queryElement(document, "strong", HTMLElement).textContent).toBe("diagram");
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
  ] as const)("falls back to escaped code for unsupported or invalid SVG (%#)", (source: string) => {
    const html = render(source);
    expect(imageSvg(html)).toBeNull();
    expect(html).toContain("annotation-markdown-svg-error");
    const root = document.createElement("div"); root.innerHTML = html;
    expect(queryElement(root, "code", HTMLElement).textContent).toContain(source);
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
  async function fixture({ popup = false, fast = true, strategy = "eager" as "auto" | "eager" | "lazy", tinyCache = false, markdown = fence(simple) } = {}) {
    document.body.innerHTML = `${popup ? '<div class="annotation-popup">' : ''}<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="expandable-editor"><div class="content" contenteditable="true"></div></div></div></div>${popup ? '</div>' : ''}`;
    const source = markdown; queryElement(document, ".content").textContent = source;
    const settings = createSettings(); settings.setSvgEnabled(true); settings.setPopupEnabled(popup); settings.setRenderStrategy(strategy);
    const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => fast, commitComment: () => true });
    const controller = createReaderController({
      reader: { document }, adapter, settings,
      renderer: createMarkdownRenderer({ isSvgEnabled: () => settings.isSvgEnabled() }),
      MutationObserver: missingMutationObserver, IntersectionObserver: missingIntersectionObserver,
      ...(tinyCache ? { renderCacheMaxBytes: 1 } : {})
    });
    await controller.start();
    return { source, settings, controller, adapter };
  }

  test("keeps accessible image text through the viewer, preference changes and cleanup", async () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-labelledby="label" aria-describedby="description"><title id="label">Accessible diagram</title><desc id="description">Accessible description</desc><style>text{font-size:18px}</style><text x="10" y="30">Label</text></svg>';
    const f = await fixture({ markdown: `\`\`\`svg\n${source}\n\`\`\`` });
    try {
      const image = queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement);
      expect(image.alt).toBe("Accessible diagram");
      expect(image.title).toBe("Accessible description");
      image.click();
      const frame = queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement);
      const large = queryElement(frame.contentDocument, "img", HTMLImageElement);
      expect(large.alt).toBe(image.alt);
      expect(large.title).toBe(image.title);
      queryElement(frame.contentDocument, "[aria-label='Close SVG diagram']", HTMLElement).click();
      f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      expect(queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).title).toBe("Accessible description");
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(f.source);
    } finally { f.controller.stop(); }
    expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    expect(queryElement(document, ".content").textContent).toBe(f.source);
  });

  test.each(["auto", "eager", "lazy"] as const)("refreshes live SVG choices even without a cache (%s)", async strategy => {
    const f = await fixture({ strategy, tinyCache: true });
    try {
      expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
      f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
      expect(queryElement(document, "code.language-svg").textContent.trim()).toBe(simple);
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test.each([false, true].flatMap((popup: boolean) => ["\n", "\n\n"].map(separator => [popup, separator] as const)))("keeps raw SVG source intact through viewer, preference and editor changes (popup=%s separator=%j)", async (popup: boolean, separator) => {
    const f = await fixture({ popup, markdown: `Diagram instructions.${separator}${simple}${separator}After the diagram.` });
    try {
      queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).click();
      const frame = queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement);
      queryElement(frame.contentDocument, "[aria-label='Close SVG diagram']", HTMLElement).click();
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(f.source);
      f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
      expect(queryElement(document, "code", HTMLElement).textContent).toBe(`${simple}\n`);
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      queryElement(document, ".annotation-markdown-rendered p").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(f.source);
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).not.toContain("```svg");
    } finally { f.controller.stop(); }
    expect(queryElement(document, ".content").textContent).toBe(f.source);
  });

  test.each([false, true].flatMap((popup: boolean) => [false, true].flatMap(fast => ["button", "image"].map(entry => [popup, fast, entry] as const))))("opens and closes a large image without editing (popup=%s fast=%s entry=%s)", async (popup: boolean,fast,entry) => {
    const f = await fixture({ popup, fast });
    try {
      const button = queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement);
      const target = entry === "image" ? document.querySelector(".annotation-markdown-svg-image") : button;
      const preview = document.querySelector(".annotation-markdown-rendered");
      const src = queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).getAttribute("src");
      for (const type of ["pointerdown","mousedown","click"]) requireValue(target).dispatchEvent(new MouseEvent(type,{ bubbles:true, button:0, cancelable:true }));
      const dialog = queryElement(document, "[data-annotation-markdown-svg-viewer]");
      expect(dialog).not.toBeNull();
      const viewerDocument = queryElement(dialog, "iframe", HTMLIFrameElement).contentDocument;
      expect(queryElement(viewerDocument, "img", HTMLImageElement).getAttribute("src")).toBe(src);
      expect(document.querySelector("textarea")).toBeNull();
      expect(document.querySelector(".annotation-markdown-rendered")).toBe(preview);
      const escape = new (requireValue(requireValue(viewerDocument).defaultView).KeyboardEvent)("keydown", { key:"Escape", bubbles:true, cancelable:true });
      queryElement(viewerDocument, "button", HTMLButtonElement).dispatchEvent(escape);
      expect(escape.defaultPrevented).toBe(true);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      expect(document.activeElement).toBe(button);
      button.click(); f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click(); f.controller.stop();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer], .annotation-markdown-rendered")).toBeNull();
      expect(queryElement(document, ".content").textContent).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test.each([false, true].flatMap((popup: boolean) => ["p", ".annotation-markdown-svg"].map((target: string) => [popup, target] as const)))("keeps text and image margins available for source editing (popup=%s target=%s)", async (popup: boolean, target: string) => {
    const f = await fixture({ popup, markdown: `Diagram instructions.\n\n${fence(simple)}` });
    try {
      queryElement(document, `.annotation-markdown-rendered ${target}`).dispatchEvent(new MouseEvent("mousedown", { bubbles:true, button:0 }));
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(f.source);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test("opens an unselected SVG without changing its preview or entering editing", async () => {
    const f = await fixture();
    try {
      const row = queryElement(document, ".annotation"); row.classList.remove("selected");
      const preview = document.querySelector(".annotation-markdown-rendered");
      queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).click();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).not.toBeNull();
      expect(document.querySelector(".annotation-markdown-rendered")).toBe(preview);
      expect(document.querySelector("textarea")).toBeNull();
      expect(row.classList.contains("selected")).toBe(false);
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test("keeps source editing accessible for an SVG-only comment", async () => {
    const f = await fixture();
    try {
      queryElement(document, ".annotation-markdown-svg").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(f.source);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test.each([1, 2] as const)("leaves non-primary SVG image clicks and the context menu to the host (button=%s)", async button => {
    const f = await fixture();
    const events: Array<string> = [];
    const observe = (event: Event) => events.push(event.type);
    const types = ["pointerdown", "mousedown", "click", "contextmenu"];
    for (const type of types) document.addEventListener(type, observe);
    try {
      const image = queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement);
      for (const type of types) {
        const event = new MouseEvent(type, { bubbles: true, button, cancelable: true });
        image.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
      }
      expect(events).toEqual(types);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer], textarea")).toBeNull();
    } finally {
      for (const type of types) document.removeEventListener(type, observe);
      f.controller.stop();
    }
  });

  test("ordinary Markdown image clicks still enter source editing", async () => {
    const f = await fixture({ markdown: "![Ordinary image](https://example.org/diagram.png)" });
    try {
      queryElement(document, ".annotation-markdown-rendered img", HTMLImageElement).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(f.source);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test("viewer keys do not reach a native Reader capture listener registered first", async () => {
    const nativeKeys: Array<string> = [];
    const nativeHandler = (event: KeyboardEvent) => nativeKeys.push(event.key);
    window.addEventListener("keydown", nativeHandler, true);
    const f = await fixture({ popup: true });
    try {
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click();
      const dialog = queryElement(document, "[data-annotation-markdown-svg-viewer]");
      const viewerDocument = dialog.querySelector("iframe")?.contentDocument ?? document;
      const button = dialog.querySelector("iframe")
        ? viewerDocument.querySelector("button") : dialog.querySelector("button");
      for (const key of ["Tab", "ArrowRight", "Delete", "Escape"]) {
        requireValue(button).dispatchEvent(new (requireValue(viewerDocument.defaultView).KeyboardEvent)("keydown", { key, bubbles: true, cancelable: true }));
      }
      expect(nativeKeys).toEqual([]);
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      expect(nativeKeys).toEqual(["ArrowRight"]);
    } finally {
      f.controller.stop();
      window.removeEventListener("keydown", nativeHandler, true);
    }
  });

  test("rebuilds viewer controls when Gecko replaces the initial blank frame document", async () => {
    const f = await fixture();
    try {
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click();
      const frame = queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement);
      const content = frame.contentDocument;
      requireValue(content).open(); requireValue(content).write("<!doctype html><html><head></head><body></body></html>"); requireValue(content).close();
      frame.dispatchEvent(new Event("load"));
      expect(queryElement(frame.contentDocument, "img", HTMLImageElement).getAttribute("src")).toBe(queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).getAttribute("src"));
      const button = queryElement(frame.contentDocument, "button[aria-label='Close SVG diagram']", HTMLButtonElement);
      expect(requireValue(frame.contentDocument).activeElement).toBe(button);
      button.click();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
    } finally { f.controller.stop(); }
  });

  function deferViewerDecode(frame: HTMLIFrameElement) {
    const pending: Array<{image: HTMLImageElement; resolve: () => void; reject: (reason?: unknown) => void}> = [];
    requireValue(frame.contentWindow).HTMLImageElement.prototype.decode = function () {
      return new Promise<void>((resolve, reject) => pending.push({ image: this, resolve, reject }));
    };
    return pending;
  }

  test.each([false, true] as const)("shows the viewer only after the final frame image is decoded (popup=%s)", async (popup: boolean) => {
    const f = await fixture({ popup });
    try {
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click();
      const dialog = queryElement(document, "[data-annotation-markdown-svg-viewer]", HTMLElement);
      const frame = queryElement(dialog, "iframe", HTMLIFrameElement);
      const pending = deferViewerDecode(frame);
      expect(dialog.style.opacity).toBe("0");
      frame.dispatchEvent(new Event("load"));
      const content = frame.contentDocument;
      requireValue(content).open(); requireValue(content).write("<!doctype html><html><head></head><body></body></html>"); requireValue(content).close();
      frame.dispatchEvent(new Event("load"));
      expect(pending).toHaveLength(2);
      pending[0].resolve(); await Promise.resolve();
      expect(dialog.style.opacity).toBe("0");
      pending[1].resolve(); await Promise.resolve();
      expect(dialog.style.opacity).toBe("");
      expect(queryElement(frame.contentDocument, "img", HTMLImageElement).getAttribute("src")).toBe(queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).getAttribute("src"));
      expect(requireValue(requireValue(frame.contentDocument).activeElement).getAttribute("aria-label")).toBe("Close SVG diagram");
      expect(document.querySelector("textarea")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test("a closed viewer's pending image cannot reveal or close a reopened viewer", async () => {
    const f = await fixture();
    try {
      const button = queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement);
      button.click();
      const oldDialog = queryElement(document, "[data-annotation-markdown-svg-viewer]");
      const oldFrame = queryElement(oldDialog, "iframe", HTMLIFrameElement);
      const oldDecode = deferViewerDecode(oldFrame);
      oldFrame.dispatchEvent(new Event("load"));
      queryElement(oldFrame.contentDocument, "[aria-label='Close SVG diagram']", HTMLElement).click();
      button.click();
      const dialog = queryElement(document, "[data-annotation-markdown-svg-viewer]", HTMLElement);
      const frame = queryElement(dialog, "iframe", HTMLIFrameElement);
      const pending = deferViewerDecode(frame);
      frame.dispatchEvent(new Event("load"));
      oldDecode[0].reject(new Error("The old image was detached")); await Promise.resolve();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBe(dialog);
      expect(dialog.style.opacity).toBe("0");
      pending[0].resolve(); await Promise.resolve();
      expect(dialog.style.opacity).toBe("");
      expect(queryElement(document, ".content").textContent).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test("a failed viewer image closes the pending dialog and restores its opener", async () => {
    const f = await fixture();
    try {
      const button = queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement);
      button.click();
      const frame = queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement);
      const pending = deferViewerDecode(frame);
      frame.dispatchEvent(new Event("load"));
      pending[0].reject(new Error("Image decode failed")); await Promise.resolve();
      expect(document.querySelector("[data-annotation-markdown-svg-viewer]")).toBeNull();
      expect(document.activeElement).toBe(button);
      expect(queryElement(document, ".content").textContent).toBe(f.source);
    } finally { f.controller.stop(); }
  });

  test("waits for image loading when decode is unavailable", async () => {
    const f = await fixture();
    try {
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click();
      const dialog = queryElement(document, "[data-annotation-markdown-svg-viewer]", HTMLElement);
      const frame = queryElement(dialog, "iframe", HTMLIFrameElement);
      requireValue(frame.contentWindow).HTMLImageElement.prototype.decode = undefined;
      frame.dispatchEvent(new Event("load"));
      expect(dialog.style.opacity).toBe("0");
      queryElement(frame.contentDocument, "img", HTMLImageElement).dispatchEvent(new Event("load"));
      expect(dialog.style.opacity).toBe("");
    } finally { f.controller.stop(); }
  });

  test("focus returned to a preview control does not postpone preference refresh", async () => {
    const f = await fixture();
    try {
      const button = queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement);
      button.focus(); f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-image")).toBeNull();
    } finally { f.controller.stop(); }
  });

  test("large images use intrinsic dimensions rather than their sidebar layout width", async () => {
    const f = await fixture();
    try {
      const image = document.querySelector(".annotation-markdown-svg-image");
      Object.defineProperties(image, { width: { value: 320 }, height: { value: 140 } });
      queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).click();
      expect(queryElement(queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement).contentDocument, "img", HTMLImageElement).getAttribute("width")).toBe("640");
    } finally { f.controller.stop(); }
  });

  test("shows code if a valid image fails to load", async () => {
    const f = await fixture();
    try {
      queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).dispatchEvent(new Event("error"));
      expect(queryElement(document, ".annotation-markdown-svg-fallback", HTMLElement).hidden).toBe(false);
      expect(queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).hidden).toBe(true);
    } finally { f.controller.stop(); }
  });

  test.each([false, true].flatMap((popup: boolean) => [false, true].map(tinyCache => [popup, tinyCache])))("keeps degradation warnings with the image across viewer, settings, editing and cleanup (popup=%s tinyCache=%s)", async (popup: boolean, tinyCache) => {
    const source = simple.replace('<svg ', '<svg shape-rendering="crispEdges" ');
    const f = await fixture({ popup, tinyCache, markdown: fence(source) });
    try {
      const warning = queryElement(document, ".annotation-markdown-svg-warning").textContent;
      f.controller.renderNow();
      expect(document.querySelectorAll(".annotation-markdown-svg-warning")).toHaveLength(1);
      queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).click();
      const frame = queryElement(document, "[data-annotation-markdown-svg-viewer] iframe", HTMLIFrameElement);
      expect(queryElement(frame.contentDocument, ".annotation-markdown-svg-warning").textContent).toBe(warning);
      requireValue(frame.contentDocument).open(); requireValue(frame.contentDocument).write("<!doctype html><html><head></head><body></body></html>"); requireValue(frame.contentDocument).close();
      frame.dispatchEvent(new Event("load"));
      expect(requireValue(frame.contentDocument).querySelectorAll(".annotation-markdown-svg-warning")).toHaveLength(1);
      queryElement(frame.contentDocument, "[aria-label='Close SVG diagram']", HTMLElement).click();
      f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelector(".annotation-markdown-svg-warning, .annotation-markdown-svg-image")).toBeNull();
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      expect(document.querySelectorAll(".annotation-markdown-svg-warning")).toHaveLength(1);
      queryElement(document, ".annotation-markdown-svg-warning").dispatchEvent(new MouseEvent("mousedown", { bubbles:true, button:0 }));
      expect(queryElement(document, "textarea", HTMLTextAreaElement).value).toBe(f.source);
      expect(queryElement(document, ".annotation-markdown-rendered", HTMLElement).hidden).toBe(true);
      queryElement(document, "textarea", HTMLTextAreaElement).value = fence(simple);
      expect(f.adapter.closeActiveFastEditor()).toBe(true);
      // Zotero updates its owned source DOM after a successful annotation save.
      queryElement(document, ".content").textContent = fence(simple);
      f.controller.renderNow();
      expect(document.querySelector(".annotation-markdown-svg-warning")).toBeNull();
      expect(document.querySelector(".annotation-markdown-svg-image")).not.toBeNull();
      expect(f.adapter.getSourceText(document.querySelector(".comment"))).toBe(fence(simple));
    } finally { f.controller.stop(); }
    expect(document.querySelector(".annotation-markdown-rendered, [data-annotation-markdown-svg-viewer], .annotation-markdown-svg-warning")).toBeNull();
    expect(queryElement(document, ".content").textContent).toBe(fence(simple));
  });

  test("replaces a degraded preview with source fallback when its image fails", async () => {
    const source = simple.replace('<svg ', '<svg cursor="default" ');
    const f = await fixture({ markdown: fence(source) });
    try {
      queryElement(document, ".annotation-markdown-svg-image", HTMLImageElement).dispatchEvent(new Event("error"));
      expect(queryElement(document, ".annotation-markdown-svg-warning", HTMLElement).hidden).toBe(true);
      expect(queryElement(document, ".annotation-markdown-svg-fallback", HTMLElement).hidden).toBe(false);
      expect(queryElement(document, ".annotation-markdown-svg-fallback code").textContent.trimEnd()).toBe(source);
      expect(queryElement(document, ".annotation-markdown-svg-open", HTMLButtonElement).hidden).toBe(true);
      f.settings.setSvgEnabled(false); requireValue(f.controller.refresh).call(f.controller);
      f.settings.setSvgEnabled(true); requireValue(f.controller.refresh).call(f.controller);
      expect(queryElement(document, ".annotation-markdown-svg-warning", HTMLElement).hidden).toBe(false);
    } finally { f.controller.stop(); }
  });
});
