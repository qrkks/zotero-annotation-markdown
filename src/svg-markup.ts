/** Repair copied tag whitespace without rewriting labels or quoted values. */
export function normalizeSvgMarkupWhitespace(source: string): string {
  const text = source.trim();
  let output = "";
  let inTag = false;
  let quote = "";
  for (let index = 0; index < text.length; index++) {
    if (!inTag && text[index] === "<") {
      const terminator = text.startsWith("<!--", index) ? "-->"
        : text.startsWith("<![CDATA[", index) ? "]]>"
        : text.startsWith("<?", index) ? "?>" : null;
      if (terminator) {
        const end = text.indexOf(terminator, index + 2);
        if (end === -1) return text; // XML parsing will report the malformed input.
        output += text.slice(index, end + terminator.length);
        index = end + terminator.length - 1;
        continue;
      }
      inTag = true;
    }
    const char = text[index];
    if (inTag) {
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        inTag = false;
      } else if (char === "\u00a0" || char === "\u202f") {
        output += " ";
        continue;
      }
    }
    output += char;
  }
  return output;
}
