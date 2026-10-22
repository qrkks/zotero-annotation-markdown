import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const output = new URL('../dist/', import.meta.url);
const origin = 'https://qrkks.github.io';
const base = '/zotero-annotation-markdown/';
const variants = [
  { file: 'index.html', language: 'en', path: base, sourceHeading: '# Reading notes', feature: 'Write it your way.' },
  { file: 'zh-CN/index.html', language: 'zh-CN', path: `${base}zh-CN/`, sourceHeading: '# 阅读笔记', feature: '按你的方式书写。' },
];

for (const variant of variants) {
  const html = await readFile(new URL(variant.file, output), 'utf8');
  // No scripts execute: this checks what crawlers and no-JavaScript readers receive.
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(document.documentElement.lang, variant.language);
  assert.match(document.title, /Zotero Annotation Markdown.*LaTeX/);
  assert.match(document.querySelector('meta[name=description]').content, /Zotero/);
  assert.ok(document.head.querySelector('meta[name=google-site-verification]')?.content, 'Search Console verification tag must remain published');
  assert.equal(document.querySelectorAll('link[rel=canonical]').length, 1);
  assert.equal(document.querySelector('link[rel=canonical]').href, origin + variant.path);
  assert.equal(document.querySelector('meta[property="og:url"]').content, origin + variant.path);
  assert.equal(document.querySelectorAll('link[hreflang]').length, 3);
  for (const target of variants) {
    assert.equal(document.querySelector(`link[hreflang="${target.language}"]`).href, origin + target.path);
  }
  assert.equal(document.querySelector('link[hreflang=x-default]').href, origin + base);
  assert.equal(document.querySelector('#language-toggle').tagName, 'A');
  assert.equal(document.querySelector('#language-toggle').getAttribute('href'), variants.find(target => target !== variant).path);
  assert.ok(document.querySelector('#source-code').textContent.startsWith(variant.sourceHeading));
  assert.equal(document.querySelector('#preview-content h1').textContent, variant.sourceHeading.slice(2));
  assert.equal(document.querySelector('.detail-item h3').textContent, variant.feature);
  assert.ok(document.querySelectorAll('noscript p').length);
  assert.ok(document.querySelectorAll('.docs-link').length);
  for (const link of document.querySelectorAll('.docs-link')) assert.ok(link.href.includes(`/docs/${variant.language}/`));
  assert.equal(document.querySelector('[data-i18n=licenses]').getAttribute('href'), `${base}THIRD-PARTY-NOTICES.txt`);
  assert.ok(!document.querySelector('meta[name=robots]')?.content.includes('noindex'));
  for (const resource of document.querySelectorAll('script[src], link[rel=stylesheet], link[rel=icon], .brand img')) {
    const url = resource.getAttribute('src') || resource.getAttribute('href');
    assert.ok(url.startsWith(base), `Asset loses the Pages prefix: ${url}`);
    await access(new URL(url.slice(base.length), output));
  }
  assert.equal(document.querySelector('meta[property="og:image"]').content, `${origin}${base}social-preview.png`);
  assert.equal(document.querySelector('meta[name="twitter:card"]').content, 'summary_large_image');
  const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(schema['@type'], 'SoftwareApplication');
  assert.equal(schema.url, origin + variant.path);
  assert.equal(schema.inLanguage, variant.language);
  assert.equal(schema.isAccessibleForFree, true);
  assert.ok(!schema.aggregateRating && !schema.review);
  dom.window.close();
}

const sitemap = new JSDOM(await readFile(new URL('sitemap.xml', output), 'utf8'), { contentType: 'application/xml' });
assert.deepEqual([...sitemap.window.document.querySelectorAll('loc')].map(node => node.textContent), variants.map(variant => origin + variant.path));
sitemap.window.close();
const png = await readFile(new URL('social-preview.png', output));
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 1200);
assert.equal(png.readUInt32BE(20), 630);
console.log('Website checks passed: static English/Chinese, canonical and language links, assets, sitemap, schema, and 1200×630 social image.');
