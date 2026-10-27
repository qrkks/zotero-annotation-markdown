import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { copy, markdownSamples, pageMetadata, readingNotes, site, supportMetadata } from '../src/content.js';
import { initSiteLanguage } from '../src/language-preference.js';

const languages = ['en', 'zh-CN'];
const pageUrl = (language, support = false) => site.origin + (support ? site.supportPaths : site.paths)[language];

function renderPage(html, language) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const isSupport = Boolean(document.querySelector('.support-page'));
  const metadata = (isSupport ? supportMetadata : pageMetadata)[language];
  const url = language => pageUrl(language, isSupport);
  const nextLanguage = language === 'en' ? 'zh-CN' : 'en';
  document.documentElement.lang = language;
  document.title = metadata.title;
  document.querySelector('#language-preference')?.remove();
  const languageScript = document.createElement('script');
  languageScript.id = 'language-preference';
  languageScript.textContent = `(${initSiteLanguage.toString()})(${JSON.stringify({
    paths: isSupport ? site.supportPaths : site.paths,
    base: site.base,
    storageKey: 'annotation-markdown-language',
  })});`;
  document.querySelector('meta[charset]').after(languageScript);
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const text = copy[language][element.dataset.i18n];
    if (typeof text !== 'string') throw new Error(`Missing ${language} translation: ${element.dataset.i18n}`);
    element.textContent = text;
  }
  for (const link of document.querySelectorAll('.docs-link')) {
    link.href = `https://github.com/qrkks/zotero-annotation-markdown/blob/main/docs/${language}/user-guide.md`;
  }
  const brand = document.querySelector('.brand');
  brand.href = site.paths[language];
  brand.setAttribute('aria-label', metadata.home);
  document.querySelector('nav').setAttribute('aria-label', metadata.navigation);
  document.querySelector('.demo-tabs')?.setAttribute('aria-label', metadata.examples);
  for (const link of document.querySelectorAll('.support-link')) link.href = site.supportPaths[language];
  for (const link of document.querySelectorAll('.home-link')) link.href = site.paths[language];
  const languageLink = document.querySelector('#language-toggle');
  languageLink.href = (isSupport ? site.supportPaths : site.paths)[nextLanguage];
  languageLink.lang = nextLanguage;
  languageLink.hreflang = nextLanguage;
  languageLink.textContent = language === 'en' ? '中文' : 'EN';
  languageLink.setAttribute('aria-label', metadata.switchLanguage);
  document.querySelector('[data-i18n=licenses]').href = `${site.base}THIRD-PARTY-NOTICES.txt`;
  document.querySelector('#year').textContent = String(new Date().getFullYear());
  if (isSupport) {
    const image = document.querySelector('.alipay-code');
    image.alt = copy[language].alipayAlt;
    image.src = `${site.base}alipay-support.jpg`;
    document.querySelector('a[download]').href = image.src;
  } else {
    const copyButton = document.querySelector('#copy-source');
    copyButton.textContent = copy[language].copy;
    copyButton.setAttribute('aria-label', copy[language].copySource);
    document.querySelector('noscript').innerHTML = '';
    const noScriptNote = document.createElement('p');
    noScriptNote.className = 'noscript-note';
    noScriptNote.textContent = metadata.noscript;
    document.querySelector('noscript').append(noScriptNote);

    // The first example is readable in both languages before JavaScript runs.
    document.querySelector('#source-code').textContent = markdownSamples[language];
    const note = readingNotes[language];
    const preview = document.querySelector('#preview-content');
    const element = (tag, text) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const list = element('ul');
    const firstItem = element('li');
    firstItem.append(element('strong', note.strong), note.detail);
    const secondItem = element('li');
    const highlight = element('mark', note.highlight);
    highlight.className = 'annotation-markdown-mark-blue';
    secondItem.append(highlight);
    list.append(firstItem, secondItem);
    const quote = element('blockquote');
    quote.append(element('p', note.quote));
    preview.replaceChildren(element('h1', note.title), element('h2', note.section), list, quote);
  }

  function meta(attribute, key, value) {
    let node = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!node) {
      node = document.createElement('meta');
      node.setAttribute(attribute, key);
      document.head.append(node);
    }
    node.content = value;
  }
  meta('name', 'description', metadata.description);
  meta('property', 'og:title', metadata.title);
  meta('property', 'og:description', metadata.description);
  meta('property', 'og:type', 'website');
  meta('property', 'og:site_name', 'Zotero Annotation Markdown');
  meta('property', 'og:url', url(language));
  meta('property', 'og:locale', metadata.locale);
  meta('property', 'og:locale:alternate', pageMetadata[nextLanguage].locale);
  meta('property', 'og:image', site.image);
  meta('property', 'og:image:type', 'image/png');
  meta('property', 'og:image:width', '1200');
  meta('property', 'og:image:height', '630');
  meta('property', 'og:image:alt', metadata.imageAlt);
  meta('name', 'twitter:card', 'summary_large_image');
  meta('name', 'twitter:title', metadata.title);
  meta('name', 'twitter:description', metadata.description);
  meta('name', 'twitter:image', site.image);
  meta('name', 'twitter:image:alt', metadata.imageAlt);
  document.querySelector('link[rel=canonical]').href = url(language);
  for (const node of document.querySelectorAll('link[rel=alternate][hreflang]')) node.remove();
  for (const variant of [...languages, 'x-default']) {
    const link = document.createElement('link');
    link.rel = 'alternate';
    link.hreflang = variant;
    link.href = url(variant === 'x-default' ? 'en' : variant);
    document.head.append(link);
  }
  const oldSchema = document.querySelector('script[type="application/ld+json"]');
  oldSchema?.remove();
  const schema = document.createElement('script');
  schema.id = isSupport ? 'support-schema' : 'software-schema';
  schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify(isSupport ? {
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: metadata.title, url: url(language), description: metadata.description, inLanguage: language,
    isPartOf: { '@type': 'WebSite', name: 'Zotero Annotation Markdown', url: pageUrl(language) },
  } : {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication',
    name: 'Zotero Annotation Markdown', url: pageUrl(language),
    description: metadata.description, inLanguage: language,
    applicationCategory: 'EducationalApplication', softwareRequirements: 'Zotero',
    isAccessibleForFree: true, image: site.image,
    downloadUrl: 'https://github.com/qrkks/zotero-annotation-markdown/releases/latest',
    license: 'https://github.com/qrkks/zotero-annotation-markdown/blob/main/LICENSE',
    author: { '@type': 'Person', name: 'qrkks', url: 'https://github.com/qrkks' },
  }).replaceAll('<', '\\u003c');
  document.head.append(schema);
  const result = dom.serialize();
  dom.window.close();
  return result;
}

export function localizedPages() {
  return {
    name: 'localized-pages',
    transformIndexHtml: {
      order: 'post',
      handler: (html, context) => renderPage(html, context.path.includes('/zh-CN/') ? 'zh-CN' : 'en'),
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') throw new Error('Website HTML was not generated');
        const support = bundle['support.html'];
        if (!support || support.type !== 'asset') throw new Error('Support HTML was not generated');
        this.emitFile({ type: 'asset', fileName: 'zh-CN/index.html', source: renderPage(String(index.source), 'zh-CN') });
        for (const language of languages) {
          this.emitFile({ type: 'asset', fileName: `${language === 'en' ? '' : 'zh-CN/'}support/index.html`, source: renderPage(String(support.source), language) });
        }
        delete bundle['support.html'];
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source:
          '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          [false, true].flatMap(support => languages.map(language => `  <url><loc>${pageUrl(language, support)}</loc></url>`)).join('\n') + '\n</urlset>\n',
        });
      },
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const routes = [`${site.base}zh-CN/`, ...Object.values(site.supportPaths)];
        if (routes.some(route => pathname === route.slice(0, -1))) {
          response.writeHead(302, { Location: pathname + '/' });
          response.end();
          return;
        }
        if (!routes.some(route => pathname === route || pathname === route + 'index.html')) return next();
        try {
          const template = await readFile(new URL(pathname.includes('/support/') ? '../support.html' : '../index.html', import.meta.url), 'utf8');
          const html = await server.transformIndexHtml(request.url, template);
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(html);
        } catch (error) { next(error); }
      });
    },
  };
}
