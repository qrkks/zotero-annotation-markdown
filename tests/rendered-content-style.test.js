import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

describe("rendered annotation styles", () => {
  async function readAddonCss() {
    return readFile(
      path.join(process.cwd(), "addon", "styles", "annotation-markdown.css"),
      "utf8"
    );
  }

  test("folds markdown previews by default and expands selected annotations", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain("-webkit-line-clamp: var(--annotation-markdown-preview-line-clamp, 3)");
    expect(addonCss).toContain(".annotation.selected .annotation-markdown-rendered");
    expect(addonCss).toContain(".annotation-row.selected .annotation-markdown-rendered");
    expect(addonCss).toContain("-webkit-line-clamp: unset");
    expect(addonCss).toContain(".annotation-popup .annotation-markdown-rendered");
    expect(addonCss).toContain("[data-annotation-markdown-placeholder=\"true\"]");
    expect(addonCss).toContain(".annotation-markdown-editing .annotation-markdown-rendered");
    expect(addonCss).toContain("display: none !important");
    expect(addonCss).toContain("font-size: var(--annotation-markdown-font-scale, 1em)");
    expect(addonCss).toContain("max-height: calc(var(--annotation-markdown-preview-line-clamp, 3) * 1.5em)");
    expect(addonCss).toContain("max-height: none");
    expect(addonCss).toMatch(/\.annotation-popup \.annotation-markdown-rendered\s*\{[^}]*max-height:\s*min\(50vh, 24em\);/);
    expect(addonCss).toMatch(/\.annotation-popup \.annotation-markdown-rendered\s*\{[^}]*overflow-y:\s*auto;/);
    expect(addonCss).toMatch(/\.annotation-popup\s*\{[^}]*width:\s*min\(32em, calc\(100vw - 3em\)\);/);
    expect(addonCss).toMatch(
      /\.annotation-popup:not\(\[data-annotation-markdown-popup-ready="true"\]\)\s*\{[^}]*opacity:\s*0;[^}]*pointer-events:\s*none;/
    );
    expect(addonCss).toMatch(
      /\.annotation-popup\[data-annotation-markdown-popup-ready="true"\]\s*\{[^}]*opacity:\s*1;/
    );
    expect(addonCss).not.toContain("transition: opacity");
    expect(addonCss).toMatch(
      /\.annotation-popup \.annotation-markdown-rendered\s*\{[^}]*padding:\s*0\.65em 0\.8em 0\.75em;/
    );
    expect(addonCss).toMatch(
      /\.annotation-popup \.annotation-markdown-editing > \.editor \.content\s*\{[^}]*height:\s*var\(--annotation-markdown-popup-editor-height\);[^}]*overflow-y:\s*auto;/
    );
  });

  test("lets the browser skip folded offscreen preview work without containing expanded previews", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toMatch(/\.annotation-markdown-rendered\s*\{[^}]*content-visibility:\s*auto;/);
    expect(addonCss).toMatch(/\.annotation-markdown-rendered\s*\{[^}]*contain-intrinsic-size:\s*auto none auto 4\.5em;/);
    expect(addonCss).toMatch(/\.annotation\.selected \.annotation-markdown-rendered,[\s\S]*?\{[^}]*content-visibility:\s*visible;/);
    expect(addonCss).toMatch(/\.annotation-popup \.annotation-markdown-rendered\s*\{[^}]*content-visibility:\s*visible;/);
  });

  test("keeps markdown headings compact inside annotation previews", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain(".annotation-markdown-rendered h1");
    expect(addonCss).toContain(".annotation-markdown-rendered h2");
    expect(addonCss).not.toContain(".annotation-markdown-rendered h3");
    expect(addonCss).not.toContain(".annotation-markdown-rendered h6");
    expect(addonCss).toMatch(/\.annotation-markdown-rendered h1\s*\{[^}]*font-size:\s*[^;]+;/);
    expect(addonCss).toMatch(/\.annotation-markdown-rendered h2\s*\{[^}]*font-size:\s*[^;]+;/);
    expect(addonCss).toContain("line-height: 1.25");
  });

  test("styles rendered links as interactive content", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain(".annotation-markdown-rendered a");
    expect(addonCss).toContain("color: LinkText");
    expect(addonCss).toMatch(
      /\.annotation-markdown-weavero-link-colors a\s*\{[^}]*color:\s*var\(--wv-link-app, LinkText\);/
    );
    expect(addonCss).toMatch(
      /\.annotation-markdown-weavero-link-colors a\[href\^="https:\/\/" i\][\s\S]*?\{[^}]*color:\s*var\(--wv-link-http, LinkText\);/
    );
    expect(addonCss).toMatch(
      /\.annotation-markdown-weavero-link-colors a\[href\^="zotero:\/\/" i\]\s*\{[^}]*color:\s*var\(--wv-link-zotero, LinkText\);/
    );
    expect(addonCss).not.toMatch(
      /\.annotation-markdown-rendered a\[href\^="zotero:\/\/"\]\s*\{/
    );
    expect(addonCss).toContain("cursor: pointer");
    expect(addonCss).toContain("text-decoration: underline");
  });

  test("styles markdown highlights without replacing their text color", async () => {
    const addonCss = await readAddonCss();

    const markRule = addonCss.match(/\.annotation-markdown-rendered mark\s*\{([^}]*)\}/)?.[1];
    expect(markRule).toBeDefined();
    expect(markRule).toContain("background-color:");
    expect(markRule).toContain("color: inherit;");
  });

  test("provides a namespaced background for every supported highlight color", async () => {
    const addonCss = await readAddonCss();

    ["yellow", "red", "orange", "green", "blue", "purple", "gray"].forEach((color) => {
      expect(addonCss).toContain(`.annotation-markdown-rendered mark.annotation-markdown-mark-${color}`);
    });
    expect(addonCss).not.toContain(".annotation-markdown-rendered mark.red");
  });

  test("keeps the outline compact, fixed, directional, theme-aware, and keyboard visible", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain(".annotation-markdown-outline");
    expect(addonCss).toContain("position: fixed");
    expect(addonCss).toContain(".annotation-markdown-outline[data-side=\"right\"]");
    expect(addonCss).toContain(".annotation-markdown-outline[data-side=\"left\"]");
    expect(addonCss).toContain("--annotation-markdown-outline-panel-width");
    expect(addonCss).toContain("background: Canvas");
    expect(addonCss).toContain("color: CanvasText");
    expect(addonCss).toContain(".annotation-markdown-outline-toggle:focus-visible");
    expect(addonCss).toContain(".annotation-markdown-outline-item[aria-current=\"location\"]");
    expect(addonCss).toContain("max-height: min(45vh, 20em)");
  });

  test("keeps Zotero's refreshed native comment shell hidden while the fast editor is open", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toMatch(
      /\.annotation-markdown-fast-editing\s*>\s*\.expandable-editor\s*\{[^}]*display:\s*none\s*!important;/
    );
  });

  test("keeps fenced code blocks readable in narrow previews", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain(".annotation-markdown-rendered pre");
    expect(addonCss).toContain("overflow: hidden");
    expect(addonCss).toContain("white-space: pre-wrap");
    expect(addonCss).toContain("overflow-wrap: anywhere");
    expect(addonCss).toContain(".annotation-markdown-rendered pre code");
    const codeRules = addonCss.match(/\.annotation-markdown-rendered pre(?: code)?\s*\{[^}]*\}/g).join("\n");
    expect(codeRules).not.toContain("overflow-x: auto");
    expect(addonCss).not.toContain("white-space: pre;");
  });

  test("contains horizontal overflow within each display equation without changing inline math", async () => {
    const addonCss = await readAddonCss();
    const displayRule = addonCss.match(/\.annotation-markdown-rendered \.katex-display\s*\{([^}]*)\}/)?.[1];
    expect(displayRule).toBeDefined();
    expect(displayRule).toContain("overflow-x: auto;");
    expect(displayRule).toContain("overflow-y: hidden;");
    expect(displayRule).toContain("max-width: 100%;");
    expect(displayRule).not.toMatch(/font-size|transform|white-space/);
    expect(addonCss).not.toMatch(/\.annotation-markdown-rendered >?\s*\.katex\s*\{/);
  });

  test("gives inline code a subtle background without styling fenced code wrappers", async () => {
    const addonCss = await readAddonCss();

    expect(addonCss).toContain(".annotation-markdown-rendered :not(pre) > code");
    expect(addonCss).toContain("background: rgba(0, 0, 0, 0.06)");
    expect(addonCss).toContain("border-radius: 3px");
    expect(addonCss).toContain("padding: 0.08em 0.25em");
  });
});
