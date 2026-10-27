import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { site } from '../src/content.js';
import { initSiteLanguage } from '../src/language-preference.js';

const storageKey = 'annotation-markdown-language';
function visit({ path = site.paths.en, languages = ['en-US'], saved, blocked = false, support = false } = {}) {
  const dom = new JSDOM('<select id="language-select" hidden><option value="auto">Follow system</option><option value="en">English</option><option value="zh-CN">简体中文</option></select><a id="language-toggle">中文</a>', { url: site.origin + path });
  const values = new Map(saved ? [[storageKey, saved]] : []);
  const redirects = [];
  const listeners = new Map();
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
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  const config = { paths: support ? site.supportPaths : site.paths, base: site.base, storageKey };
  initSiteLanguage(config, view);
  view.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return { dom, values, redirects, location,
    select(mode) {
      const picker = view.document.querySelector('#language-select');
      picker.value = mode;
      picker.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      return new URL(redirects.at(-1) ?? location.href);
    },
    changeBrowserLanguage(language) { view.navigator.languages = [language]; listeners.get('languagechange')?.(); },
  };
}

for (const [name, options, expected] of [
  ['Chinese browser', { languages: ['zh-CN', 'en-US'] }, site.paths['zh-CN']],
  ['English browser with Chinese fallback', { languages: ['en-GB', 'zh-CN'] }, null],
  ['first supported browser language', { languages: ['fr-FR', 'zh-TW'] }, site.paths['zh-CN']],
  ['unsupported browser language', { languages: ['fr-FR', 'de-DE'] }, null],
  ['saved English overrides Chinese browser', { languages: ['zh-CN'], saved: 'en' }, null],
  ['saved Chinese overrides English browser', { saved: 'zh-CN' }, site.paths['zh-CN']],
  ['first visit to an explicit Chinese link', { path: site.paths['zh-CN'] }, null],
  ['chosen English applies to a Chinese URL', { path: site.paths['zh-CN'], saved: 'en' }, site.paths.en],
  ['support follows Chinese browser', { path: site.supportPaths.en, support: true, languages: ['zh-Hans'] }, site.supportPaths['zh-CN']],
  ['preserves search and fragment', { path: site.paths.en + '?from=github#demo', languages: ['zh-CN'] }, site.paths['zh-CN'] + '?from=github#demo'],
  ['blocked storage still detects language', { blocked: true, languages: ['zh-CN'] }, site.paths['zh-CN'] + '?lang=auto'],
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
  assert.equal(result.select('en').href, site.origin + site.paths.en + '?from=github#demo');
  assert.equal(result.values.get(storageKey), 'en');
  result.dom.window.close();
});

test('an explicit English query works without a reload loop when storage is blocked', () => {
  const result = visit({ path: site.supportPaths.en + '?lang=en&from=github#main', support: true, languages: ['zh-CN'], blocked: true });
  assert.deepEqual(result.redirects, []);
  assert.equal(result.location.pathname, site.supportPaths.en);
  assert.equal(result.location.searchParams.get('lang'), 'en');
  assert.equal(result.location.searchParams.get('from'), 'github');
  assert.equal(result.location.hash, '#main');
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
  const destination = result.select('en');
  assert.equal(destination.pathname, site.paths.en);
  assert.equal(destination.searchParams.get('lang'), 'en');
  result.dom.window.close();
});

test('returning to system mode clears a fixed Chinese preference immediately', () => {
  const result = visit({ path: site.paths['zh-CN'], saved: 'zh-CN', languages: ['en-US'] });
  assert.equal(result.select('auto').pathname, site.paths.en);
  assert.equal(result.values.get(storageKey), 'auto');
  result.dom.window.close();
});

test('saved system mode re-evaluates browser language on both pages', () => {
  const result = visit({ path: site.supportPaths['zh-CN'], support: true, saved: 'auto', languages: ['en-US'] });
  assert.deepEqual(result.redirects, [site.origin + site.supportPaths.en]);
  result.dom.window.close();
});

test('the picker displays a migrated fixed preference', () => {
  const result = visit({ saved: 'en' });
  assert.equal(result.dom.window.document.querySelector('#language-select').value, 'en');
  assert.equal(result.dom.window.document.querySelector('#language-select').hidden, false);
  assert.equal(result.dom.window.document.querySelector('#language-toggle').hidden, true);
  result.dom.window.close();
});

test('system mode reacts to browser language changes', () => {
  const result = visit({ saved: 'auto' });
  result.changeBrowserLanguage('zh-CN');
  assert.deepEqual(result.redirects, [site.origin + site.paths['zh-CN']]);
  result.dom.window.close();
});

test('fixed English ignores browser language changes', () => {
  const result = visit({ saved: 'en' });
  result.changeBrowserLanguage('zh-CN');
  assert.deepEqual(result.redirects, []);
  result.dom.window.close();
});

test('blocked storage preserves the mode through internal page links', () => {
  const result = visit({ path: site.supportPaths.en + '?lang=en', support: true, blocked: true, languages: ['zh-CN'] });
  const link = result.dom.window.document.createElement('a');
  link.href = site.paths.en;
  link.className = 'home-link';
  result.dom.window.document.body.append(link);
  link.addEventListener('click', event => event.preventDefault());
  link.dispatchEvent(new result.dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(new URL(link.href).searchParams.get('lang'), 'en');
  result.dom.window.close();
});
