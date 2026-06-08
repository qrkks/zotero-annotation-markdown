export async function inlineKatexWoff2Fonts(css, readFont) {
  const fontUrlPattern = /url\(fonts\/([^()]+?\.woff2)\)/g;
  const replacements = new Map();

  for (const match of css.matchAll(fontUrlPattern)) {
    const filename = match[1];
    if (!replacements.has(filename)) {
      const bytes = await readFont(filename);
      replacements.set(filename, Buffer.from(bytes).toString("base64"));
    }
  }

  return css.replace(fontUrlPattern, (_match, filename) => (
    `url(data:font/woff2;base64,${replacements.get(filename)})`
  ));
}
