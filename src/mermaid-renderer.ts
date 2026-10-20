/** Mermaid source -> static SVG image; never mount Pele into the Reader DOM. */
import { register, render, type TextMeasurer } from "pele/core";
import flowchart from "pele/diagrams/flowchart";
import sequence from "pele/diagrams/sequence";
import state from "pele/diagrams/state";
import classDiagram from "pele/diagrams/class";
import er from "pele/diagrams/er";
import pie from "pele/diagrams/pie";
import mindmap from "pele/diagrams/mindmap";
import { createSvgRenderer, SVG_LIMITS } from "./svg-renderer.js";
import { parseSvgFontShorthand } from "./svg-font-shorthand.js";

register(flowchart, sequence, state, classDiagram, er, pie, mindmap);

export const MERMAID_LIMITS = { sourceChars: 8000, edges: 128 } as const;
const SVG_NS = "http://www.w3.org/2000/svg";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

export function createMermaidRenderer(windowRef: Window | null, renderSvg: ReturnType<typeof createSvgRenderer>) {
  let context: CanvasRenderingContext2D | null | undefined;
  // Measure with the Reader's own document, even when the plugin's global
  // sandbox has no document. Reuse one detached canvas only after first use.
  const measurer: TextMeasurer = {
    width(text, size, style) {
      context ??= windowRef?.document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Diagram text measurement is unavailable.");
      context.font = `${style & 2 ? "italic " : ""}${style & 1 ? "bold " : ""}${size}px ${style & 4 ? "monospace" : "sans-serif"}`;
      return context.measureText(text).width;
    }
  };

  return (source: string, codeFallback: string): string => {
    try {
      if (!windowRef) throw new Error("Diagram rendering is unavailable.");
      if (source.length > MERMAID_LIMITS.sourceChars) throw new Error("Mermaid source exceeds 8,000 characters.");
      const result = render(source, {
        measurer, fontFamily: "sans-serif", fontFamilyMono: "monospace", fontSize: 16,
        responsive: false, autoDirection: false, links: false, images: false,
        limit: MERMAID_LIMITS.sourceChars, maxEdges: MERMAID_LIMITS.edges, outputLimit: SVG_LIMITS.sourceChars
      });
      const svg = toStaticSvg(result.svg, windowRef);
      return renderSvg(svg, codeFallback, { allowDegradation: false, sourceKind: "mermaid" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Diagram could not be rendered.";
      return `<p class="annotation-markdown-svg-error">Mermaid: ${escapeHtml(message.slice(0, 500))}</p>${codeFallback}`;
    }
  };
}

/** Adapt only Pele's generated output. The shared raw-SVG policy stays strict. */
function toStaticSvg(source: string, windowRef: Window): string {
  if (source.length > SVG_LIMITS.sourceChars) throw new Error("Generated SVG exceeds 32,000 characters.");
  const xml: Document = new windowRef.DOMParser().parseFromString(source, "application/xml");
  const root = xml.documentElement;
  if (xml.querySelector("parsererror") || root.localName !== "svg" || root.namespaceURI !== SVG_NS) {
    throw new Error("Generated SVG is invalid.");
  }
  const nodes = [root, ...root.querySelectorAll("*")];
  if (nodes.length >= SVG_LIMITS.elements) throw new Error("Generated SVG exceeds 512 elements.");
  // Pele stores theme aliases on the root. Resolve their default values inside
  // the isolated image, without inheriting CSS or installing a host stylesheet.
  const variables = new Map(declarations(root.getAttribute("style") ?? "").filter(([key]) => key.startsWith("--")));
  function resolve(value: string): string {
    for (let depth = 0; value.includes("var(") && depth < 16; depth++) {
      const next = value.replace(/var\(\s*(--[\w-]+)\s*(?:,([^()]*))?\)/g, (_, name: string, fallback: string | undefined) => {
        const replacement = variables.get(name) ?? fallback?.trim();
        if (replacement === undefined) throw new Error("Unresolved diagram style variable.");
        return replacement;
      });
      if (next === value) throw new Error("Unsupported diagram style variable.");
      value = next;
    }
    if (value.includes("var(")) throw new Error("Diagram style variables are nested too deeply.");
    return value;
  }
  const foreground = resolve(variables.get("--_fg") ?? "#1f1f1f");
  const background = resolve(variables.get("--_bg") ?? "#fff");
  for (const node of nodes) {
    const css = declarations(node.getAttribute("style") ?? "");
    let preserveSpace = false;
    for (const attr of Array.from(node.attributes)) {
      if (attr.name === "style" || attr.name === "class" || attr.name.startsWith("data-") ||
          attr.name === "role" || attr.name === "aria-roledescription") {
        node.removeAttributeNode(attr);
      } else if (attr.namespaceURI === XML_NS && attr.localName === "space" && attr.value === "preserve") {
        preserveSpace = true; node.removeAttributeNode(attr);
      } else {
        attr.value = resolve(attr.value).replace(/\bcurrentColor\b/gi, foreground);
      }
    }
    for (const [name, value] of css) {
      if (node === root && (name.startsWith("--") || name === "color" ||
          (name === "letter-spacing" && value === "normal") ||
          (name === "word-spacing" && value === "normal") ||
          (name === "text-transform" && value === "none"))) continue;
      const resolved = resolve(value).replace(/\bcurrentColor\b/gi, foreground);
      if (name === "font") {
        for (const [key, val] of parseSvgFontShorthand(resolved)) node.setAttribute(key, val);
      } else if (name === "white-space" && value === "pre") {
        preserveSpace = true;
      } else {
        node.setAttribute(name, resolved);
      }
    }
    if (preserveSpace) node.setAttribute("style", "white-space: pre;");
  }
  root.setAttribute("role", "img");
  // A fixed light canvas keeps explicit source colors readable in both host
  // themes. This background is part of the image and the larger-image viewer.
  const bounds = (root.getAttribute("viewBox") ?? "").split(/[\s,]+/);
  if (bounds.length !== 4) throw new Error("Generated SVG needs a viewBox.");
  const rect = xml.createElementNS(SVG_NS, "rect");
  for (const [index, name] of ["x", "y", "width", "height"].entries()) rect.setAttribute(name, bounds[index]);
  rect.setAttribute("fill", background);
  root.insertBefore(rect, root.firstChild);
  return new windowRef.XMLSerializer().serializeToString(root);
}

function declarations(css: string): Array<[string, string]> {
  return css.split(";").filter(part => part.trim()).map(part => {
    const colon = part.indexOf(":");
    const name = part.slice(0, colon).trim(), value = part.slice(colon + 1).trim();
    if (colon < 1 || !/^(?:--[\w-]+|[a-z-]+)$/.test(name) || !value) throw new Error("Unsupported diagram style.");
    return [name, value];
  });
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
