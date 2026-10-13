/** Expand a bounded font shorthand without evaluating arbitrary CSS. */
const SIZE = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|pt|em|%)?$/i;
const FAMILY_NAME = /^(?:"[^"]+"|'[^']+'|(?:--|-?[_\p{L}])[-_\p{L}\p{N}]*(?:[ \t\n\f\r]+(?:--|-?[_\p{L}])[-_\p{L}\p{N}]*)*)$/u;
const RESERVED_FAMILY = /^(?:inherit|initial|unset|revert|revert-layer|default)$/i;

export function parseSvgFontShorthand(value: string): Array<[name: string, value: string]> {
  const tokens = /[^\t\n\f\r ]+/g;
  let style = "normal", weight = "normal";
  let styleSeen = false, weightSeen = false, prefixes = 0;
  for (let token = tokens.exec(value); token; token = tokens.exec(value)) {
    const word = token[0].toLowerCase();
    const size = word.match(SIZE);
    if (size && (size[2] || Number(size[1]) === 0) && Number(size[1]) >= 0) {
      const family = parseFamilyList(value.slice(tokens.lastIndex).trim());
      // An omitted style/weight resets earlier declarations and inherited values.
      // All four longhands are validated by the caller, including numeric bounds.
      return [["font-style", style], ["font-weight", weight], ["font-size", word], ["font-family", family]];
    }
    if (++prefixes > 2) throw new Error("Unsupported SVG font shorthand.");
    if (word === "normal") continue;
    if (/^(?:italic|oblique)$/.test(word) && !styleSeen) {
      style = word;
      styleSeen = true;
    } else if (/^(?:bold|bolder|lighter|[1-9]00)$/.test(word) && !weightSeen) {
      weight = word;
      weightSeen = true;
    } else {
      throw new Error("Unsupported SVG font shorthand.");
    }
  }
  throw new Error("SVG font shorthand needs a numeric size and font family.");
}

function parseFamilyList(value: string): string {
  const families: string[] = [];
  let family = "", quote = "";
  for (let index = 0; index <= value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === undefined) throw new Error("Unclosed SVG font family.");
      family += char;
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      family += char;
      quote = char;
    } else if (char === "," || char === undefined) {
      const name = family.trim();
      if (!FAMILY_NAME.test(name) || RESERVED_FAMILY.test(name)) throw new Error("Unsupported SVG font family list.");
      families.push(name);
      family = "";
    } else {
      // CSS whitespace separates unquoted identifiers; quoted names stay literal.
      family += /[\t\n\f\r]/.test(char) ? " " : char;
    }
  }
  return families.join(", ");
}
