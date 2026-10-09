/** Static SVG image boundary. User markup never enters the Reader's live DOM. */
import createDOMPurify, { type WindowLike } from "dompurify";

const SVG_NS = "http://www.w3.org/2000/svg";
export const SVG_LIMITS = { sourceChars: 32000, elements: 512, depth: 32, dimension: 4096 } as const;
const TAGS = new Set([
  "svg", "g", "rect", "circle", "ellipse", "line", "polyline", "polygon", "path",
  "text", "tspan", "title", "desc", "defs", "marker", "linearGradient", "radialGradient", "stop"
]);
const ATTRS = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "dx", "dy", "x1", "y1", "x2", "y2",
  "cx", "cy", "r", "rx", "ry", "d", "points", "id", "transform", "fill", "stroke",
  "fill-opacity", "stroke-opacity", "opacity", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule",
  "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "alignment-baseline", "letter-spacing", "preserveAspectRatio", "marker-start", "marker-mid",
  "marker-end", "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits",
  "gradientUnits", "gradientTransform", "spreadMethod", "fx", "fy", "fr", "offset",
  "stop-color", "stop-opacity"
]);
const ID = /^[A-Za-z_][\w.-]{0,63}$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const LENGTH = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?:px|pt|em|%)?$/i;
const ENUMS: Record<string, RegExp> = {
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
  return (source: string, codeFallback: string): string => {
    try {
      if (!windowRef || !purifier?.isSupported) throw new Error("SVG rendering is unavailable.");
      if (source.length > SVG_LIMITS.sourceChars) throw new Error("SVG source exceeds 32,000 characters.");
      if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)) throw new Error("SVG document declarations are unsupported.");
      const xml: Document = new windowRef.DOMParser().parseFromString(source, "application/xml");
      const root = xml.documentElement;
      if (xml.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
        throw new Error("SVG must be a well-formed SVG document.");
      }
      if (Array.from(xml.childNodes).some(node => node.nodeType === 7)) throw new Error("SVG processing instructions are unsupported.");
      const nodes = [root, ...Array.from(root.querySelectorAll("*"))];
      if (nodes.length > SVG_LIMITS.elements) throw new Error("SVG exceeds 512 elements.");
      const ids = new Map<string, Element>();
      const references: Array<{ id: string; marker: boolean }> = [];
      for (const node of nodes) {
        if (node.namespaceURI !== SVG_NS || !TAGS.has(node.localName) || node.prefix || (node !== root && node.localName === "svg")) {
          throw new Error(`Unsupported SVG element: ${node.localName}.`);
        }
        let depth = 0;
        for (let parent: Element | null = node; parent; parent = parent.parentElement) depth++;
        if (depth > SVG_LIMITS.depth) throw new Error("SVG nesting exceeds 32 levels.");
        if (Array.from(node.childNodes).some(child => ![1, 3, 8].includes(child.nodeType))) throw new Error("Unsupported SVG content.");
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name;
          const value = attr.value.trim();
          if (!ATTRS.has(name) || (attr.namespaceURI && name !== "xmlns")) throw new Error(`Unsupported SVG attribute: ${name}.`);
          if (name === "xmlns") {
            if (value !== SVG_NS) throw new Error("Unsupported SVG namespace.");
          } else if (name === "id") {
            if (!ID.test(value) || ids.has(value)) throw new Error("SVG IDs must be unique and simple.");
            ids.set(value, node);
          } else if (["fill", "stroke", "stop-color"].includes(name) || name.startsWith("marker-")) {
            const ref = value.match(/^url\(#([A-Za-z_][\w.-]{0,63})\)$/);
            if (ref) {
              if (node.closest("marker")) throw new Error("References inside SVG markers are unsupported.");
              references.push({ id: ref[1], marker: name.startsWith("marker-") });
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
            if (!/^[MmLlHhVvCcSsQqTtAaZz\deE+.,\s-]*$/.test(value)) throw new Error("Unsupported SVG path.");
            validateNumbers(value.replace(/[MmLlHhVvCcSsQqTtAaZz]/g, " "));
          } else if (["viewBox", "points", "stroke-dasharray"].includes(name)) {
            if (name !== "stroke-dasharray" || value !== "none") validateNumbers(value);
          } else {
            const match = value.match(LENGTH);
            if (!match || !boundedNumber(match[1])) throw new Error(`Unsupported SVG number: ${name}.`);
          }
        }
      }
      for (const ref of references) {
        const target = ids.get(ref.id);
        if (!target || !(ref.marker ? target.localName === "marker" : ["linearGradient", "radialGradient"].includes(target.localName))) {
          throw new Error("SVG references must point to a local marker or gradient.");
        }
      }
      const viewBox = root.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
      if (viewBox && (viewBox.length !== 4 || !viewBox.every(Number.isFinite) || !validDimension(viewBox[2]) || !validDimension(viewBox[3]))) {
        throw new Error("SVG needs a valid viewBox up to 4096 × 4096.");
      }
      const width = dimension(root.getAttribute("width"), viewBox?.[2]);
      const height = dimension(root.getAttribute("height"), viewBox?.[3]);
      if (!validDimension(width) || !validDimension(height)) throw new Error("SVG needs a viewBox or dimensions up to 4096 × 4096.");
      root.setAttribute("width", String(width)); root.setAttribute("height", String(height));
      const serialized = new windowRef.XMLSerializer().serializeToString(root);
      const clean = purifier.sanitize(serialized, {
        NAMESPACE: SVG_NS, ALLOWED_TAGS: [...TAGS, "#text"], ALLOWED_ATTR: [...ATTRS],
        ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false, KEEP_CONTENT: false
      });
      if (!clean || !clean.includes("<svg")) throw new Error("SVG could not be sanitized.");
      const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
      const title = root.querySelector("title")?.textContent?.trim().slice(0, 160) || "SVG diagram";
      return `<figure class="annotation-markdown-svg"><img class="annotation-markdown-svg-image" src="${src}" alt="${escapeHtml(title)}" width="${width}" height="${height}" decoding="async"><button type="button" class="annotation-markdown-svg-open">View larger</button><div class="annotation-markdown-svg-fallback" hidden><p class="annotation-markdown-svg-error">SVG image could not be displayed.</p>${codeFallback}</div></figure>`;
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG could not be rendered.";
      return `<p class="annotation-markdown-svg-error">${escapeHtml(message)}</p>${codeFallback}`;
    }
  };
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
