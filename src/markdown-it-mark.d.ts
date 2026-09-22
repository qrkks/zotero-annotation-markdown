declare module "markdown-it-mark" {
  import type MarkdownIt from "markdown-it";

  export default function markdownItMark(markdown: MarkdownIt): void;
}
