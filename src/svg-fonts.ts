/** A small font-only CSS grammar for isolated SVG images. */
export const SVG_FONT_LIMITS = { faces: 4, fontBytes: 8192, totalBytes: 16384, declaredSfntBytes: 131072 } as const;
const FAMILY = /^[\p{L}\p{N}_ -]{1,64}$/u;
const DATA_URL = /^url\(\s*(?:"(data:font\/woff2;base64,[A-Za-z0-9+/=]+)"|'(data:font\/woff2;base64,[A-Za-z0-9+/=]+)'|(data:font\/woff2;base64,[A-Za-z0-9+/=]+))\s*\)(?:\s+format\(\s*(?:"woff2"|'woff2')\s*\))?$/i;

export function createSvgFontStyles(decodeBase64: (value: string) => string): (css: string) => string {
  let faces = 0;
  let totalBytes = 0;
  return css => {
    const rules = /\s*@font-face\s*\{([^{}]*)\}/giy;
    let index = 0;
    let clean = "";
    while (index < css.length && css.slice(index).trim()) {
      rules.lastIndex = index;
      const rule = rules.exec(css);
      if (!rule) throw new Error("SVG stylesheets may contain only restricted embedded WOFF2 fonts.");
      index = rules.lastIndex;
      const values = declarations(rule[1]);
      const familyValue = values.get("font-family");
      const quotedFamily = familyValue?.match(/^(['"])(.*)\1$/);
      const family = quotedFamily ? quotedFamily[2] : familyValue?.replace(/[\t\n\f\r ]+/g, " ");
      const src = values.get("src")?.match(DATA_URL);
      if (!family || !FAMILY.test(family) || !src) throw new Error("SVG fonts need a simple family and one embedded WOFF2 data URL.");
      const base64 = (src[1] ?? src[2] ?? src[3]).split(",")[1];
      if (++faces > SVG_FONT_LIMITS.faces) throw new Error("SVG exceeds 4 embedded font faces.");
      const bytes = validateWoff2(base64, decodeBase64);
      totalBytes += bytes;
      if (totalBytes > SVG_FONT_LIMITS.totalBytes) throw new Error("SVG embedded fonts exceed 16 KiB in total.");
      const weight = values.get("font-weight");
      const style = values.get("font-style");
      if (weight && !/^(?:normal|bold|[1-9]00)$/.test(weight)) throw new Error("Unsupported SVG font weight.");
      if (style && !/^(?:normal|italic|oblique)$/.test(style)) throw new Error("Unsupported SVG font style.");
      clean += `@font-face{font-family:"${family}";src:url("data:font/woff2;base64,${base64}") format("woff2");${weight ? `font-weight:${weight};` : ""}${style ? `font-style:${style};` : ""}`;
    }
    return clean;
  };
}

function declarations(body: string): Map<string, string> {
  if (body.includes("\\")) throw new Error("SVG font CSS escapes are unsupported.");
  const values = new Map<string, string>();
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
      if (++parentheses > 1) throw new Error("Unsupported SVG font source.");
    } else if (char === ")") {
      if (--parentheses < 0) throw new Error("Unsupported SVG font source.");
    }
    if ((char === ";" && !quote && !parentheses) || index === body.length) {
      if (quote || parentheses) throw new Error("Malformed SVG font declaration.");
      const declaration = body.slice(start, index).trim();
      start = index + 1;
      if (!declaration) continue;
      const match = declaration.match(/^([a-z-]+)\s*:\s*(.+)$/is);
      const name = match?.[1].toLowerCase();
      if (!name || !["font-family", "src", "font-weight", "font-style"].includes(name) || values.has(name)) {
        throw new Error("Unsupported or repeated SVG font descriptor.");
      }
      values.set(name, match![2].trim());
    }
  }
  return values;
}

function validateWoff2(base64: string, decodeBase64: (value: string) => string): number {
  if (base64.length > Math.ceil(SVG_FONT_LIMITS.fontBytes / 3) * 4) throw new Error("SVG embedded font exceeds 8 KiB.");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("Invalid SVG font base64.");
  const binary = decodeBase64(base64);
  if (binary.length > SVG_FONT_LIMITS.fontBytes) throw new Error("SVG embedded font exceeds 8 KiB.");
  if (binary.length < 48) throw new Error("Invalid SVG WOFF2 header.");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const header = new DataView(bytes.buffer);
  const tables = header.getUint16(12);
  const sfntBytes = header.getUint32(16);
  const compressedBytes = header.getUint32(20);
  // Basic bounds and single-font structure only; the browser validates font
  // table contents. WOFF2 header: https://www.w3.org/TR/WOFF2/#woff20Header
  if (header.getUint32(0) !== 0x774f4632 || ![0x00010000, 0x4f54544f].includes(header.getUint32(4)) ||
      header.getUint32(8) !== bytes.length || !tables || tables > 64 || header.getUint16(14) !== 0 ||
      sfntBytes < 12 + tables * 16 || sfntBytes > SVG_FONT_LIMITS.declaredSfntBytes ||
      !compressedBytes || compressedBytes > bytes.length - 48 ||
      [28, 32, 36, 40, 44].some(offset => header.getUint32(offset) !== 0)) {
    throw new Error("Unsupported or malformed SVG WOFF2 header.");
  }
  return bytes.length;
}
