import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/dm-sans/wght.css';
import 'katex/dist/katex.min.css';
import { animate } from 'motion';
import rendererUrl from 'virtual:renderer-url';
import svgExample from '../../docs/examples/svd.md?raw';
import mermaidExamples from '../../docs/examples/mermaid-samples.md?raw';
import './style.css';
import { copy, markdownSamples, pageMetadata } from './content.js';
import { initPageMotion } from './page-motion.js';

const mermaidBlocks = [...mermaidExamples.matchAll(/````markdown\r?\n([\s\S]*?)\r?\n````/g)].map(match => match[1]);
if (mermaidBlocks.length !== 2) throw new Error('Expected both documented Mermaid examples.');
const samples = {
  en: {
    markdown: markdownSamples['en'],
    math: '# Quantitative notes\n\n## Standard error\n\nFor a sample mean, $SE = s / \\sqrt{n}$.\n\n$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$\n\n==Keep uncertainty beside the estimate.=={.blue}',
    svg: svgExample,
    mermaid: mermaidBlocks[0],
  },
  'zh-CN': {
    markdown: markdownSamples['zh-CN'],
    math: '# 定量研究笔记\n\n## 标准误\n\n样本均值的标准误为 $SE = s / \\sqrt{n}$。\n\n$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$\n\n==在估计值旁保留不确定性。=={.blue}',
    svg: svgExample.replace('# Singular value decomposition', '# 奇异值分解').replace('maps the unit circle to an ellipse.', '将单位圆映射为椭圆。'),
    mermaid: mermaidBlocks[1],
  },
};

const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll('[data-example]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const lang = document.documentElement.lang === 'zh-CN' ? 'zh-CN' : 'en';
let example = 'markdown';
let renderer;
let rendererFailed = false;
let animationControls = [];
let demoPlayed = false;
let copyFeedbackTimer;
let copyRequest = 0;
function stopDemoMotion() {
  animationControls.forEach(control => control.stop());
  animationControls = [];
  for (const element of [$('.preview-pane'), $('.source-cursor'), ...$('#preview-content').children]) {
    element.style.removeProperty('opacity');
    element.style.removeProperty('transform');
  }
}

function playDemo() {
  stopDemoMotion();
  if (reduceMotion.matches || !renderer) return;
  animationControls = [
    animate('.preview-pane', { opacity: [0.18, 1], y: [9, 0] }, { duration: 0.65, ease: [0.22, 1, 0.36, 1] }),
    animate('.source-cursor', { opacity: [0, 1, 1, 0], y: [0, 35, 70, 95] }, { duration: 0.9, ease: 'easeInOut' }),
    ...[...$('#preview-content').children].map((element, index) => animate(element,
      { opacity: [0, 1], x: [-7, 0] },
      { duration: 0.45, delay: Math.min(index * 0.1, 0.4), ease: [0.22, 1, 0.36, 1] })),
  ];
}

function resetSourceCopy() {
  clearTimeout(copyFeedbackTimer);
  copyRequest++;
  const button = $('#copy-source');
  button.disabled = false;
  button.textContent = copy[lang].copy;
  button.setAttribute('aria-label', copy[lang].copySource);
  button.removeAttribute('data-copied');
  $('#copy-status').textContent = '';
}

async function copySource() {
  resetSourceCopy();
  const request = copyRequest;
  const source = $('#source-code').textContent;
  const button = $('#copy-source');
  button.disabled = true;
  let copied = false;
  try {
    await navigator.clipboard.writeText(source);
    copied = true;
  } catch { /* The source remains selectable if clipboard access is unavailable. */ }
  if (request !== copyRequest) return;
  button.disabled = false;
  button.textContent = copy[lang][copied ? 'copied' : 'copyRetry'];
  button.toggleAttribute('data-copied', copied);
  $('#copy-status').textContent = copy[lang][copied ? 'copied' : 'copyError'];
  $('#demo-note').textContent = copy[lang][copied ? (rendererFailed ? 'demoError' : `${example}Note`) : 'copyError'];
  copyFeedbackTimer = setTimeout(() => {
    resetSourceCopy();
    $('#demo-note').textContent = copy[lang][rendererFailed ? 'demoError' : `${example}Note`];
  }, copied ? 2000 : 5000);
}

function updateExample({ motion = false } = {}) {
  stopDemoMotion();
  resetSourceCopy();
  $('#source-code').textContent = samples[lang][example];
  $('#demo').dataset.example = example;
  $('#demo-note').textContent = copy[lang][rendererFailed ? 'demoError' : `${example}Note`];
  for (const tab of tabs) {
    const selected = tab.dataset.example === example;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  $('#example-panel').setAttribute('aria-labelledby', `tab-${example}`);
  if (renderer) {
    $('#preview-content').innerHTML = renderer.render(samples[lang][example]);
    const larger = $('.annotation-markdown-svg-open');
    if (larger) larger.textContent = copy[lang].viewLarger;
    const image = $('.annotation-markdown-svg-image');
    if (image) {
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', `${copy[lang].viewLarger}: ${image.alt}`);
      image.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDiagram(image); }
      });
    }
    if (motion) playDemo();
  } else {
    // Keep the source usable while the renderer downloads or if it is unavailable.
    $('#preview-content').textContent = samples[lang][example];
  }
  $('.source-pane').scrollTop = 0;
  $('.preview-pane').scrollTop = 0;
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => { example = tab.dataset.example; updateExample({ motion: true }); });
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') target = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target === undefined) return;
    event.preventDefault();
    tabs[target].focus();
    example = tabs[target].dataset.example;
    updateExample({ motion: true });
  });
});
$('#replay').addEventListener('click', playDemo);
$('#copy-source').addEventListener('click', copySource);
reduceMotion.addEventListener('change', () => { if (reduceMotion.matches) stopDemoMotion(); });

const dialog = $('#diagram-dialog');
function openDiagram(image) {
  if (!image) return;
  $('#large-diagram').src = image.src;
  $('#large-diagram').alt = image.alt;
  dialog.showModal();
}
$('#preview-content').addEventListener('click', event => {
  if (event.target.closest('.annotation-markdown-svg-image, .annotation-markdown-svg-open')) openDiagram($('.annotation-markdown-svg-image'));
});
$('#close-diagram').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('#year').textContent = new Date().getFullYear();
document.title = pageMetadata[lang].title;
updateExample();
initPageMotion();

// Load the production renderer after the first paint, outside the landing page bundle.
requestAnimationFrame(() => {
  import(/* @vite-ignore */ rendererUrl).then(module => {
    renderer = module.renderer;
    updateExample();
    if (!demoPlayed) { demoPlayed = true; playDemo(); }
  }).catch(error => {
    rendererFailed = true;
    $('#demo-note').textContent = copy[lang].demoError;
    console.error('Annotation demo renderer could not load.', error);
  });
});
