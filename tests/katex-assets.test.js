import { describe, expect, test } from "vitest";

import { inlineKatexWoff2Fonts } from "../scripts/katex-assets.mjs";

describe("KaTeX asset helpers", () => {
  test("inlines woff2 font URLs as data URIs", async () => {
    const css = "@font-face{src:url(fonts/KaTeX_Main-Regular.woff2) format(\"woff2\"),url(fonts/KaTeX_Main-Regular.woff) format(\"woff\")}";

    const inlined = await inlineKatexWoff2Fonts(css, async (filename) => {
      expect(filename).toBe("KaTeX_Main-Regular.woff2");
      return new Uint8Array([1, 2, 3]);
    });

    expect(inlined).toContain("url(data:font/woff2;base64,AQID)");
    expect(inlined).not.toContain("url(fonts/KaTeX_Main-Regular.woff2)");
    expect(inlined).toContain("url(fonts/KaTeX_Main-Regular.woff)");
  });
});
