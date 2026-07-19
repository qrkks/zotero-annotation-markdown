import createDOMPurify from "dompurify";
import MarkdownIt from "markdown-it";
import markdownItTexmath from "markdown-it-texmath";

const DEFAULT_MARKDOWN_OPTIONS = {
  html: false,
  breaks: true,
  linkify: true,
  typographer: false
};

export function createMarkdownRenderer({
  markdown,
  mathMarkdown,
  mathPlugin = markdownItTexmath,
  mathPluginOptions = { delimiters: ["dollars", "brackets"] },
  isMathEnabled = () => true,
  windowRef = globalThis.window
} = {}) {
  const plainMarkdown = markdown ?? new MarkdownIt(DEFAULT_MARKDOWN_OPTIONS);
  const mathCapableMarkdown = mathMarkdown ?? (markdown ? plainMarkdown : new MarkdownIt(DEFAULT_MARKDOWN_OPTIONS));
  const purifier = windowRef?.document ? createDOMPurify(windowRef) : null;
  let mathPluginLoaded = false;

  return {
    render(source) {
      const text = normalizeMathDelimiters(String(source ?? ""));

      try {
        const html = getMarkdownForSource(text).render(text);
        return purifier ? purifier.sanitize(html) : html;
      } catch {
        return escapePlainText(text);
      }
    }
  };

  function getMarkdownForSource(text) {
    if (!mathPlugin || !isMathEnabled() || !hasMathSyntax(text)) {
      return plainMarkdown;
    }

    if (!mathPluginLoaded) {
      if (mathPluginOptions === undefined) {
        mathCapableMarkdown.use(mathPlugin);
      } else {
        mathCapableMarkdown.use(mathPlugin, mathPluginOptions);
      }
      mathPluginLoaded = true;
    }

    return mathCapableMarkdown;
  }
}

function hasMathSyntax(text) {
  return /(?:^|[^\\])\$\$[\s\S]+?\$\$/.test(text) ||
    /(?:^|[^\\])\$[^$\n]+?\$/.test(text) ||
    /\\\([\s\S]+?\\\)/.test(text) ||
    /\\\[[\s\S]+?\\\]/.test(text);
}

function normalizeMathDelimiters(text) {
  const normalizedLineEndings = text
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");

  const normalizedWhitespace = normalizedLineEndings
    .replace(/[\u00a0\u202f]/g, " ");

  const normalizedDelimiters = normalizedWhitespace
    .replace(/(^|\n)([ \t]*)\\\\\[[ \t]*(?=\n|$)/g, "$1$2\\[")
    .replace(/(^|\n)([ \t]*)\\\\\][ \t]*(?=\n|$)/g, "$1$2\\]");

  return isolateBracketDisplayMath(normalizedDelimiters);
}

function isolateBracketDisplayMath(text) {
  const lines = text.split("\n");
  const output = [];

  lines.forEach((line, index) => {
    if (isBracketMathOpeningLine(line) && output.length > 0 && output[output.length - 1].trim() !== "") {
      output.push("");
    }

    output.push(line);

    const nextLine = lines[index + 1];
    if (isBracketMathClosingLine(line) && nextLine !== undefined && nextLine.trim() !== "") {
      output.push("");
    }
  });

  return output.join("\n");
}

function isBracketMathOpeningLine(line) {
  return /^[ \t]*\\\[[ \t]*$/.test(line);
}

function isBracketMathClosingLine(line) {
  return /^[ \t]*\\\][ \t]*$/.test(line);
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
