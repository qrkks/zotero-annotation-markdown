import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/dm-sans/wght.css';
import './style.css';
import { site } from './content.js';

document.querySelector('#year').textContent = new Date().getFullYear();

// Preserve old language-query links without changing the destination page.
const language = new URLSearchParams(location.search).get('lang');
if (language === 'en' || language === 'zh-CN') {
  const destination = new URL(location.href);
  destination.pathname = site.supportPaths[language];
  destination.searchParams.delete('lang');
  location.replace(destination.href);
}
