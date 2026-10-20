import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";
import { queryElement, requireValue } from "./helpers/dom.ts";

const efa = readFileSync("tests/fixtures/efa-font-shorthand.svg", "utf8");
const svg = (css: string, drawing = '<text class="label" x="10" y="30">Label</text>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>${css}</style>${drawing}</svg>`;
function preview(source: string, language = "svg") {
  const input = language === "raw" ? source : `\`\`\`${language}\n${source}\n\`\`\``;
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(input);
  const image = root.querySelector(".annotation-markdown-svg-image");
  const clean = image ? decodeURIComponent(requireValue(image.getAttribute("src")).split(",").slice(1).join(",")) : null;
  return { root, xml: clean ? new DOMParser().parseFromString(clean, "application/xml") : null };
}

describe("restricted SVG font shorthand", () => {
  test.each(["svg", "", "raw"])("renders the supplied EFA table through %s input and preserves the source", language => {
    const { root, xml } = preview(efa, language);
    expect(xml).not.toBeNull();
    expect(requireValue(xml).documentElement.getAttribute("width")).toBe("1200");
    expect(requireValue(xml).documentElement.getAttribute("height")).toBe("880");
    const heading = queryElement(xml, "text");
    expect(heading.textContent).toBe("成分矩阵ᵃ");
    expect(heading.getAttribute("font-size")).toBe("24px");
    expect(heading.getAttribute("font-weight")).toBe("bold");
    expect(heading.getAttribute("font-style")).toBe("normal");
    expect(heading.getAttribute("font-family")).toBe('"Microsoft YaHei", "Noto Sans CJK SC", sans-serif');
    const values = queryElement(xml, 'g[font-size="20px"]');
    expect(values.getAttribute("font-weight")).toBe("normal");
    expect(values.getAttribute("font-family")).toBe('Georgia, "Times New Roman", serif');
    expect(queryElement(values, "text").hasAttribute("font-size")).toBe(false);
    expect(requireValue(xml).querySelector("style, [class], [font]")).toBeNull();
    expect(root.querySelector("svg, style, script")).toBeNull();
    expect(queryElement(root, "code").textContent.trimEnd()).toBe(efa.trimEnd());
  });

  test.each([
    ["24px serif", "normal", "normal", "24px", "serif"],
    ['bold 24px "Microsoft YaHei", sans-serif', "normal", "bold", "24px", '"Microsoft YaHei", sans-serif'],
    ["italic 700 1.5em Georgia, serif", "italic", "700", "1.5em", "Georgia, serif"],
    ["600 oblique 18pt Times New Roman", "oblique", "600", "18pt", "Times New Roman"],
    ["normal italic 120% serif", "italic", "normal", "120%", "serif"],
    ["bold normal .5em serif", "normal", "bold", ".5em", "serif"],
    ["normal normal 0 serif", "normal", "normal", "0", "serif"],
    ["BOLDER ITALIC 24PX sans-serif", "italic", "bolder", "24px", "sans-serif"],
    ["lighter 12px 微软雅黑, sans-serif", "normal", "lighter", "12px", "微软雅黑, sans-serif"],
    ["italic\tbold\n20px\n'Family 24px', serif", "italic", "bold", "20px", "'Family 24px', serif"],
    ['16px "Family, With Comma", serif', "normal", "normal", "16px", '"Family, With Comma", serif'],
    ["16px Times\tNew\nRoman,\nserif", "normal", "normal", "16px", "Times New Roman, serif"],
    ["16px normal serif", "normal", "normal", "16px", "normal serif"],
    ['16px -Family, "9Font"', "normal", "normal", "16px", '-Family, "9Font"']
  ])("expands %s into validated presentation attributes", (font, style, weight, size, family) => {
    const { xml } = preview(svg(`.label{font:${font}}`));
    expect(xml).not.toBeNull();
    const label = queryElement(xml, "text");
    expect(label.getAttribute("font-style")).toBe(style);
    expect(label.getAttribute("font-weight")).toBe(weight);
    expect(label.getAttribute("font-size")).toBe(size);
    expect(label.getAttribute("font-family")).toBe(family);
  });

  test("resets earlier longhands and retains later declarations in stylesheet order", () => {
    const { xml } = preview(svg(
      ".label{font-weight:bold;font-style:italic;font-size:30px;font-family:Georgia;font:20px serif;font-weight:700}" +
      ".label{font-size:22px}",
      '<text class="label" font-style="oblique" font-weight="900">Label</text>'
    ));
    const label = queryElement(xml, "text");
    expect(label.getAttribute("font-style")).toBe("normal");
    expect(label.getAttribute("font-weight")).toBe("700");
    expect(label.getAttribute("font-size")).toBe("22px");
    expect(label.getAttribute("font-family")).toBe("serif");
  });

  test("resets inherited bold and italic text when a child declares its own shorthand", () => {
    const { xml } = preview(svg(
      ".parent{font:italic bold 24px Georgia}.label{font:18px serif}",
      '<g class="parent"><text class="label">Plain</text><text>Inherited</text></g>'
    ));
    expect(queryElement(xml, "g").getAttribute("font-weight")).toBe("bold");
    const [plain, inherited] = requireValue(xml).querySelectorAll("text");
    expect(plain.getAttribute("font-style")).toBe("normal");
    expect(plain.getAttribute("font-weight")).toBe("normal");
    expect(inherited.hasAttribute("font-weight")).toBe(false);
  });

  test.each([
    "bold serif", "24px", "16 serif", "-16px serif", "16rem serif", "small serif",
    "caption", "inherit", "small-caps 16px serif", "condensed 16px serif",
    "oblique 10deg 16px serif", "italic oblique 16px serif", "bold 700 16px serif",
    "normal normal bold 16px serif", "16px/1.5 serif", "16px / 1.5 serif",
    "16px initial", "16px serif, inherit", "16px bold 18px serif",
    '16px "Family" serif', "16px serif,,sans-serif", "16px ,serif", "16px serif,",
    "16px -", "16px -9Font", "16px 9Font",
    '16px ""', '16px "unfinished', "16px var(--family)", "calc(12px + 2px) serif",
    "16px url(https://example.com/font)", "16px serif!important", "16px F\\61mily",
    "100001px serif", "1e999px serif", `16px "${"A".repeat(129)}"`
  ])("falls back to unchanged source for unsupported or malformed font: %s", font => {
    const source = svg(`.label{font:${font}}`);
    const { root, xml } = preview(source);
    expect(xml).toBeNull();
    expect(queryElement(root, "code").textContent).toBe(`${source}\n`);
    expect(root.querySelector("svg, style, script")).toBeNull();
  });

  test.each([
    ".unused{font:100001px serif}.label{font:16px serif}",
    ".label{font:100001px serif;font:16px serif}",
    ".label{font:16px var(--family);font:16px serif}"
  ])("validates unused and overridden shorthand declarations (%#)", css => {
    expect(preview(svg(css)).xml).toBeNull();
  });

  test("counts expanded longhands toward the existing declaration limit", () => {
    expect(preview(svg(`.label{${"font:16px serif;".repeat(256)}}`)).xml).not.toBeNull();
    expect(preview(svg(`.label{${"font:16px serif;".repeat(257)}}`)).xml).toBeNull();
  });
});
