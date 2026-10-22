import { defineConfig } from 'vite';
import { build } from 'esbuild';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = path.dirname(siteRoot);

// Use the add-on's esbuild pipeline for its renderer. Passing KaTeX through
// Rolldown's string optimizer corrupts surrogate ranges in its TeX lexer.
function annotationRenderer() {
  let code;
  let notices;
  let rendererInputs;
  return {
    name: 'annotation-renderer',
    async buildStart() {
      const result = await build({
        absWorkingDir: projectRoot,
        entryPoints: ['site/src/renderer.js'],
        bundle: true, format: 'esm', platform: 'browser', target: ['firefox102'],
        minify: true, write: false, metafile: true,
      });
      code = result.outputFiles[0].text;
      rendererInputs = Object.keys(result.metafile.inputs);
      notices = await thirdPartyNotices(rendererInputs);
      if (this.meta.watchMode) {
        for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(path.resolve(projectRoot, input));
      }
    },
    resolveId(id) { if (id === 'virtual:renderer-url') return '\0virtual:renderer-url'; },
    load(id) {
      if (id !== '\0virtual:renderer-url') return;
      if (this.meta.watchMode) return 'export default import.meta.env.BASE_URL + "annotation-renderer.js";';
      const reference = this.emitFile({ type: 'asset', name: 'annotation-renderer.js', source: code });
      return `export default import.meta.ROLLUP_FILE_URL_${reference};`;
    },
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt',
        source: await thirdPartyNotices([...rendererInputs, ...this.getModuleIds()]) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0].endsWith('/annotation-renderer.js')) {
          response.setHeader('Content-Type', 'text/javascript'); response.end(code);
        } else if (request.url?.split('?')[0].endsWith('/THIRD-PARTY-NOTICES.txt')) {
          response.setHeader('Content-Type', 'text/plain; charset=utf-8'); response.end(notices);
        } else next();
      });
    },
  };
}

async function thirdPartyNotices(inputs) {
  const directories = new Set();
  for (const originalInput of [...inputs, 'site/node_modules/motion/package.json',
    'site/node_modules/@fontsource-variable/bricolage-grotesque/package.json',
    'site/node_modules/@fontsource-variable/dm-sans/package.json']) {
    const input = originalInput.split('?')[0];
    if (input.startsWith('\0') || !input.replaceAll('\\', '/').includes('node_modules/')) continue;
    let directory = path.dirname(path.resolve(projectRoot, input));
    while (directory !== path.dirname(directory)) {
      try {
        const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (metadata.name && metadata.version) { directories.add(await realpath(directory)); break; }
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      directory = path.dirname(directory);
    }
  }
  const parts = ['Third-party components in the Annotation Markdown website',
    'Project source: https://github.com/qrkks/zotero-annotation-markdown/tree/main/site', ''];
  for (const directory of [...directories].sort()) {
    const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
    parts.push(`=== ${metadata.name}@${metadata.version} ===`, `License: ${metadata.license}`, '');
    const licenses = (await readdir(directory)).filter(name => /^(?:licen[sc]e|copying|notice)(?:[.-]|$)/i.test(name));
    if (!licenses.length) throw new Error(`Missing license notice for ${metadata.name}`);
    for (const filename of licenses) parts.push(await readFile(path.join(directory, filename), 'utf8'), '');
  }
  return parts.join('\n');
}

export default defineConfig({
  base: '/zotero-annotation-markdown/',
  plugins: [annotationRenderer()],
  server: { fs: { allow: [projectRoot] } },
  build: { target: 'es2022' },
});
