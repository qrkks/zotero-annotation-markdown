/** Assessment-only wrapper. The production renderer and its policy stay intact. */
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import { createSvgRenderer, SVG_LIMITS } from "../../src/svg-renderer.ts";
import { normalizeSvgMarkupWhitespace } from "../../src/svg-markup.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const CLASS = /^[A-Za-z_][\w-]{0,63}$/;
const HINTS = new Set(["text-rendering", "shape-rendering", "cursor"]);
const KEYWORD = /^[A-Za-z][A-Za-z-]{0,63}$/;
const LOCAL_URL = /^#[A-Za-z_][\w.-]{0,63}$/;
const FONT_URL = /^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/i;
const MAX_ISSUES = 8;

class PolicyError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

export function createSvgDegradationPrototype(windowRef) {
  const strictRender = createSvgRenderer(windowRef);
  return (source, codeFallback) => {
    const initialHtml = strictRender(source, codeFallback);
    // This assessment uses the strict renderer's known wrapper. Production
    // integration should expose a structured result instead of inspecting HTML.
    const hasImage = html => html.startsWith('<figure class="annotation-markdown-svg">');
    if (hasImage(initialHtml)) {
      return { status: "complete", html: initialHtml, issues: [], omittedCount: 0, originalSource: source, reason: null, kind: null };
    }
    const issues = [];
    let omittedCount = 0;
    const omitted = (property, location) => {
      omittedCount++;
      const existing = issues.find(issue => issue.property === property && issue.location === location);
      if (existing) existing.count++;
      else if (issues.length < MAX_ISSUES) issues.push({ code: "ignored-display-hint", property, location, count: 1 });
    };
    try {
      if (source.length <= SVG_LIMITS.sourceChars && !/\b(?:text-rendering|shape-rendering|cursor)\b/i.test(source)) {
        return { status: "fallback", html: initialHtml, issues, omittedCount, originalSource: source, reason: "Strict SVG policy rejected the input.", kind: "strict-policy" };
      }
      if (!windowRef?.document) throw new PolicyError("structure", "SVG rendering is unavailable.");
      if (source.length > SVG_LIMITS.sourceChars) throw new PolicyError("limits", "SVG source exceeds 32,000 characters.");
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new PolicyError("security", "SVG document declarations are unsupported.");
      const xml = new windowRef.DOMParser().parseFromString(normalizeSvgMarkupWhitespace(source), "application/xml");
      const root = xml.documentElement;
      if (xml.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
        throw new PolicyError("structure", "SVG must be a well-formed SVG document.");
      }
      if ([...xml.childNodes].some(node => node.nodeType === 7)) {
        throw new PolicyError("security", "SVG processing instructions remain unsupported.");
      }
      const nodes = [root, ...root.querySelectorAll("*")];
      if (nodes.length > SVG_LIMITS.elements) throw new PolicyError("limits", "SVG exceeds 512 elements.");
      for (const node of nodes) {
        let depth = 0;
        for (let parent = node; parent; parent = parent.parentElement) depth++;
        if (depth > SVG_LIMITS.depth) throw new PolicyError("limits", "SVG nesting exceeds 32 levels.");
        if ([...node.childNodes].some(child => ![1, 3, 8].includes(child.nodeType)) ||
            (node.localName === "style" && node.children.length)) {
          throw new PolicyError("structure", "Unsupported SVG content cannot be rewritten.");
        }
      }
      let ruleCount = 0, declarationCount = 0;
      // Scan every stylesheet before dropping any declarations. Nothing unparsed
      // or URL-bearing is passed through merely because it would be discarded.
      for (const node of nodes) {
        if (node.namespaceURI !== SVG_NS || node.localName !== "style" || !node.textContent.trim()) continue;
        const css = node.textContent;
        if (css.includes("\\")) throw new PolicyError("security", "SVG CSS escapes remain unsupported.");
        const ast = parse(css, {
          positions: true,
          onParseError() { throw new PolicyError("structure", "CSS syntax cannot be safely separated."); }
        });
        walk(ast, part => {
          if (part.type === "Raw") throw new PolicyError("structure", "Unparsed CSS remains unsupported.");
          if (part.type === "Url" && !LOCAL_URL.test(part.value) && !FONT_URL.test(part.value)) {
            throw new PolicyError("security", "SVG external resources remain unsupported.");
          }
          if (part.type === "Function" && /^expression$/i.test(part.name)) {
            throw new PolicyError("security", "Executable CSS remains unsupported.");
          }
          if (part.type === "Atrule" && /^import$/i.test(part.name)) {
            throw new PolicyError("security", "SVG stylesheet imports remain unsupported.");
          }
        });
        const cuts = [];
        for (const rule of ast.children) {
          if (rule.type === "Atrule" && /^font-face$/i.test(rule.name)) continue;
          if (rule.type !== "Rule" || rule.prelude?.type !== "SelectorList") {
            throw new PolicyError("meaning", "Unsupported SVG stylesheet rule.");
          }
          if (++ruleCount > 256) throw new PolicyError("limits", "SVG exceeds 256 class rules.");
          const selectors = [...rule.prelude.children];
          if (selectors.length > 16) throw new PolicyError("limits", "SVG exceeds 16 selectors per class rule.");
          for (const selector of selectors) {
            const parts = [...selector.children];
            if (parts.length !== 1 || parts[0].type !== "ClassSelector" || !CLASS.test(parts[0].name)) {
              throw new PolicyError("meaning", "SVG stylesheets still require simple .class selectors.");
            }
          }
          for (const declaration of rule.block.children) {
            if (declaration.type !== "Declaration" || declaration.important) {
              throw new PolicyError("meaning", "Unsupported SVG CSS declaration or priority.");
            }
            const property = declaration.property.toLowerCase();
            declarationCount += property === "font" ? 4 : 1;
            if (declarationCount > 1024) throw new PolicyError("limits", "SVG exceeds 1,024 class declarations.");
            if (!HINTS.has(property)) continue;
            const values = [...declaration.value.children];
            if (values.length !== 1 || values[0].type !== "Identifier" || !KEYWORD.test(values[0].name)) {
              throw new PolicyError("meaning", "Only keyword display hints may be omitted.");
            }
            cuts.push([declaration.loc.start.offset, declaration.loc.end.offset]);
            omitted(property, "stylesheet");
          }
        }
        // Keep literal slices rather than CSS regeneration, which can compact
        // font shorthand into spellings the production subset does not accept.
        for (const [start, end] of cuts.reverse()) node.textContent = node.textContent.slice(0, start) + node.textContent.slice(end);
      }
      for (const node of nodes) {
        if (node.namespaceURI !== SVG_NS) continue;
        for (const attr of [...node.attributes]) {
          if (attr.namespaceURI || !HINTS.has(attr.name)) continue;
          if (!KEYWORD.test(attr.value.trim())) throw new PolicyError("meaning", "Only keyword display hints may be omitted.");
          node.removeAttributeNode(attr);
          omitted(attr.name, "attribute");
        }
      }
      // All geometry, namespaces, active content, fonts and remaining CSS still
      // pass the complete production validator and SVG-context DOMPurify pass.
      const filteredSource = new windowRef.XMLSerializer().serializeToString(root);
      const html = omittedCount ? strictRender(filteredSource, codeFallback) : initialHtml;
      const container = windowRef.document.createElement("div");
      container.innerHTML = html;
      if (!container.querySelector(".annotation-markdown-svg-image")) {
        return { status: "fallback", html, issues, omittedCount, originalSource: source,
          reason: container.querySelector(".annotation-markdown-svg-error")?.textContent ?? "SVG could not be rendered.", kind: "strict-policy" };
      }
      const warning = omittedCount ? `<p class="annotation-markdown-svg-warning" role="note">兼容预览：${omittedCount} 项显示提示未应用，外观可能与原图不同。${issues.map(issue => escapeHtml(issue.property)).join("、")}</p>` : "";
      return { status: omittedCount ? "degraded" : "complete", html: warning + html,
        issues, omittedCount, originalSource: source, reason: null, kind: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG could not be rendered.";
      return { status: "fallback", html: `<p class="annotation-markdown-svg-error">${escapeHtml(message)}</p>${codeFallback}`,
        issues, omittedCount, originalSource: source, reason: message, kind: error instanceof PolicyError ? error.kind : "structure" };
    }
  };
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
