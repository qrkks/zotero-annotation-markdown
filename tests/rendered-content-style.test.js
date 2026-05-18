import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, test } from "vitest";

import { RENDERED_CONTENT_STYLE } from "../src/rendered-content-style.js";

describe("rendered annotation styles", () => {
  test("folds markdown previews by default and expands selected annotations", async () => {
    const addonCss = await readFile(
      path.join(process.cwd(), "addon", "styles", "annotation-markdown.css"),
      "utf8"
    );

    for (const css of [RENDERED_CONTENT_STYLE, addonCss]) {
      expect(css).toContain("-webkit-line-clamp: var(--annotation-markdown-preview-line-clamp, 3)");
      expect(css).toContain(".annotation.selected .annotation-markdown-rendered");
      expect(css).toContain(".annotation-row.selected .annotation-markdown-rendered");
      expect(css).toContain("-webkit-line-clamp: unset");
      expect(css).toContain(".annotation-popup .annotation-markdown-rendered");
      expect(css).toContain(".annotation-markdown-editing .annotation-markdown-rendered");
      expect(css).toContain("display: none !important");
    }
  });
});
