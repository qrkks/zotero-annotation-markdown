import createDOMPurify from "dompurify";
import MarkdownIt from "markdown-it";

const DEFAULT_MARKDOWN_OPTIONS = {
  html: false,
  breaks: true,
  linkify: false,
  typographer: false
};

export function createMarkdownRenderer({
  markdown = new MarkdownIt(DEFAULT_MARKDOWN_OPTIONS),
  windowRef = globalThis.window
} = {}) {
  const purifier = windowRef?.document ? createDOMPurify(windowRef) : null;

  return {
    render(source) {
      const text = String(source ?? "");

      try {
        const html = markdown.render(text);
        return purifier ? purifier.sanitize(html) : html;
      } catch {
        return escapePlainText(text);
      }
    }
  };
}

function escapePlainText(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\n", "<br>");
}

