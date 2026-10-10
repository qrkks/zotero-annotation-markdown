import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

const fixture = readFileSync("tests/fixtures/issue-3-svg-samples.md", "utf8");
const font = fixture.match(/data:font\/woff2;base64,([^)]*)/)[1];
const fontBytes = Buffer.from(font, "base64");
const face = (family = "Cascadia", data = font) => `@font-face{font-family:${family};src:url(data:font/woff2;base64,${data});}`;
const svg = css => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><defs><style class="style-fonts" type="text/css">${css}</style></defs><text x="10" y="30" font-family="Cascadia, monospace" style="white-space: pre;" direction="ltr">A  B</text></svg>`;
function render(source) {
  const root = document.createElement("div");
  root.innerHTML = createMarkdownRenderer({ isSvgEnabled: () => true }).render(`\`\`\`svg\n${source}\n\`\`\``);
  const image = root.querySelector(".annotation-markdown-svg-image");
  const clean = image ? decodeURIComponent(image.getAttribute("src").split(",").slice(1).join(",")) : null;
  return { root, clean, xml: clean ? new DOMParser().parseFromString(clean, "application/xml") : null };
}
function changedFont(change, length = fontBytes.length) {
  const bytes = Buffer.alloc(length); fontBytes.copy(bytes);
  bytes.writeUInt32BE(length, 8); change(bytes);
  return bytes.toString("base64");
}

describe("restricted embedded WOFF2 fonts", () => {
  test("retains real font bytes and literal text only inside the isolated SVG image", () => {
    const source = svg(face());
    const result = render(source);
    expect(result.clean).not.toBeNull();
    expect(result.xml.querySelector("style").textContent).toContain(font);
    expect(result.xml.querySelector("style").getAttributeNames()).toEqual([]);
    expect(result.xml.querySelector("text").textContent).toBe("A  B");
    expect(result.xml.querySelector("text").getAttribute("style")).toBe("white-space: pre;");
    expect(result.xml.querySelector("text").getAttribute("direction")).toBe("ltr");
    expect(result.root.querySelector("svg, style")).toBeNull();
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });

  test.each([
    `@font-face { src: url("data:font/woff2;base64,${font}") format('woff2'); font-family: 'Cascadia'; font-weight: 400; font-style: normal; }`,
    `@FONT-FACE { font-family: "Noto Sans"; src: url('data:font/woff2;base64,${font}'); font-style: italic; font-weight: bold }`,
    `${face()}\n${face("Other Font")}`
  ])("accepts the bounded font descriptors without opening general CSS (%#)", css => {
    expect(render(svg(css)).clean).not.toBeNull();
  });

  test("normalizes CSS whitespace in unquoted font family names", () => {
    const source = svg(face("Other  Font")).replace('font-family="Cascadia, monospace"', 'font-family="Other Font, monospace"');
    const result = render(source);
    expect(result.clean).not.toBeNull();
    expect(result.xml.querySelector("style").textContent).toContain('font-family:"Other Font";');
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
  });

  test.each([
    '@font-face{font-family:Cascadia;src:url(https://example.com/a.woff2)}',
    '@font-face{font-family:Cascadia;src:local(Cascadia)}',
    face().replace('data:font/woff2', 'data:font/woff'),
    face().replace('data:font/woff2', 'data:text/html'),
    face().replace('font-family:Cascadia;', ''),
    face().replace(/src:[^}]+/, ''),
    face().replace('font-family:Cascadia;', 'font-family:Cascadia;font-family:Other;'),
    face().replace('font-family:Cascadia;', 'font-family:Cascadia;font-display:swap;'),
    face().replace('font-family:Cascadia;', 'font-family:Cascadia;font-weight:100000;'),
    face().replace('font-family:Cascadia;', 'font-family:Cascadia;font-style:oblique 10deg;'),
    face().replace('font-family:Cascadia;', 'font-family:"Cascadia; color:red";'),
    face().replace('font-family:Cascadia;', 'font-family:Cas\\63adia;'),
    face().replace(/src:([^;]+;base64,[^)]+\))/, '$& ,url(https://example.com/a.woff2)'),
    face() + 'text{fill:red}',
    '@import url(https://example.com/a.css);' + face(),
    '@media all {' + face() + '}',
    face() + 'garbage',
    face("Cascadia", "not-base64!"),
    face("Cascadia", Buffer.from("not a WOFF2 font").toString("base64")),
    face("Cascadia", changedFont(bytes => bytes.write("wOFF", 0))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(1, 8))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt16BE(1, 14))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt16BE(0, 12))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(0x74746366, 4))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(131073, 16))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(999999, 20))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(1, 28))),
    face("Cascadia", changedFont(bytes => bytes.writeUInt32BE(1, 40))),
    face("Cascadia", changedFont(() => {}, 8193)),
    Array.from({ length: 5 }, (_, index) => face(`Font${index}`)).join(""),
    Array.from({ length: 3 }, (_, index) => face(`Font${index}`, changedFont(() => {}, 6000))).join("")
  ])("rejects unsupported CSS, resources, malformed headers or excessive fonts (%#)", css => {
    const source = svg(css); const result = render(source);
    expect(result.clean).toBeNull();
    expect(result.root.querySelector(".annotation-markdown-svg-error")).not.toBeNull();
    expect(result.root.querySelector("code").textContent).toBe(`${source}\n`);
    expect(result.root.querySelector("svg, style, script")).toBeNull();
  });

  test.each([
    svg(face()).replace('<style ', '<style onload="alert(1)" '),
    svg(face()).replace('<style ', '<style media="all" '),
    svg(face()).replace('white-space: pre;', 'white-space: pre;fill:red'),
    svg(face()).replace('white-space: pre;', 'white-space: normal;'),
    svg(face()).replace('direction="ltr"', 'direction="invalid"'),
    svg(face()).replace('<text ', '<text onload="alert(1)" '),
    svg(face()).replace('</defs>', '</defs><path d="M0 0" style="white-space: pre;"/>')
  ])("keeps text style and element attributes within their own allowlists (%#)", source => {
    expect(render(source).clean).toBeNull();
  });

  test("preserves RTL direction and meaningful text whitespace", () => {
    const result = render(svg(face()).replace('direction="ltr"', 'direction="rtl"').replace('A  B', 'א  ב'));
    expect(result.clean).not.toBeNull();
    expect(result.xml.querySelector("text").getAttribute("direction")).toBe("rtl");
    expect(result.xml.querySelector("text").textContent).toBe("א  ב");
  });
});
