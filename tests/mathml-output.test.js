import { afterEach, describe, expect, test } from "vitest";

import { createAnnotationSidebarAdapter } from "../src/annotation-sidebar-adapter.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { createReaderController } from "../src/reader-controller.ts";
import { createSettings } from "../src/settings.ts";

afterEach(() => { document.body.innerHTML = ""; });

describe("experimental MathML output", () => {
  test("keeps native math semantics and TeX annotations through sanitization", () => {
    const renderer = createMarkdownRenderer({ windowRef: window, getMathOutput: () => "mathml" });
    document.body.innerHTML = renderer.render("area is $a^2$");
    const math = document.querySelector("math");
    expect(math.querySelector("semantics > mrow > msup")).not.toBeNull();
    expect(math.querySelector("annotation[encoding='application/x-tex']").textContent).toBe("a^2");
    expect([...math.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim())).toEqual([]);
    expect(document.querySelector(".katex-html, .katex-mathml")).toBeNull();
  });

  test("retains display wrappers for horizontal scrolling without wrapping inline math", () => {
    const renderer = createMarkdownRenderer({ windowRef: window, getMathOutput: () => "mathml" });
    document.body.innerHTML = renderer.render("inline $a^2$\n\n$$\\frac{a}{b}$$\n\n$$c^2$$");
    expect(document.querySelectorAll(".katex-display > .katex > math[display='block']")).toHaveLength(2);
    expect(document.querySelector("p > .katex > math:not([display])")).not.toBeNull();
    expect(document.querySelectorAll(".katex-display .katex-display")).toHaveLength(0);
  });

  test("switches outputs on the same renderer and keeps plain math when disabled", () => {
    let output = "htmlAndMathml";
    let enabled = true;
    const renderer = createMarkdownRenderer({ windowRef: window, getMathOutput: () => output, isMathEnabled: () => enabled });
    expect(renderer.render("$a^2$")).toContain("katex-html");
    output = "mathml";
    expect(renderer.render("$a^2$")).not.toContain("katex-html");
    expect(renderer.render("$a^2$")).toContain("<semantics>");
    output = "htmlAndMathml";
    expect(renderer.render("$a^2$")).toContain("katex-html");
    enabled = false;
    expect(renderer.render("$a^2$")).not.toContain("<math");
  });

  test("preserving math semantics does not allow scripts or unsafe links", () => {
    const renderer = createMarkdownRenderer({
      windowRef: window,
      getMathOutput: () => "mathml",
      markdown: { render: () => '<math><semantics><mi onclick="alert(1)">x</mi><annotation encoding="application/x-tex">x</annotation><script>alert(1)</script></semantics></math><a href="javascript:alert(1)">bad</a>', use() {} }
    });
    document.body.innerHTML = renderer.render("plain");
    expect(document.querySelector("math semantics annotation").textContent).toBe("x");
    expect(document.querySelector("script, [onclick], [href]")).toBeNull();
  });

  test("defaults to the normal output and normalizes stored experiment choices", () => {
    const settings = createSettings();
    expect(settings.getMathOutput()).toBe("htmlAndMathml");
    settings.setMathOutput("mathml");
    expect(settings.getMathOutput()).toBe("mathml");
    for (const value of [undefined, null, false, "html", "unsupported"]) {
      expect(createSettings({ prefs: { get: () => value } }).getMathOutput()).toBe("htmlAndMathml");
    }
    const values = new Map();
    const stored = createSettings({ prefs: { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) } });
    stored.setMathOutput("mathml");
    expect(values.get("extensions.annotationMarkdown.mathOutput")).toBe("mathml");
    expect(stored.getMathOutput()).toBe("mathml");
  });

  test("invalidates cached output on a live preference switch in both directions", async () => {
    document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="content">$a^2$</div></div></div>';
    const settings = createSettings();
    const controller = createReaderController({
      reader: { document }, adapter: createAnnotationSidebarAdapter({ document }),
      renderer: createMarkdownRenderer({ windowRef: window, getMathOutput: () => settings.getMathOutput() }),
      settings, MutationObserver: null, IntersectionObserver: null
    });
    try {
      await controller.start();
      expect(document.querySelector(".annotation-markdown-rendered .katex-html")).not.toBeNull();
      settings.setMathOutput("mathml");
      controller.refresh();
      expect(document.querySelector(".annotation-markdown-rendered .katex-html")).toBeNull();
      expect(document.querySelector(".annotation-markdown-rendered annotation")).not.toBeNull();
      settings.setMathOutput("htmlAndMathml");
      controller.refresh();
      expect(document.querySelector(".annotation-markdown-rendered .katex-html")).not.toBeNull();
    } finally { controller.stop(); }
  });

  test.each(["auto", "eager", "lazy"].flatMap(strategy => [false, true].map(idle => [strategy, idle])))
    ("refreshes already mounted formulas with strategy=%s and idle=%s even when HTML is not cached", async (strategy, idle) => {
      document.body.innerHTML = '<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="content">$a^2$</div></div></div>';
      const settings = createSettings();
      settings.setRenderStrategy(strategy);
      let visibilityCallback;
      const idleCallbacks = [];
      class FakeIntersectionObserver {
        constructor(callback) { visibilityCallback = callback; }
        observe() {}
        disconnect() {}
      }
      const controller = createReaderController({
        reader: { document }, adapter: createAnnotationSidebarAdapter({ document }),
        renderer: createMarkdownRenderer({
          windowRef: window, getMathOutput: () => settings.getMathOutput(), isMathEnabled: () => settings.isMathEnabled()
        }),
        settings, MutationObserver: null, IntersectionObserver: FakeIntersectionObserver,
        renderCacheMaxBytes: 1,
        ...(idle ? {
          requestIdleCallback: callback => { idleCallbacks.push(callback); return idleCallbacks.length; },
          cancelIdleCallback: () => {}
        } : {})
      });
      const flushRendering = () => {
        visibilityCallback([{ target: document.querySelector(".comment"), isIntersecting: true }]);
        while (idleCallbacks.length) idleCallbacks.shift()({ timeRemaining: () => 50 });
      };
      try {
        await controller.start();
        flushRendering();
        expect(document.querySelector(".katex-html")).not.toBeNull();
        settings.setMathOutput("mathml");
        controller.refresh();
        flushRendering();
        expect(document.querySelector(".katex-html")).toBeNull();
        expect(document.querySelector("math semantics annotation")).not.toBeNull();
        const scroller = document.querySelector("math");
        controller.refresh();
        flushRendering();
        expect(document.querySelector("math")).toBe(scroller);
        settings.setMathOutput("htmlAndMathml");
        controller.refresh();
        flushRendering();
        expect(document.querySelector(".katex-html")).not.toBeNull();
        settings.setMathEnabled(false);
        controller.refresh();
        flushRendering();
        expect(document.querySelector("math")).toBeNull();
        expect(document.querySelector(".annotation-markdown-rendered").textContent).toContain("$a^2$");
      } finally { controller.stop(); }
    });

  test.each([false, true])("native MathML glyph clicks still enter editing (popup=%s)", popup => {
    document.body.innerHTML = `${popup ? '<div class="annotation-popup">' : ''}<div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="expandable-editor"><div class="content" contenteditable="true">$$a^2$$</div></div></div></div>${popup ? '</div>' : ''}`;
    const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => true, commitComment: () => true });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, createMarkdownRenderer({ windowRef: window, getMathOutput: () => "mathml" }).render("$$a^2$$"));
    comment.querySelector("math mi").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(comment.querySelector("textarea")).not.toBeNull();
    adapter.clearRenderedState(document);
  });

  test("a popup MathML display scrollbar keeps its preview mounted", () => {
    document.body.innerHTML = '<div class="annotation-popup"><div data-sidebar-annotation-id="a1" class="annotation selected"><div class="comment"><div class="expandable-editor"><div class="content">$$a^2$$</div></div></div></div></div>';
    const adapter = createAnnotationSidebarAdapter({ document, isFastEditorEnabled: () => true, commitComment: () => true });
    const comment = document.querySelector(".comment");
    adapter.applyRenderedHtml(comment, createMarkdownRenderer({ windowRef: window, getMathOutput: () => "mathml" }).render("$$a^2$$"));
    const preview = comment.querySelector(".annotation-markdown-rendered");
    const scroller = preview.querySelector(".katex-display");
    Object.defineProperties(scroller, { scrollWidth: { value: 500 }, clientWidth: { value: 200 } });
    scroller.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    expect(comment.querySelector("textarea")).toBeNull();
    expect(comment.querySelector(".annotation-markdown-rendered")).toBe(preview);
    adapter.clearRenderedState(document);
  });
});
