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
    expect(addonCss).toContain(".annotation-markdown-editing .annotation-markdown-rendered");
    expect(addonCss).toContain("display: none !important");
    expect(addonCss).toContain("font-size: var(--annotation-markdown-font-scale, 1em)");
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
});
