/** Restricted class rules are flattened into an isolated SVG preview copy. */
import { parseSvgFontShorthand } from "./svg-font-shorthand.js";

export const SVG_CLASS_STYLE_LIMITS = { rules: 256, declarations: 1024, selectorsPerRule: 16, classesPerElement: 16 } as const;
const CLASS_NAME = /^[A-Za-z_][\w-]{0,63}$/;
const PROPERTIES = new Set([
  "fill", "stroke", "fill-opacity", "stroke-opacity", "opacity", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "fill-rule", "clip-rule",
  "font-size", "font-family", "font-weight", "font-style", "text-anchor", "dominant-baseline",
  "alignment-baseline", "letter-spacing", "direction", "marker-start", "marker-mid", "marker-end",
  "stop-color", "stop-opacity"
]);
type Declaration = [name: string, value: string];
type ClassRule = { classes: string[]; declarations: Declaration[] };

export function parseSvgClassNames(value: string): string[] {
  const classes = value.split(/[\t\n\f\r ]+/).filter(Boolean);
  if (classes.length > SVG_CLASS_STYLE_LIMITS.classesPerElement || classes.some(name => !CLASS_NAME.test(name))) {
    throw new Error("SVG needs up to 16 simple class names per element.");
  }
  return classes;
}

export function createSvgClassStyles(
  normalizeFontStyles: (css: string) => string,
  validateDeclaration: (name: string, value: string, node?: Element) => void
): { normalize: (css: string) => string; apply: (nodes: Element[]) => void } {
  const rules: ClassRule[] = [];
  let declarationCount = 0;
  return {
    normalize(css) {
      css = removeComments(css);
      const pattern = /\s*([^{}]+)\{([^{}]*)\}/gy;
      let index = 0;
      let fonts = "";
      while (css.slice(index).trim()) {
        pattern.lastIndex = index;
        const rule = pattern.exec(css);
        if (!rule) throw new Error("Malformed SVG stylesheet.");
        index = pattern.lastIndex;
        const selector = rule[1].trim();
        if (/^@font-face$/i.test(selector)) {
          fonts += normalizeFontStyles(rule[0]);
          continue;
        }
        const selectors = selector.split(",").map(value => value.trim());
        if (selectors.length > SVG_CLASS_STYLE_LIMITS.selectorsPerRule ||
            selectors.some(value => !value.startsWith(".") || !CLASS_NAME.test(value.slice(1)))) {
          throw new Error("SVG stylesheets support only simple .class selectors and comma groups.");
        }
        if (rules.length >= SVG_CLASS_STYLE_LIMITS.rules) throw new Error("SVG exceeds 256 class rules.");
        const declarations: Declaration[] = [];
        for (const [name, value] of parseDeclarations(rule[2])) {
          const expanded: Declaration[] = name === "font" ? parseSvgFontShorthand(value) : [[name, value]];
          for (const [property, content] of expanded) {
            if (++declarationCount > SVG_CLASS_STYLE_LIMITS.declarations) throw new Error("SVG exceeds 1,024 class declarations.");
            if (!PROPERTIES.has(property)) throw new Error(`Unsupported SVG class property: ${property}.`);
            // Validate even unused or later overridden declarations.
            validateDeclaration(property, content);
            declarations.push([property, content]);
          }
        }
        rules.push({ classes: selectors.map(value => value.slice(1)), declarations });
      }
      return fonts;
    },
    apply(nodes) {
      for (const node of nodes) {
        const value = node.getAttribute("class");
        if (value === null) continue;
        const classes = new Set(parseSvgClassNames(value));
        const winners = new Map<string, string>();
        // Every supported selector has the same specificity. Stylesheet order
        // wins over presentation attributes, independently of class-list order.
        for (const rule of rules) {
          if (rule.classes.some(name => classes.has(name))) {
            for (const [name, value] of rule.declarations) winners.set(name, value);
          }
        }
        for (const [name, value] of winners) {
          validateDeclaration(name, value, node);
          node.setAttribute(name, value);
        }
        node.removeAttribute("class");
      }
    }
  };
}

function removeComments(css: string): string {
  let clean = "";
  let quote = "";
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === "\\") throw new Error("SVG CSS escapes are unsupported.");
    if (quote) {
      clean += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
      clean += char;
    } else if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) throw new Error("Unclosed SVG CSS comment.");
      clean += " ";
      index = end + 1;
    } else {
      clean += char;
    }
  }
  if (quote) throw new Error("Unclosed SVG CSS string.");
  return clean;
}

function parseDeclarations(body: string): Declaration[] {
  const declarations: Declaration[] = [];
  let start = 0;
  let quote = "";
  let parentheses = 0;
  for (let index = 0; index <= body.length; index++) {
    const char = body[index];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      if (++parentheses > 1) throw new Error("Unsupported SVG class value.");
    } else if (char === ")") {
      if (--parentheses < 0) throw new Error("Malformed SVG class value.");
    }
    if ((char === ";" && !quote && !parentheses) || index === body.length) {
      if (quote || parentheses) throw new Error("Malformed SVG class declaration.");
      const declaration = body.slice(start, index).trim();
      start = index + 1;
      if (!declaration) continue;
      const match = declaration.match(/^([a-z-]+)\s*:\s*(.+)$/is);
      if (!match || match[2].includes("!")) throw new Error("Unsupported SVG class declaration.");
      declarations.push([match[1].toLowerCase(), match[2].trim()]);
    }
  }
  return declarations;
}
