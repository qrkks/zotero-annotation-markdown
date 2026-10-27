import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/dm-sans/wght.css';
import './style.css';
import { initLanguageMenu } from './language-menu.js';

initLanguageMenu();
document.querySelector('#year').textContent = new Date().getFullYear();
