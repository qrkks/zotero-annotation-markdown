import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { initLanguageMenu } from '../src/language-menu.js';

const template = await readFile(new URL('../index.html', import.meta.url), 'utf8');
function create(mode = 'auto', twice = false) {
  const dom = new JSDOM(template, { url: 'https://qrkks.github.io/zotero-annotation-markdown/' });
  const document = dom.window.document;
  const select = document.querySelector('#language-select');
  select.value = mode;
  select.options[0].dataset.short = 'System';
  const changes = [];
  document.addEventListener('change', event => changes.push(event.target.value));
  initLanguageMenu(document);
  if (twice) initLanguageMenu(document);
  document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return {
    dom, document, select, changes,
    button: document.querySelector('#language-button'),
    menu: document.querySelector('#language-menu'),
    items: [...document.querySelectorAll('[data-language-mode]')],
    key(element, key) { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); },
  };
}

test('the compact trigger reflects a saved mode and keeps the native select hidden', () => {
  const ui = create('en');
  assert.equal(ui.select.hidden, true);
  assert.equal(ui.document.querySelector('#language-picker').hidden, false);
  assert.equal(ui.document.querySelector('#language-toggle').hidden, true);
  assert.equal(ui.document.querySelector('#language-current').textContent, 'EN');
  assert.equal(ui.button.getAttribute('aria-label'), 'Language: English');
  ui.dom.window.close();
});

test('opening focuses the current option and Escape restores the trigger', () => {
  const ui = create('zh-CN');
  ui.button.click();
  assert.equal(ui.menu.hidden, false);
  assert.equal(ui.button.getAttribute('aria-expanded'), 'true');
  assert.equal(ui.document.activeElement, ui.items[2]);
  ui.key(ui.items[2], 'Escape');
  assert.equal(ui.menu.hidden, true);
  assert.equal(ui.document.activeElement, ui.button);
  ui.dom.window.close();
});

test('choosing an option announces a single change and updates its checked state', () => {
  const ui = create();
  ui.button.click();
  ui.items[1].click();
  assert.deepEqual(ui.changes, ['en']);
  assert.equal(ui.select.value, 'en');
  assert.deepEqual(ui.items.map(item => item.getAttribute('aria-checked')), ['false', 'true', 'false']);
  assert.equal(ui.menu.hidden, true);
  assert.equal(ui.document.activeElement, ui.button);
  ui.dom.window.close();
});

test('arrow keys wrap and Home/End reach the first and last option', () => {
  const ui = create();
  ui.key(ui.button, 'ArrowUp');
  assert.equal(ui.document.activeElement, ui.items[2]);
  ui.key(ui.items[2], 'ArrowDown');
  assert.equal(ui.document.activeElement, ui.items[0]);
  ui.key(ui.items[0], 'ArrowUp');
  assert.equal(ui.document.activeElement, ui.items[2]);
  ui.key(ui.items[2], 'Home');
  assert.equal(ui.document.activeElement, ui.items[0]);
  ui.key(ui.items[0], 'End');
  assert.equal(ui.document.activeElement, ui.items[2]);
  ui.dom.window.close();
});

test('Tab closes the menu so native focus can continue through the page', () => {
  const ui = create();
  ui.button.click();
  ui.key(ui.items[0], 'Tab');
  assert.equal(ui.menu.hidden, true);
  assert.equal(ui.document.activeElement, ui.button);
  ui.dom.window.close();
});

test('an outside pointer closes the menu without pulling focus back', () => {
  const ui = create();
  ui.button.click();
  const outside = ui.document.querySelector('.docs-link');
  outside.focus();
  outside.dispatchEvent(new ui.dom.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(ui.menu.hidden, true);
  assert.equal(ui.document.activeElement, outside);
  ui.dom.window.close();
});

test('a preference arriving at DOMContentLoaded updates an already initialized menu', () => {
  const ui = create();
  ui.select.value = 'zh-CN';
  ui.select.dispatchEvent(new ui.dom.window.Event('language-preference-ready'));
  assert.equal(ui.document.querySelector('#language-current').textContent, '中文');
  assert.equal(ui.items[2].getAttribute('aria-checked'), 'true');
  ui.dom.window.close();
});

test('initializing twice does not duplicate button handlers', () => {
  const ui = create('auto', true);
  ui.button.click();
  assert.equal(ui.menu.hidden, false);
  ui.dom.window.close();
});
