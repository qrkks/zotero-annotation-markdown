/** Restricted type/class rules are flattened into an isolated SVG preview copy. */
import { parseSvgFontShorthand } from "./svg-font-shorthand.js";
import parse from "css-tree/parser";
import walk from "css-tree/walker";
import { SvgPolicyError, type SvgDiagnostics } from "./svg-diagnostics.js";

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
type StyleSelector = { kind: "class" | "type"; name: string };
type StyleRule = { selectors: StyleSelector[]; declarations: Declaration[] };

export function parseSvgClassNames(value: string): string[] {
  const classes = value.split(/[\t\n\f\r ]+/).filter(Boolean);
  if (classes.length > SVG_CLASS_STYLE_LIMITS.classesPerElement || classes.some(name => !CLASS_NAME.test(name))) {
    throw new Error("SVG needs up to 16 simple class names per element.");
  }
  return classes;
}

export function createSvgClassStyles(
  normalizeFontStyles: (css: string) => string,
  validateDeclaration: (name: string, value: string, node?: Element) => void,
  diagnostics: SvgDiagnostics,
  elementNames: ReadonlySet<string>
): { normalize: (css: string) => string; apply: (nodes: Element[]) => void } {
  const rules: StyleRule[] = [];
  let declarationCount = 0;
  let hasTypeSelectors = false;
  return {
    normalize(css) {
      css = removeComments(css);
      // The parser recovers some CSS at EOF. Keep the bounded flat-rule grammar
      // explicit, so incomplete/nested rules cannot become valid by recovery.
      const pattern = /\s*([^{}]+)\{([^{}]*)\}/gy;
      let index = 0;
      while (css.slice(index).trim()) {
        pattern.lastIndex = index;
        const rule = pattern.exec(css);
        if (!rule) throw new SvgPolicyError("structure", "Malformed SVG stylesheet.");
        index = pattern.lastIndex;
      }
      const ast = parse(css, { positions: true,
        onParseError() { throw new SvgPolicyError("structure", "Malformed SVG stylesheet."); }
      });
      // Inspect the entire original CSS before any omission, including unused
      // rules and overridden values. Syntax validity alone is not a safety rule.
      walk(ast, part => {
        if (part.type === "Raw") throw new SvgPolicyError("structure", "Unparsed SVG CSS is unsupported.");
        if (part.type === "Url" && !/^#[A-Za-z_][\w.-]{0,63}$/.test(part.value) && !/^data:font\/woff2;base64,[A-Za-z0-9+/=]+$/i.test(part.value)) {
          throw new SvgPolicyError("security", "SVG external resources are unsupported.");
        }
        if ((part.type === "Function" && /^expression$/i.test(part.name)) || (part.type === "Atrule" && /^import$/i.test(part.name))) {
          throw new SvgPolicyError("security", "Executable or imported SVG CSS is unsupported.");
        }
      });
      if (ast.type !== "StyleSheet") throw new SvgPolicyError("structure", "Malformed SVG stylesheet.");
      let fonts = "";
      for (const rule of ast.children) {
        if (rule.type === "Atrule" && /^font-face$/i.test(rule.name)) {
          fonts += normalizeFontStyles(css.slice(rule.loc!.start.offset, rule.loc!.end.offset));
          continue;
        }
        if (rule.type !== "Rule" || rule.prelude?.type !== "SelectorList") {
          throw new Error("SVG stylesheets support only simple SVG element or .class selectors and comma groups.");
        }
        const selectors: StyleSelector[] = [];
        for (const selector of rule.prelude.children) {
          if (selector.type !== "Selector") throw new Error("Unsupported SVG style selector.");
          const parts = [...selector.children];
          if (parts.length === 1 && parts[0].type === "ClassSelector" && CLASS_NAME.test(parts[0].name)) {
            selectors.push({ kind: "class", name: parts[0].name });
          } else if (parts.length === 1 && parts[0].type === "TypeSelector" && elementNames.has(parts[0].name)) {
            // Use the renderer's exact, case-sensitive SVG element allowlist.
            // Universal/namespace selectors and unsupported tags do not match.
            selectors.push({ kind: "type", name: parts[0].name });
            hasTypeSelectors = true;
          } else {
            throw new Error("SVG stylesheets support only simple SVG element or .class selectors and comma groups.");
          }
        }
        if (selectors.length > SVG_CLASS_STYLE_LIMITS.selectorsPerRule) throw new SvgPolicyError("limits", "SVG exceeds 16 selectors per style rule.");
        if (rules.length >= SVG_CLASS_STYLE_LIMITS.rules) throw new SvgPolicyError("limits", "SVG exceeds 256 style rules.");
        const declarations: Declaration[] = [];
        for (const declaration of rule.block.children) {
          if (declaration.type !== "Declaration" || declaration.important) throw new Error("Unsupported SVG style declaration.");
          const name = declaration.property.toLowerCase();
          const value = css.slice(declaration.value.loc!.start.offset, declaration.value.loc!.end.offset).trim();
          if (!/^[a-z-]+$/.test(name) || !value || value.includes("!")) throw new Error("Unsupported SVG style declaration.");
          const expanded: Declaration[] = name === "font" ? parseSvgFontShorthand(value) : [[name, value]];
          // Count all original declarations, including omitted hints and four
          // expanded font longhands, before accepting any reduced preview.
          declarationCount += expanded.length;
          if (declarationCount > SVG_CLASS_STYLE_LIMITS.declarations) throw new SvgPolicyError("limits", "SVG exceeds 1,024 style declarations.");
          if (diagnostics.omitDisplayHint(name, value, "stylesheet")) continue;
          for (const [property, content] of expanded) {
            if (!PROPERTIES.has(property)) throw new Error(`Unsupported SVG style property: ${property}.`);
            // Validate even unused or later overridden declarations.
            validateDeclaration(property, content);
            declarations.push([property, content]);
          }
        }
        rules.push({ selectors, declarations });
      }
      return fonts;
    },
    apply(nodes) {
      for (const node of nodes) {
        const classValue = node.getAttribute("class");
        // Keep attribute-only and class-only diagrams on their existing path.
        if (classValue === null && !hasTypeSelectors) continue;
        const classes = new Set(parseSvgClassNames(classValue ?? ""));
        const winners = new Map<string, { value: string; specificity: number }>();
        // A class outranks a type selector; ties follow stylesheet order. A
        // comma group takes the highest specificity of its matching selectors.
        // Both outrank presentation attributes, independent of class-list order.
        for (const rule of rules) {
          let specificity = 0;
          for (const selector of rule.selectors) {
            if (selector.kind === "class" ? classes.has(selector.name) : node.localName === selector.name) {
              specificity = Math.max(specificity, selector.kind === "class" ? 2 : 1);
            }
          }
          if (specificity) {
            for (const [name, value] of rule.declarations) {
              if (specificity >= (winners.get(name)?.specificity ?? 0)) winners.set(name, { value, specificity });
            }
          }
        }
        for (const [name, { value }] of winners) {
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
  let lastSyntax = "";
  for (let index = 0; index < css.length; index++) {
    const char = css[index];
    if (char === "\\") throw new Error("SVG CSS escapes are unsupported.");
    if (quote) {
      clean += char;
      if (char === quote) { quote = ""; lastSyntax = char; }
    } else if (char === '"' || char === "'") {
      quote = char;
      clean += char;
      lastSyntax = char;
    } else if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      if (end < 0) throw new Error("Unclosed SVG CSS comment.");
      clean += " ";
      index = end + 1;
    } else {
      // Empty declaration separators were accepted by the previous bounded
      // parser. Remove only these lexical no-ops before AST parsing, where
      // css-tree otherwise recovers them as Raw. Strings stay literal.
      if (char === ";" && (lastSyntax === "{" || lastSyntax === ";")) continue;
      clean += char;
      if (!/\s/.test(char)) lastSyntax = char;
    }
  }
  if (quote) throw new Error("Unclosed SVG CSS string.");
  return clean;
}
