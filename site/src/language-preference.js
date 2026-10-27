// Self-contained so the static build can run this in <head>, before paint.
export function initSiteLanguage({ paths, base, storageKey }, view = window) {
  const supported = language => Object.hasOwn(paths, language);
  const save = language => {
    try {
      view.localStorage.setItem(storageKey, language);
      return true;
    } catch { return false; }
  };
  const current = new URL(view.location.href);
  const requested = current.searchParams.get('lang');

  if (supported(requested)) {
    save(requested);
    const destination = new URL(current);
    destination.pathname = paths[requested];
    destination.searchParams.delete('lang');
    if (destination.pathname !== current.pathname) {
      view.location.replace(destination.href);
      return;
    }
    // Do not reload the same page, including when storage is unavailable.
    view.history.replaceState(view.history.state, '', destination.href);
  } else if (current.pathname === paths.en) {
    let preferred;
    try {
      const saved = view.localStorage.getItem(storageKey);
      if (supported(saved)) preferred = saved;
    } catch { /* Private browsing may disable storage. */ }
    let internalNavigation = false;
    try {
      const referrer = new URL(view.document.referrer);
      internalNavigation = referrer.origin === current.origin && referrer.pathname.startsWith(base);
    } catch { /* A direct visit has no referrer. */ }
    if (!preferred && !internalNavigation) {
      const languages = view.navigator.languages?.length ? view.navigator.languages : [view.navigator.language];
      for (const language of languages) {
        if (/^zh(?:-|$)/i.test(language)) { preferred = 'zh-CN'; break; }
        if (/^en(?:-|$)/i.test(language)) { preferred = 'en'; break; }
      }
    }
    if (preferred && preferred !== 'en') {
      const destination = new URL(current);
      destination.pathname = paths[preferred];
      view.location.replace(destination.href);
      return;
    }
  }

  view.document.addEventListener('click', event => {
    const link = event.target?.closest?.('#language-toggle');
    if (!link || !supported(link.hreflang)) return;
    const destination = new URL(link.href);
    if (destination.origin !== current.origin || destination.pathname !== paths[link.hreflang]) return;
    destination.search = view.location.search;
    destination.hash = view.location.hash;
    destination.searchParams.delete('lang');
    // Keep an explicit choice working even when saving it is blocked.
    if (!save(link.hreflang)) destination.searchParams.set('lang', link.hreflang);
    link.href = destination.href;
  });
}
