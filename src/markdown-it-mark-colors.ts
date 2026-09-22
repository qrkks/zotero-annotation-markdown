/**
 * Adds a narrow color suffix to markdown-it-mark output.
 *
 * The source syntax follows the markdown-it-attrs convention, but accepts only
 * one known color immediately after a mark: `==text=={.red}`. Keeping the
 * parser local avoids exposing arbitrary classes or attributes in Reader DOM.
 */
import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

const MARK_COLORS = [
  "yellow",
  "red",
  "orange",
  "green",
  "blue",
  "purple",
  "gray"
] as const;

type MarkColor = (typeof MARK_COLORS)[number];

const MARK_COLOR_SUFFIX = new RegExp(
  `^\\{\\.(${MARK_COLORS.join("|")})\\}`
);

export default function markdownItMarkColors(markdown: MarkdownIt): void {
  markdown.core.ruler.after("inline", "annotation_markdown_mark_colors", (state) => {
    state.tokens.forEach((token) => {
      if (token.type === "inline" && token.children) {
        applyMarkColors(token.children);
      }
    });
  });
}

function applyMarkColors(tokens: Token[]): void {
  const openMarks: Token[] = [];

  tokens.forEach((token, index) => {
    if (token.type === "mark_open") {
      openMarks.push(token);
      return;
    }

    if (token.type !== "mark_close") {
      return;
    }

    const openMark = openMarks.pop();
    const suffix = tokens[index + 1];
    if (!openMark || suffix?.type !== "text") {
      return;
    }

    const match = suffix.content.match(MARK_COLOR_SUFFIX);
    if (!match) {
      return;
    }

    const color = match[1] as MarkColor;
    openMark.attrJoin("class", `annotation-markdown-mark-${color}`);
    suffix.content = suffix.content.slice(match[0].length);
  });
}
