import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { site } from '../src/content.js';
import { initSiteLanguage } from '../src/language-preference.js';

const storageKey = 'annotation-markdown-language';
function visit({ path = site.paths.en, languages = ['en-US'], saved, blocked = false, referrer, support = false } = {}) {
  const dom = new JSDOM('<a id="language-toggle"><span>Switch language</span></a>', { url: site.origin + path, ...(referrer ? { referrer: site.origin + referrer } : {}) });
  const values = new Map(saved ? [[storageKey, saved]] : []);
  const redirects = [];
  const location = new URL(site.origin + path);
  const view = {
    document: dom.window.document,
    navigator: { languages, language: languages[0] },
    localStorage: {
      getItem(key) { if (blocked) throw new Error('Storage blocked'); return values.get(key) ?? null; },
      setItem(key, value) { if (blocked) throw new Error('Storage blocked'); values.set(key, value); },
    },
    location: { get href() { return location.href; }, get search() { return location.search; }, get hash() { return location.hash; }, replace(url) { redirects.push(url); } },
    history: { state: null, replaceState(_state, _title, url) { location.href = url; } },
  };
  const config = { paths: support ? site.supportPaths : site.paths, base: site.base, storageKey };
  initSiteLanguage(config, view);
  return { dom, values, redirects, location, click(language) {
    const link = view.document.querySelector('#language-toggle');
    link.href = config.paths[language];
    link.hreflang = language;
    link.addEventListener('click', event => event.preventDefault());
    link.querySelector('span').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    return new URL(link.href);
  } };
}

for (const [name, options, expected] of [
  ['Chinese browser', { languages: ['zh-CN', 'en-US'] }, site.paths['zh-CN']],
  ['English browser with Chinese fallback', { languages: ['en-GB', 'zh-CN'] }, null],
  ['first supported browser language', { languages: ['fr-FR', 'zh-TW'] }, site.paths['zh-CN']],
  ['unsupported browser language', { languages: ['fr-FR', 'de-DE'] }, null],
  ['saved English overrides Chinese browser', { languages: ['zh-CN'], saved: 'en' }, null],
  ['saved Chinese overrides English browser', { saved: 'zh-CN' }, site.paths['zh-CN']],
  ['explicit Chinese link overrides saved English', { path: site.paths['zh-CN'], saved: 'en' }, null],
  ['support follows Chinese browser', { path: site.supportPaths.en, support: true, languages: ['zh-Hans'] }, site.supportPaths['zh-CN']],
  ['preserves search and fragment', { path: site.paths.en + '?from=github#demo', languages: ['zh-CN'] }, site.paths['zh-CN'] + '?from=github#demo'],
  ['blocked storage still detects language', { blocked: true, languages: ['zh-CN'] }, site.paths['zh-CN']],
  ['blocked storage respects internal navigation', { blocked: true, languages: ['zh-CN'], referrer: site.paths['zh-CN'] }, null],
  ['another Pages project is not internal', { languages: ['zh-CN'], referrer: '/another-project/' }, site.paths['zh-CN']],
  ['invalid stored language uses the browser', { languages: ['zh-CN'], saved: 'fr' }, site.paths['zh-CN']],
]) {
  test(name, () => {
    const result = visit(options);
    assert.deepEqual(result.redirects, expected ? [site.origin + expected] : []);
    result.dom.window.close();
  });
}

test('manual switching remembers the choice and keeps query and fragment', () => {
  const result = visit({ path: site.paths['zh-CN'] + '?from=github#demo' });
  assert.equal(result.click('en').href, site.origin + site.paths.en + '?from=github#demo');
  assert.equal(result.values.get(storageKey), 'en');
  result.dom.window.close();
});

test('an explicit English query works without a reload loop when storage is blocked', () => {
  const result = visit({ path: site.supportPaths.en + '?lang=en&from=github#main', support: true, languages: ['zh-CN'], blocked: true });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.location.href, site.origin + site.supportPaths.en + '?from=github#main');
  result.dom.window.close();
});

test('a language query changes locale while staying on the support page', () => {
  const result = visit({ path: site.supportPaths.en + '?lang=zh-CN&from=github#main', support: true });
  assert.equal(result.values.get(storageKey), 'zh-CN');
  assert.deepEqual(result.redirects, [site.origin + site.supportPaths['zh-CN'] + '?from=github#main']);
  result.dom.window.close();
});

test('manual switching without storage adds an explicit language query', () => {
  const result = visit({ path: site.paths['zh-CN'], blocked: true, languages: ['zh-CN'] });
  const destination = result.click('en');
  assert.equal(destination.pathname, site.paths.en);
  assert.equal(destination.searchParams.get('lang'), 'en');
  result.dom.window.close();
});
