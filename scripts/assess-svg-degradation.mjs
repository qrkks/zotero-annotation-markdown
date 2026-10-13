/** Run an isolated parser/degradation assessment; does not modify production. */
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const root = fileURLToPath(new URL("../", import.meta.url));
const lab = path.join(root, ".tmp/svg-degradation-lab");
const out = path.join(root, "output/svg-degradation-assessment");
const require = createRequire(path.join(root, "package.json"));
const labRequire = createRequire(path.join(lab, "package.json"));
const cssTreeVersion = labRequire("css-tree/package.json").version;
const buildOptions = { bundle: true, write: false, platform: "browser", target: ["firefox102"],
  nodePaths: [path.join(lab, "node_modules")], absWorkingDir: root };
await mkdir(out, { recursive: true });
const baselineBundle = await build({ ...buildOptions, entryPoints: ["src/svg-renderer.ts"], format: "cjs" });
const prototypeBundle = await build({ ...buildOptions, entryPoints: ["scripts/prototypes/svg-degradation.mjs"], format: "cjs" });
function load(bundle) {
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const windowRef = new JSDOM("").window;
const strict = load(baselineBundle).createSvgRenderer(windowRef);
const prototype = load(prototypeBundle).createSvgDegradationPrototype(windowRef);
const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const fallback = source => `<pre><code>${escape(source)}</code></pre>`;
function dom(html) { const box = windowRef.document.createElement("div"); box.innerHTML = html; return box; }
function svgDocument(html) {
  const image = dom(html).querySelector(".annotation-markdown-svg-image");
  return image ? new windowRef.DOMParser().parseFromString(decodeURIComponent(image.getAttribute("src").split(",").slice(1).join(",")), "application/xml") : null;
}
function snapshot(xml) {
  return [...xml.querySelectorAll("*")].map(node => ({name: node.localName,
    attrs: [...node.attributes].map(attr => [attr.name, attr.value]).sort(),
    text: ["text", "tspan", "title", "desc", "style"].includes(node.localName) ? node.textContent : null}));
}
const issueSamples = [...(await readFile(path.join(root, "tests/fixtures/issue-3-svg-samples.md"), "utf8"))
  .matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map(match => match[0]);
const fixtures = issueSamples.map((source, index) => ({name: `issue-${index + 1}`, source}));
for (const name of ["jordan", "efa-class-styles", "efa-font-shorthand"]) {
  fixtures.push({name, source: await readFile(path.join(root, `tests/fixtures/${name}.svg`), "utf8")});
}
const rows = [];
function check(name, source, expected, expectedSource = null) {
  const result = prototype(source, fallback(source));
  const box = dom(result.html);
  assert.equal(result.status, expected, `${name}: ${result.reason}`);
  assert.equal(result.originalSource, source, `${name}: source changed`);
  assert.equal(box.querySelector("code").textContent, source, `${name}: fallback source changed`);
  assert.equal(box.querySelector("svg, style, script"), null, `${name}: markup entered preview DOM`);
  const image = box.querySelector(".annotation-markdown-svg-image");
  assert.equal(Boolean(image), expected !== "fallback", name);
  assert.equal(Boolean(box.querySelector(".annotation-markdown-svg-warning")), expected === "degraded", name);
  if (expectedSource) assert.deepEqual(snapshot(svgDocument(result.html)), snapshot(svgDocument(strict(expectedSource, fallback(expectedSource)))), name);
  rows.push({name, status: result.status, omittedCount: result.omittedCount, kind: result.kind, reason: result.reason});
  return result;
}
const hints = '<style>.prototype_hint{cursor:default;text-rendering:optimizeLegibility;shape-rendering:crispEdges}</style>';
for (const {name, source} of fixtures) {
  check(name, source, "complete", source);
  check(`${name}-cosmetic-css`, source.replace("</svg>", `${hints}</svg>`), "degraded", source);
  check(`${name}-cosmetic-attribute`, source.replace(/<svg(?=[\s>])/, '<svg shape-rendering="crispEdges"'), "degraded", source);
}
const simple = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0L90 90"/><text x="10" y="30">中文 Label</text></svg>';
const styled = (css, drawing = '<text class="label" x="10" y="30">Label</text>') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>${css}</style>${drawing}</svg>`;
check("retains-order-and-font-reset", styled('.label{font:italic bold 24px serif;cursor:default;font:18px Georgia;text-rendering:auto;font-weight:700}'), "degraded",
  styled('.label{font:italic bold 24px serif;font:18px Georgia;font-weight:700}'));
check("matched-inherited-hint", styled('.label{text-rendering:auto;fill:red}', '<g class="label"><text>Inherited</text></g>'), "degraded",
  styled('.label{fill:red}', '<g class="label"><text>Inherited</text></g>'));
check("comments-and-quoted-fonts", styled('.label{/* keep */font:bold 20px "Family 24px", serif;cursor:default}'), "degraded",
  styled('.label{/* keep */font:bold 20px "Family 24px", serif;}'));
const rejectedCss = [
  '.label{cursor:default;background:url(https://example.com/a)}',
  '.unused{fill:url(https://example.com/a)}.label{cursor:default;fill:red}',
  '.label{cursor:default;fill:url(https://example.com/a);fill:red}',
  '.label{cursor:url(https://example.com/a),default;fill:red}',
  '@import "https://example.com/a.css";.label{cursor:default}',
  '@font-face{font-family:F;src:url(https://example.com/f.woff2)}.label{cursor:default}',
  '.label{cursor:default;fill:expression(alert(1))}',
  '.label{cursor:default;fill:u\\72l(https://example.com/a)}',
  '.label{cursor:default;broken;fill:red}', '.label{cursor:default;fill:red',
  '.label{cursor:default;fill:red;/* unfinished', '.label{cursor:default!important}',
  '.label{cursor:var(--cursor)}', '.label{cursor:default;color:red}',
  '.label{cursor:default;transform:translate(20px)}', '.label{cursor:default;font-size:100001}',
  '.label{cursor:default;marker-end:url(#missing)}', '.label{cursor:default;filter:blur(2px)}',
  '.label{cursor:default;fill:var(--paint)}', '.label:hover{cursor:default}',
  '@media all{.label{cursor:default}}', '.label{shape-rendering:url(#local)}',
  '.label{cursor:default;mask:url(#mask)}'
];
for (const [index, css] of rejectedCss.entries()) check(`hard-css-${index + 1}`, styled(css), "fallback");
const unsafeDrawing = [
  '<script>alert(1)</script>', '<text class="label" onload="alert(1)">Text</text>',
  '<image href="https://example.com/a.png"/>', '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">HTML</div></foreignObject>',
  '<use href="#self" id="self"/>', '<animate attributeName="x"/>',
  '<g xmlns="http://www.w3.org/1999/xhtml"/>', '<text style="fill:red">Text</text>',
  '<path d="M0 0L1 1" transform="broken"/>', '<path d="M0 0L1 1" marker-end="url(#missing)"/>',
  '<path d="not a path"/>', '<mask id="mask"><rect width="100" height="100"/></mask>',
  '<g id="duplicate"/><g id="duplicate"/>', '<g><?test keep?></g>'
];
for (const [index, drawing] of unsafeDrawing.entries()) check(`hard-drawing-${index + 1}`, styled('.label{cursor:default}', drawing), "fallback");
check("style-child-cannot-disappear", simple.replace('</svg>', '<style>.label{<text>cursor:default</text>}</style></svg>'), "fallback");
check("cdata-cannot-disappear", simple.replace('</svg>', '<style><![CDATA[.label{cursor:default}]]></style></svg>'), "fallback");
check("processing-instruction-cannot-disappear", '<?xml-stylesheet href="https://example.com/a.css"?>' + simple.replace('</svg>', hints+'</svg>'), "fallback");
check("doctype-stays-blocked", '<!DOCTYPE svg [<!ENTITY a "x">]>' + simple.replace('</svg>', hints+'</svg>'), "fallback");
check("malformed-xml-stays-blocked", simple.replace('</svg>', hints), "fallback");
check("original-source-size-limit", simple.replace('</svg>', hints + 'x'.repeat(32000) + '</svg>'), "fallback");
check("original-element-limit", simple.replace('</svg>', hints + '<g/>'.repeat(512) + '</svg>'), "fallback");
check("original-depth-limit", simple.replace('</svg>', '<g>'.repeat(32) + hints + '</g>'.repeat(32) + '</svg>'), "fallback");
check("original-image-size-limit", simple.replace('100 100', '5000 5000').replace('</svg>', hints+'</svg>'), "fallback");
check("original-rule-limit", styled('.label{cursor:default}'.repeat(257)), "fallback");
check("original-declaration-limit", styled('.label{'+'cursor:default;'.repeat(1025)+'}'), "fallback");
check("original-expanded-declaration-limit", styled('.label{'+'font:16px serif;'.repeat(256)+'cursor:default}'), "fallback");
const counts = Object.fromEntries(["complete", "degraded", "fallback"].map(status => [status, rows.filter(row => row.status === status).length]));
const sizes = {};
const entries = {
  baseline: {entryPoints: ["src/svg-renderer.ts"]},
  parserAndPolicy: {entryPoints: ["scripts/prototypes/svg-degradation.mjs"]},
  fullLexerProbe: {stdin: {resolveDir: lab, contents: 'import {parse,lexer} from "css-tree"; export function probe(css){return lexer.matchProperty("font",parse(css,{context:"value"}));}'}}
};
for (const [name, entry] of Object.entries(entries)) {
  const bundle = await build({...buildOptions, ...entry, format: "iife", globalName: name === "parserAndPolicy" ? "CodexSvgDegradation" : "CodexSvgAssessment", minify: true});
  const bytes = bundle.outputFiles[0].contents;
  sizes[name] = {minifiedBytes: bytes.length, gzipBytes: gzipSync(bytes).length};
  if (name === "baseline") await writeFile(path.join(out, "baseline.js"), bytes);
  if (name === "parserAndPolicy") await writeFile(path.join(out, "prototype.js"), bytes);
}
function measure(fn) {
  const times = [];
  for (let round = 0; round < 3; round++) for (const {source} of fixtures) fn(source, fallback(source));
  for (let round = 0; round < 10; round++) for (const {source} of fixtures) {
    const code = fallback(source), start = performance.now(); fn(source, code); times.push(performance.now() - start);
  }
  times.sort((a,b)=>a-b);
  return {samples: times.length, medianMs: times[Math.floor(times.length/2)], p95Ms: times[Math.floor(times.length*0.95)]};
}
const report = {date: "2026-10-13", cssTreeVersion, scope: "isolated prototype; production unchanged", cases: rows.length, counts, sizes,
  jsdomTiming: {baseline: measure(strict), prototype: measure(prototype)}, results: rows};
await writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2)+"\n");
console.log(JSON.stringify({...report, results: undefined}, null, 2));
windowRef.close();
