// Self-contained so the static build can run this in <head>, before paint.
export function initSiteLanguage({ paths, base, storageKey }, view = window) {
  const supported = language => Object.hasOwn(paths, language);
  const validMode = mode => mode === 'auto' || supported(mode);
  let storageAvailable = true;
  const save = language => {
    try {
      view.localStorage.setItem(storageKey, language);
      storageAvailable = true;
      return true;
    } catch { storageAvailable = false; return false; }
  };
  const browserLanguage = () => {
    const languages = view.navigator.languages?.length ? view.navigator.languages : [view.navigator.language];
    for (const language of languages) {
      if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
      if (/^en(?:-|$)/i.test(language)) return 'en';
    }
    return 'en';
  };
  const current = new URL(view.location.href);
  const requested = current.searchParams.get('lang');
  let saved;
  try {
    const value = view.localStorage.getItem(storageKey);
    if (validMode(value)) saved = value;
  } catch { storageAvailable = false; }
  // A first visit to a translated URL stays in that language. Once a mode is
  // chosen, it governs both pages, keeping the selection and content consistent.
  let mode = validMode(requested) ? requested : saved ?? (current.pathname === paths['zh-CN'] ? 'zh-CN' : 'auto');
  if (validMode(requested) || (!saved && mode === 'auto')) save(mode);

  function navigate() {
    const before = new URL(view.location.href);
    const destination = new URL(before);
    destination.pathname = paths[mode === 'auto' ? browserLanguage() : mode];
    destination.searchParams.delete('lang');
    if (!storageAvailable) destination.searchParams.set('lang', mode);
    if (destination.pathname !== before.pathname) {
      view.location.replace(destination.href);
      return true;
    }
    if (destination.href !== before.href) view.history.replaceState(view.history.state, '', destination.href);
    return false;
  }
  if (navigate()) return;

  function showPicker() {
    const picker = view.document.querySelector('#language-select');
    if (!picker) return;
    picker.value = mode;
    picker.dispatchEvent(new view.document.defaultView.Event('language-preference-ready'));
  }
  if (view.document.readyState === 'loading') view.document.addEventListener('DOMContentLoaded', showPicker, { once: true });
  else showPicker();

  view.document.addEventListener('change', event => {
    if (event.target?.id !== 'language-select' || !validMode(event.target.value)) return;
    mode = event.target.value;
    save(mode);
    navigate();
  });
  view.addEventListener?.('languagechange', () => { if (mode === 'auto') navigate(); });

  view.document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link) return;
    const destination = new URL(link.href);
    if (destination.origin !== current.origin || !destination.pathname.startsWith(base)) return;
    // Preserve the chosen mode through internal links when storage is blocked.
    if (!storageAvailable && (Object.values(paths).includes(destination.pathname) || link.matches('.brand, .home-link, .support-link'))) {
      destination.searchParams.set('lang', mode);
      link.href = destination.href;
    }
  });
}
