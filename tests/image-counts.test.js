import { describe, expect, test } from "vitest";
import { countRenderedImages, imageBadgeLabel, imageCountHint } from "../src/image-counts.ts";
import { createSvgRenderer } from "../src/svg-renderer.ts";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 60"><rect width="40" height="60"/></svg>';

describe("diagram source labels", () => {
  test.each([
    [{ img: 0, svg: 0, mermaid: 1 }, "MERMAID"],
    [{ img: 0, svg: 1, mermaid: 1 }, "SVG · MERMAID"],
    [{ img: 1, svg: 0, mermaid: 1 }, "IMG · MERMAID"],
    [{ img: 1, svg: 1, mermaid: 1 }, "IMG · SVG · MERMAID"],
    [{ img: 0, svg: 1 }, "SVG"],
    [{ img: 1, svg: 1 }, "IMG · SVG"],
    [{ img: 0, svg: 0 }, ""]
  ])("labels available source types without double counting (%#)", (counts, label) => {
    expect(imageBadgeLabel(counts)).toBe(label);
  });

  test("counts generated Mermaid separately while retaining SVG validation and hidden-image rules", () => {
    const render = createSvgRenderer(window);
    const root = document.createElement("div");
    root.innerHTML = render(svg, "source") + render(svg, "source", { sourceKind: "mermaid" });
    expect(countRenderedImages(root)).toEqual({ img: 0, svg: 1, mermaid: 1 });
    root.querySelector(".annotation-markdown-mermaid img").hidden = true;
    expect(countRenderedImages(root)).toEqual({ img: 0, svg: 1 });
    expect(render('<svg><script/></svg>', "source", { sourceKind: "mermaid" })).not.toContain("annotation-markdown-mermaid");
  });

  test("localizes separate source counts in annotation and section hints", () => {
    const counts = { img: 1, svg: 2, mermaid: 3 };
    expect(imageCountHint(counts, "annotation", "zh-CN")).toBe("本条批注含 1 张图片、2 个 SVG 图、3 个 Mermaid 图");
    expect(imageCountHint(counts, "section", "en-US")).toBe("This section contains 1 image, 2 SVG diagrams and 3 Mermaid diagrams");
    expect(imageCountHint({ img: 0, svg: 0, mermaid: 1 }, "annotation", "en-US")).toBe("This annotation contains 1 Mermaid diagram");
  });
});
