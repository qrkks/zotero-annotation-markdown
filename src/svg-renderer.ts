/** Static SVG image boundary. User markup never enters the Reader's live DOM. */
import createDOMPurify, { type WindowLike } from "dompurify";
import { normalizeSvgMarkupWhitespace } from "./svg-markup.js";
import { validateSvgPath } from "./svg-path.js";
import { createSvgFontStyles } from "./svg-fonts.js";
import { createSvgClassStyles, parseSvgClassNames } from "./svg-class-styles.js";
import { createSvgAccessibility } from "./svg-accessibility.js";
import { createSvgDiagnostics, SvgPolicyError, type SvgRenderResult, type SvgDiagnostics } from "./svg-diagnostics.js";

export type { SvgRenderResult, SvgDiagnostic } from "./svg-diagnostics.js";
export interface SvgRenderOptions { inferFromSource?: boolean; allowDegradation?: boolean; sourceKind?: "svg" | "mermaid"; }

const SVG_NS = "http://www.w3.org/2000/svg";
export const SVG_LIMITS = { sourceChars: 32000, elements: 512, depth: 32, dimension: 4096 } as const;
const TAGS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "title", "desc", "defs", "marker", "linearGradient", "radialGradient", "stop", "style"
]);
const EMPTY_EXPORT_TAGS = new Set(["metadata", "style", "mask"]);
const ATTRS = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "dx", "dy", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "id", "transform", "fill", "stroke",
  "fill-opacity", "stroke-opacity", "opacity", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule",
  "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline", "style", "direction",
  "alignment-baseline", "letter-spacing", "preserveAspectRatio", "marker-start", "marker-mid",
  "marker-end", "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
  "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "fr", "offset",
  "stop-color", "stop-opacity"
]);
const ID = /^[A-Za-z_][\w.-]{0,63}$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:px|pt|em|%)?$/i;
const ENUMS: Record<string, RegExp> = {
  direction: /^(ltr|rtl)$/,
  "stroke-linecap": /^(butt|round|square)$/,
  "stroke-linejoin": /^(miter|round|bevel)$/,
  "fill-rule": /^(nonzero|evenodd)$/,
  "clip-rule": /^(nonzero|evenodd)$/,
  "font-weight": /^(normal|bold|bolder|lighter|[1-9]00)$/,
  "font-style": /^(normal|italic|oblique)$/,
  "text-anchor": /^(start|middle|end)$/,
  "dominant-baseline": /^(auto|alphabetic|ideographic|hanging|mathematical|central|middle|text-after-edge|text-before-edge)$/,
  "alignment-baseline": /^(auto|baseline|before-edge|text-before-edge|middle|central|after-edge|text-after-edge|ideographic|alphabetic|hanging|mathematical)$/,
  markerUnits: /^(strokeWidth|userSpaceOnUse)$/,
  gradientUnits: /^(userSpaceOnUse|objectBoundingBox)$/,
  spreadMethod: /^(pad|reflect|repeat)$/,
  preserveAspectRatio: /^(?:none|x(?:Min|Mid|Max)Y(?:Min|Mid|Max)(?:\s+(?:meet|slice))?)$/
};

export function createSvgRenderer(windowRef: Window | null) {
  const purifier = windowRef?.document ? createDOMPurify(windowRef as unknown as WindowLike) : null;
  const renderDetailed = (source: string, codeFallback: string, { inferFromSource = false, allowDegradation = true, sourceKind = "svg" }: SvgRenderOptions = {}): SvgRenderResult => {
    const diagnostics = createSvgDiagnostics(allowDegradation);
    const unchangedFallback = (): SvgRenderResult => ({ status:"fallback", html:codeFallback, originalSource:source, omittedCount:0, diagnostics:[], reason:null });
    // This is only a cheap candidate check. XML parsing below must confirm that
    // the entire unlabeled block is one SVG document before applying SVG policy.
    if (inferFromSource && !/^\s*(?:<\?xml\b[^?]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?=[\s/>])/.test(source.slice(0, SVG_LIMITS.sourceChars))) {
      return unchangedFallback();
    }
    try {
      if (!windowRef || !purifier?.isSupported) throw new SvgPolicyError("unavailable", "SVG rendering is unavailable.");
      if (source.length > SVG_LIMITS.sourceChars) throw new SvgPolicyError("limits", "SVG source exceeds 32,000 characters.");
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new SvgPolicyError("security", "SVG document declarations are unsupported.");
      const xml: Document = new windowRef.DOMParser().parseFromString(normalizeSvgMarkupWhitespace(source), "application/xml");
      const root = xml.documentElement;
      if (xml.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
        if (inferFromSource) return unchangedFallback();
        throw new SvgPolicyError("structure", "SVG must be a well-formed SVG document.");
      }
      if (Array.from(xml.childNodes).some(node => node.nodeType === 7)) throw new SvgPolicyError("security", "SVG processing instructions are unsupported.");
      const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
      if (nodes.length > SVG_LIMITS.elements) throw new SvgPolicyError("limits", "SVG exceeds 512 elements.");
      const ids = new Map<string, Element>();
      const accessibility = createSvgAccessibility(root, ID);
      const references: Array<{ id: string; marker: boolean }> = [];
      const normalizeFontStyles = createSvgFontStyles(windowRef.atob.bind(windowRef));
      const classStyles = createSvgClassStyles(normalizeFontStyles, (name, value, node) => {
        const ref = validateDrawingAttribute(name, value, node);
        if (ref) references.push(ref);
      }, diagnostics, TAGS);
      const referencedIds = new Set(nodes.flatMap(node => Array.from(node.attributes)
        .map(attr => attr.value.trim().match(/^url\(#([A-Za-z_][\w.-]{0,63})\)$/)?.[1])
        .filter((id): id is string => Boolean(id))));
      for (const node of nodes) {
        if (node.namespaceURI !== SVG_NS || (!TAGS.has(node.localName) && !EMPTY_EXPORT_TAGS.has(node.localName)) || node.prefix || (node !== root && node.localName === "svg")) {
          throw new Error(`Unsupported SVG element: ${node.localName}.`);
        }
        let depth = 0;
        for (let parent: Element | null = node; parent; parent = parent.parentElement) depth++;
        if (depth > SVG_LIMITS.depth) throw new SvgPolicyError("limits", "SVG nesting exceeds 32 levels.");
        if (Array.from(node.childNodes).some(child => ![1, 3, 8].includes(child.nodeType))) throw new SvgPolicyError("structure", "Unsupported SVG content.");
        if (EMPTY_EXPORT_TAGS.has(node.localName)) {
          prepareExportExtra(node, ids, referencedIds, classStyles.normalize, diagnostics);
          continue;
        }
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name;
          const value = attr.value.trim();
          if (accessibility.acceptAttribute(node, attr)) continue;
          if (node === root && !attr.namespaceURI && (name === "version" || (name === "style" && /^max-width\s*:\s*100%\s*;?$/i.test(value)))) {
            node.removeAttribute(name);
            continue;
          }
          if (name === "class" && !attr.namespaceURI) {
            parseSvgClassNames(attr.value);
            continue;
          }
          if (!attr.namespaceURI && diagnostics.omitDisplayHint(name, value, "attribute")) {
            node.removeAttributeNode(attr);
            continue;
          }
          if (!ATTRS.has(name) || (attr.namespaceURI && name !== "xmlns")) throw new Error(`Unsupported SVG attribute: ${name}.`);
          if (name === "style") {
            if (!["text", "tspan"].includes(node.localName) || !/^white-space\s*:\s*pre\s*;?$/i.test(value)) throw new Error("Unsupported SVG text style.");
            node.setAttribute("style", "white-space: pre;");
          } else if (name === "xmlns") {
            if (value !== SVG_NS) throw new Error("Unsupported SVG namespace.");
          } else if (name === "id") {
            recordId(value, node, ids);
          } else {
            const ref = validateDrawingAttribute(name, value, node);
            if (ref) references.push(ref);
          }
        }
      }
      // Original attributes have all passed validation before CSS can overwrite
      // them. Inherited presentation attributes keep SVG's normal inheritance.
      classStyles.apply(nodes.filter(node => !EMPTY_EXPORT_TAGS.has(node.localName)));
      for (const ref of references) {
        const target = ids.get(ref.id);
        if (!target || !(ref.marker ? target.localName === "marker" : ["linearGradient", "radialGradient"].includes(target.localName))) {
          throw new Error("SVG references must point to a local marker or gradient.");
        }
      }
      const { label, description } = accessibility.finish(ids);
      const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
      if (viewBox && (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || !validDimension(viewBox[2]) || !validDimension(viewBox[3]))) {
        throw new SvgPolicyError("limits", "SVG needs a valid viewBox up to 4096 × 4096.");
      }
      const width = dimension(root.getAttribute("width"), viewBox?.[2]);
      const height = dimension(root.getAttribute("height"), viewBox?.[3]);
      if (!validDimension(width) || !validDimension(height)) throw new SvgPolicyError("limits", "SVG needs a viewBox or dimensions up to 4096 × 4096.");
      root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
      const serialized = new windowRef.XMLSerializer().serializeToString(root);
      const clean = purifier.sanitize(serialized, {
        NAMESPACE: SVG_NS, ALLOWED_TAGS: [...TAGS, "#text"], ALLOWED_ATTR: [...ATTRS],
        ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, KEEP_CONTENT: false,
        // Preserve local paint IDs such as "body". This separately validated SVG
        // is used only as an isolated image, never as nodes in the Reader DOM.
        SANITIZE_DOM: false
      });
      if (!clean || !clean.includes("<svg")) throw new SvgPolicyError("security", "SVG could not be sanitized.");
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
      const imageDescription = description ? ` title="${escapeHtml(description)}"` : ` title="View larger"`;
      const warning = diagnostics.omittedCount ? `<p class="annotation-markdown-svg-warning" role="note">${escapeHtml(diagnostics.warningText())}</p>` : "";
      const html = `<figure class="annotation-markdown-svg${sourceKind === "mermaid" ? " annotation-markdown-mermaid" : ""}">${warning}<img class="annotation-markdown-svg-image" role="button" tabindex="0" aria-haspopup="dialog" aria-label="View larger: ${escapeHtml(label)}" src="${src}" alt="${escapeHtml(label)}"${imageDescription} width="${width}" height="${height}" decoding="async"><div class="annotation-markdown-svg-fallback" hidden><p class="annotation-markdown-svg-error">Diagram could not be displayed.</p>${codeFallback}</div></figure>`;
      return { status:diagnostics.omittedCount ? "degraded" : "complete", html, originalSource:source,
        omittedCount:diagnostics.omittedCount, diagnostics:diagnostics.diagnostics, reason:null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG could not be rendered.";
      return { status:"fallback", html:`<p class="annotation-markdown-svg-error">${escapeHtml(message)}</p>${codeFallback}`,
        originalSource:source, omittedCount:diagnostics.omittedCount, reason:message,
        diagnostics:[...diagnostics.diagnostics.slice(0, 7), { code:"svg-rejected", kind:error instanceof SvgPolicyError ? error.kind : "unsupported", message }] };
    }
  };
  // Preserve the existing Markdown fence API; consumers needing policy outcomes
  // can read typed diagnostics directly without inspecting HTML or error text.
  return Object.assign((source: string, codeFallback: string, options?: SvgRenderOptions): string => renderDetailed(source, codeFallback, options).html,
    { renderDetailed });
}

function recordId(value: string, node: Element, ids: Map<string, Element>): void {
  if (!ID.test(value) || ids.has(value)) throw new Error("SVG IDs must be unique and simple.");
  ids.set(value, node);
}
function prepareExportExtra(node: Element, ids: Map<string, Element>, referencedIds: Set<string>, normalizeStyles: (css: string) => string, diagnostics: SvgDiagnostics): void {
  if (node.children.length || (node.localName !== "style" && node.textContent?.trim())) {
    throw new Error(`Unsupported SVG element: ${node.localName}.`);
  }
  for (const attr of Array.from(node.attributes)) {
    const value = attr.value.trim();
    if (attr.name === "xmlns" && value === SVG_NS) continue;
    if (attr.namespaceURI) throw new Error(`Unsupported SVG attribute: ${attr.name}.`);
    if (diagnostics.omitDisplayHint(attr.name, value, "attribute")) {
      node.removeAttributeNode(attr);
      continue;
    }
    if (attr.name === "id") {
      recordId(value, node, ids);
      if (referencedIds.has(value)) throw new Error(`Referenced SVG ${node.localName} is unsupported.`);
    } else if (node.localName === "style" && (attr.name === "class" || (attr.name === "type" && value === "text/css"))) {
      // These export attributes do not control the restricted stylesheet.
    } else {
      throw new Error(`Unsupported SVG attribute: ${attr.name}.`);
    }
  }
  if (node.localName === "style" && node.textContent?.trim()) {
    const css = normalizeStyles(node.textContent);
    for (const attr of Array.from(node.attributes)) node.removeAttributeNode(attr);
    if (css) node.textContent = css;
    else node.remove();
  } else {
    node.remove();
  }
}

function validateDrawingAttribute(name: string, value: string, node?: Element): { id: string; marker: boolean } | undefined {
  if (["fill", "stroke", "stop-color"].includes(name) || name.startsWith("marker-")) {
    const ref = value.match(/^url\(#([A-Za-z_][\w.-]{0,63})\)$/);
    if (ref) {
      if (node?.closest("marker")) throw new Error("References inside SVG markers are unsupported.");
      return { id: ref[1], marker: name.startsWith("marker-") };
    } else if (name.startsWith("marker-")) {
      if (value !== "none") throw new Error("SVG markers must use a local reference.");
    } else if (!/^(?:[a-z]+|#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.%+\-, /]+\))$/i.test(value)) {
      throw new Error("SVG paint must be a color or local gradient.");
    }
  } else if (ENUMS[name]) {
    if (!ENUMS[name].test(value)) throw new Error(`Unsupported SVG value: ${name}.`);
  } else if (name === "font-family") {
    if (!/^[\w\u0080-\uffff ,'"-]{1,128}$/.test(value)) throw new Error("Unsupported SVG font family.");
  } else if (name === "orient" && ["auto", "auto-start-reverse"].includes(value)) {
    // Static marker orientation.
  } else if (name === "transform" || name === "gradientTransform") {
    const parts = [...value.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^()]*)\)/g)];
    if (!parts.length || value.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\([^()]*\)/g, "").trim()) throw new Error("Unsupported SVG transform.");
    for (const part of parts) validateNumbers(part[2]);
  } else if (name === "d") {
    validateSvgPath(value);
  } else if (["viewBox", "points", "stroke-dasharray"].includes(name)) {
    if (name !== "stroke-dasharray" || value !== "none") validateNumbers(value);
  } else {
    const match = value.match(LENGTH);
    if (!match || !boundedNumber(match[1])) throw new Error(`Unsupported SVG number: ${name}.`);
  }
  return undefined;
}

function boundedNumber(value: string): boolean { return NUMBER.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 100000; }
function validateNumbers(value: string): void {
  const numbers = value.trim().split(/[\s,]+/).filter(Boolean);
  if (!numbers.length || !numbers.every(boundedNumber)) throw new Error("Unsupported SVG coordinate.");
}
function validDimension(value: number | undefined): value is number { return value !== undefined && value > 0 && value <= SVG_LIMITS.dimension; }
function dimension(value: string | null, fallback?: number): number | undefined {
  if (!value) return fallback;
  if (value.endsWith("%")) return fallback;
  const match = value.match(/^([\d.]+)(?:px)?$/);
  return match ? Number(match[1]) : NaN;
}
function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
