export function initLanguageMenu(documentRef = document) {
  function setup() {
    const picker = documentRef.querySelector('#language-picker');
    if (!picker || picker.dataset.ready) return;
    const select = documentRef.querySelector('#language-select');
    const button = documentRef.querySelector('#language-button');
    const menu = documentRef.querySelector('#language-menu');
    const items = [...menu.querySelectorAll('[data-language-mode]')];
    const label = documentRef.querySelector('label[for="language-select"]');
    const current = documentRef.querySelector('#language-current');
    const view = documentRef.defaultView;
    picker.dataset.ready = 'true';

    function sync() {
      const option = select.selectedOptions[0];
      current.textContent = option.dataset.short || option.textContent;
      button.setAttribute('aria-label', `${label.textContent}: ${option.textContent}`);
      for (const item of items) item.setAttribute('aria-checked', String(item.dataset.languageMode === select.value));
    }
    function close({ focus = false } = {}) {
      menu.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      if (focus) button.focus();
    }
    function open(index = items.findIndex(item => item.dataset.languageMode === select.value)) {
      menu.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      items[Math.max(0, index)].focus();
    }
    button.addEventListener('click', () => { if (menu.hidden) open(); else close(); });
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      open(event.key === 'ArrowDown' ? 0 : items.length - 1);
    });
    menu.addEventListener('keydown', event => {
      const index = items.indexOf(documentRef.activeElement);
      const next = { ArrowDown: (index + 1) % items.length, ArrowUp: (index - 1 + items.length) % items.length, Home: 0, End: items.length - 1 }[event.key];
      if (next !== undefined) {
        event.preventDefault();
        items[next].focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close({ focus: true });
      } else if (event.key === 'Tab') {
        // Let native Tab continue from the trigger into the surrounding page.
        close({ focus: true });
      }
    });
    for (const item of items) {
      item.addEventListener('click', () => {
        select.value = item.dataset.languageMode;
        sync();
        close({ focus: true });
        select.dispatchEvent(new view.Event('change', { bubbles: true }));
      });
    }
    select.addEventListener('change', sync);
    select.addEventListener('language-preference-ready', sync);
    documentRef.addEventListener('pointerdown', event => { if (!picker.contains(event.target)) close(); });
    picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget)) close(); });
    sync();
    picker.hidden = false;
    documentRef.querySelector('#language-toggle').hidden = true;
    documentRef.documentElement.dataset.languagePicker = '';
  }
  if (documentRef.readyState === 'loading') documentRef.addEventListener('DOMContentLoaded', setup, { once: true });
  else setup();
}
