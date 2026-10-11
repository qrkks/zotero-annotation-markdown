/** Recognize literal, top-level SVG blocks before Markdown and math normalization. */
import MarkdownIt from "markdown-it";
import markdownItTexmath from "markdown-it-texmath";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import type Token from "markdown-it/lib/token.mjs";
import { SVG_LIMITS } from "./svg-renderer.js";

interface SourceRange { start: number; end: number }
const VOID_HTML = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

export function createRawSvgBlockProtector(): (source: string) => string {
  let parser: MarkdownIt | null = null;
  let mathBlocksLoaded = false;
  return source => {
    if (!source.includes("<svg")) return source;
    const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    if (!parser) {
      // HTML is recognized only by this private block tokenizer, never rendered.
      // It keeps SVG examples inside comments and HTML wrappers out of the feature.
      parser = new MarkdownIt({ html: true });
      parser.block.ruler.before("html_block", "raw_svg_source", rawSvgBlock, { alt: ["paragraph", "reference"] });
    }
    if (!mathBlocksLoaded && /^[ \t]{0,3}(?:\$\$|\\{1,2}\[)/m.test(normalized)) {
      // Tokenize existing display-math containers without rendering their TeX.
      parser.use(markdownItTexmath, { delimiters: ["dollars", "brackets"] });
      mathBlocksLoaded = true;
    }
    const tokens: Token[] = [];
    // Match copied doubled bracket delimiters using a same-length shadow. Source
    // ranges still refer to the original labels, attributes and whitespace.
    const blockSource = normalized.replace(/^([ \t]*)\\(?=\\[\[\]][ \t]*$)/gm, "$1 ");
    parser.block.parse(blockSource, parser, {}, tokens);
    const containers: string[] = [], ranges: SourceRange[] = [];
    for (const token of tokens) {
      if (token.level !== 0) continue;
      if (token.type === "html_block") trackHtmlContainers(token.content, containers);
      else if (token.type === "raw_svg_source" && !containers.length) ranges.push(token.meta as SourceRange);
    }
    if (!ranges.length) return source;
    let output = "", position = 0;
    for (const { start, end } of ranges) {
      const svg = normalized.slice(start, end).replace(/\n$/, "");
      // Use a fence longer than any literal backtick run in labels or comments.
      const longest = Math.max(2, ...Array.from(svg.matchAll(/`{3,}/g), match => match[0].length));
      const marker = "`".repeat(longest + 1);
      output += normalized.slice(position, start) + `${marker}svg\n${svg}\n${marker}\n`;
      position = end;
    }
    // These temporary fences exist only in the rendering input. Stored comments
    // and editor values continue to come from Zotero's untouched original source.
    return output + normalized.slice(position);
  };
}

function rawSvgBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  // A complete diagram on its own lines can terminate a paragraph, like a
  // fenced code block. Nested list/quote content remains outside this feature.
  if ((state.parentType !== "root" && !(silent && state.parentType === "paragraph")) ||
      state.level !== 0 || state.sCount[startLine] >= 4) return false;
  const start = state.bMarks[startLine];
  let position = start + state.tShift[startLine];
  while (/[\u00a0\u202f]/.test(state.src[position] ?? "")) position++;
  if (state.sCount[startLine] + position - start - state.tShift[startLine] >= 4) return false;
  if (!/^(?:<svg(?=[\s/>])|<\?xml\b|<!--)/.test(state.src.slice(position, state.eMarks[startLine]))) return false;
  // Bound lexical lookahead too, including incomplete and oversized input. The
  // existing renderer still enforces the smaller 32,000-character image limit.
  const limit = Math.min(state.src.length, start + SVG_LIMITS.sourceChars * 2);
  let end = findSvgEnd(state.src.slice(position, limit), 0, limit - position);
  if (end === null) return false;
  end += position;
  for (;;) {
    const next = skipWhitespace(state.src, end, limit);
    if (/\n[^\S\n]*\n/.test(state.src.slice(end, next)) || !state.src.startsWith("<!--", next)) break;
    const relativeEnd = state.src.slice(next, limit).indexOf("-->", 4);
    if (relativeEnd < 0) return false;
    const commentEnd = next + relativeEnd;
    end = commentEnd + 3;
  }
  let line = startLine;
  while (line < endLine && state.eMarks[line] < end) line++;
  if (line >= endLine || state.src.slice(end, state.eMarks[line]).trim()) return false;
  const nextLine = line + 1;
  if (silent) return true;
  const token = state.push("raw_svg_source", "", 0);
  token.map = [startLine, nextLine];
  token.meta = { start, end: state.bMarks[nextLine] } satisfies SourceRange;
  state.line = nextLine;
  return true;
}

function skipWhitespace(source: string, start: number, limit: number): number {
  while (start < limit && /\s/.test(source[start])) start++;
  return start;
}

function specialEnd(source: string, start: number, limit: number): number | null {
  const marker = source.startsWith("<!--", start) ? "-->" : source.startsWith("<![CDATA[", start) ? "]]>" : source.startsWith("<?", start) ? "?>" : null;
  if (!marker) return null;
  const end = source.indexOf(marker, start + 2);
  return end < 0 || end + marker.length > limit ? limit : end + marker.length;
}

function tagEnd(source: string, start: number, limit: number): number | null {
  let quote = "", subset = 0;
  for (let index = start + 1; index < limit; index++) {
    const char = source[index];
    if (quote) { if (char === quote) quote = ""; }
    else if (char === '"' || char === "'") quote = char;
    else if (source[start + 1] === "!" && char === "[") subset++;
    else if (source[start + 1] === "!" && char === "]") subset--;
    else if (char === ">" && !subset) return index + 1;
  }
  return null;
}

/** Lexical boundaries only; XML validity and all SVG policy remain in svg-renderer. */
function findSvgEnd(source: string, start: number, limit: number): number | null {
  let position = skipWhitespace(source, start, limit);
  while (source.startsWith("<!--", position) || /^<\?xml\b/.test(source.slice(position, position + 6))) {
    const end = specialEnd(source, position, limit);
    if (end === null || end === limit) return null;
    position = skipWhitespace(source, end, limit);
  }
  if (!/^<svg(?=[\s/>])/.test(source.slice(position, position + 5))) return null;
  let depth = 0;
  while (position < limit) {
    const special = specialEnd(source, position, limit);
    if (special !== null) {
      if (special === limit) return null;
      position = special;
    } else {
      const end = tagEnd(source, position, limit);
      if (end === null) return null;
      const tag = source.slice(position, end);
      if (/^<svg(?=[\s/>])/.test(tag)) { depth++; if (/\/\s*>$/.test(tag)) depth--; }
      else if (/^<\/svg\s*>$/.test(tag)) depth--;
      if (depth === 0) return end;
      position = end;
    }
    position = source.indexOf("<", position);
    if (position < 0) return null;
  }
  return null;
}

function trackHtmlContainers(source: string, containers: string[]): void {
  // An incomplete SVG must not turn later independent diagrams into nested HTML.
  if (/^\s*<svg(?=[\s/>])/.test(source)) return;
  let position = source.indexOf("<");
  while (position >= 0 && position < source.length) {
    const special = specialEnd(source, position, source.length);
    if (special !== null) position = special;
    else {
      const end = tagEnd(source, position, source.length);
      if (end === null) return;
      const tag = source.slice(position, end), match = tag.match(/^<(\/?)([a-z][\w:-]*)(?=[\s/>])/i);
      if (match) {
        const name = match[2].toLowerCase();
        if (!match[1] && name === "svg") { position = findSvgEnd(source, position, source.length) ?? source.length; continue; }
        if (match[1]) {
          const index = containers.lastIndexOf(name);
          if (index >= 0) containers.length = index;
        } else if (!VOID_HTML.has(name) && !/\/\s*>$/.test(tag)) containers.push(name);
      }
      position = end;
    }
    position = source.indexOf("<", position);
  }
}
