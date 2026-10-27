import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const output = new URL('../dist/', import.meta.url);
const origin = 'https://qrkks.github.io';
const base = '/zotero-annotation-markdown/';
const variants = [
  { file: 'index.html', language: 'en', path: base, sourceHeading: '# Reading notes', feature: 'Write it your way.' },
  { file: 'zh-CN/index.html', language: 'zh-CN', path: `${base}zh-CN/`, sourceHeading: '# 阅读笔记', feature: '按你的方式书写。' },
  { file: 'support/index.html', language: 'en', path: `${base}support/`, support: true },
  { file: 'zh-CN/support/index.html', language: 'zh-CN', path: `${base}zh-CN/support/`, support: true },
];

for (const variant of variants) {
  const html = await readFile(new URL(variant.file, output), 'utf8');
  // No scripts execute: this checks what crawlers and no-JavaScript readers receive.
  const dom = new JSDOM(html);
  const document = dom.window.document;
  assert.equal(document.documentElement.lang, variant.language);
  assert.match(document.title, variant.support ? /Zotero Annotation Markdown/ : /Zotero Annotation Markdown.*LaTeX/);
  assert.match(document.querySelector('meta[name=description]').content, /Zotero/);
  assert.ok(document.head.querySelector('meta[name=google-site-verification]')?.content, 'Search Console verification tag must remain published');
  assert.equal(document.querySelectorAll('link[rel=canonical]').length, 1);
  assert.equal(document.querySelector('link[rel=canonical]').href, origin + variant.path);
  assert.equal(document.querySelector('meta[property="og:url"]').content, origin + variant.path);
  assert.equal(document.querySelectorAll('link[hreflang]').length, 3);
  const translations = variants.filter(target => Boolean(target.support) === Boolean(variant.support));
  for (const target of translations) {
    assert.equal(document.querySelector(`link[hreflang="${target.language}"]`).href, origin + target.path);
  }
  assert.equal(document.querySelector('link[hreflang=x-default]').href, origin + translations[0].path);
  assert.equal(document.querySelector('#language-toggle').tagName, 'A');
  assert.equal(document.querySelector('#language-toggle').getAttribute('href'), translations.find(target => target !== variant).path);
  if (variant.support) {
    const image = document.querySelector('.alipay-code');
    assert.equal(image.getAttribute('src'), `${base}alipay-support.jpg`);
    assert.ok(image.alt && image.width > 0 && image.height > 0);
    const download = document.querySelector('a[download]');
    assert.equal(download.getAttribute('href'), image.getAttribute('src'));
    assert.ok(document.querySelector('.support-voluntary').textContent);
    assert.ok(document.querySelector('.support-phone-note').textContent);
    assert.equal(document.querySelector('.brand').getAttribute('href'), variant.language === 'en' ? base : `${base}zh-CN/`);
    assert.equal(document.querySelector('#preview-content'), null);
  } else {
    assert.ok(document.querySelector('#source-code').textContent.startsWith(variant.sourceHeading));
    assert.equal(document.querySelector('#preview-content h1').textContent, variant.sourceHeading.slice(2));
    assert.equal(document.querySelector('.detail-item h3').textContent, variant.feature);
    assert.ok(document.querySelectorAll('noscript p').length);
    for (const link of document.querySelectorAll('.support-link')) {
      assert.equal(link.getAttribute('href'), `${variant.path}support/`);
    }
  }
  assert.ok(document.querySelectorAll('.docs-link').length);
  for (const link of document.querySelectorAll('.docs-link')) assert.ok(link.href.includes(`/docs/${variant.language}/`));
  assert.equal(document.querySelector('[data-i18n=licenses]').getAttribute('href'), `${base}THIRD-PARTY-NOTICES.txt`);
  assert.ok(!document.querySelector('meta[name=robots]')?.content.includes('noindex'));
  for (const resource of document.querySelectorAll('script[src], link[rel=stylesheet], link[rel=icon], .brand img, .alipay-code, a[download]')) {
    const url = resource.getAttribute('src') || resource.getAttribute('href');
    assert.ok(url.startsWith(base), `Asset loses the Pages prefix: ${url}`);
    await access(new URL(url.slice(base.length), output));
  }
  assert.equal(document.querySelector('meta[property="og:image"]').content, `${origin}${base}social-preview.png`);
  assert.equal(document.querySelector('meta[name="twitter:card"]').content, 'summary_large_image');
  const schema = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
  assert.equal(schema['@type'], variant.support ? 'WebPage' : 'SoftwareApplication');
  assert.equal(schema.url, origin + variant.path);
  assert.equal(schema.inLanguage, variant.language);
  if (!variant.support) assert.equal(schema.isAccessibleForFree, true);
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
console.log('Website checks passed: static English/Chinese home and support pages, payment image/download, canonical and language links, assets, sitemap, schema, and 1200×630 social image.');
