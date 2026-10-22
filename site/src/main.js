import '@fontsource-variable/bricolage-grotesque/wght.css';
import '@fontsource-variable/dm-sans/wght.css';
import 'katex/dist/katex.min.css';
import { animate, inView } from 'motion';
import rendererUrl from 'virtual:renderer-url';
import svgExample from '../../docs/examples/svd.md?raw';
import mermaidExamples from '../../docs/examples/mermaid-samples.md?raw';
import './style.css';

const copy = {
  en: {
    skip: 'Skip to content', guide: 'User guide',
    eyebrow: 'A little more clarity. In every annotation.',
    titleFirst: 'Markdown in.', titleSecond: 'Clarity out.',
    description: 'Give your Zotero annotations structure, equations, and diagrams. Your ideas, easier to read. Your original source, always editable.',
    download: 'Get the plugin', readGuide: 'Read the guide',
    releaseNote: 'Free & open source · Download and changelog on GitHub',
    demoCaption: 'The same thought. A clearer view.', demoTitle: 'An annotation, transformed', liveDemo: 'LIVE DEMO',
    mathTab: 'Math', source: 'SOURCE', preview: 'PREVIEW', replay: 'Replay',
    copySource: 'Copy example source', copy: 'Copy', copied: 'Copied', copyRetry: 'Retry',
    copyError: 'Copy failed. Select the source and copy it manually.',
    markdownNote: 'Headings, lists, and highlights — right in your annotations.',
    mathNote: 'LaTeX equations, kept close to your reading.',
    svgNote: 'SVG · Experimental, off by default. Open the diagram for a closer look.',
    mermaidNote: 'Mermaid · Experimental, off by default. A workflow from a few lines of text.',
    demoFootnote: 'Choose an example. See how it reads.',
    detailsEyebrow: 'MADE FOR THE MARGINS', detailsTitle: 'Stay with the paper.\nKeep the whole idea.',
    featureOneTitle: 'Write it your way.', featureOneBody: 'Use Markdown and LaTeX in annotation comments. Switch between source and preview as you work.',
    featureTwoTitle: 'Follow the thread.', featureTwoBody: 'Find your place with a floating heading outline. Read previews in the sidebar and annotation popups.',
    featureThreeTitle: 'Make room for diagrams.', featureThreeBody: 'Try SVG and Mermaid previews, with a larger diagram viewer. Both are experimental and off by default.',
    closingEyebrow: 'YOUR NEXT READING SESSION', closingTitle: 'A clearer margin awaits.', viewRelease: 'View the latest release',
    feedback: 'Feedback', licenses: 'Third-party notices', independent: 'An independent Zotero plugin', diagramTitle: 'Diagram preview', close: 'Close', viewLarger: 'View larger',
    demoError: 'The interactive preview could not load. You can still read and copy the example source.',
  },
  'zh-CN': {
    skip: '跳至正文', guide: '使用指南', eyebrow: '让每一条批注，都更清晰一点。',
    titleFirst: '写下想法，', titleSecond: '读出条理。',
    description: '在 Zotero 批注里，用 Markdown 整理思路，用公式和图表表达想法。阅读更清晰，原始源码始终可以编辑。',
    download: '获取插件', readGuide: '阅读使用指南', releaseNote: '免费开源 · 在 GitHub 下载并查看更新内容',
    demoCaption: '同一个想法，更清晰的呈现。', demoTitle: '从源码到批注预览', liveDemo: '交互演示',
    mathTab: '公式', source: '源码', preview: '预览', replay: '重播',
    copySource: '复制示例源码', copy: '复制', copied: '已复制', copyRetry: '重试',
    copyError: '复制失败，请选中源码后手动复制。',
    markdownNote: '标题、列表与高亮，直接呈现在批注中。', mathNote: '让 LaTeX 公式留在阅读的上下文里。',
    svgNote: 'SVG · 实验功能，默认关闭。打开大图，查看细节。', mermaidNote: 'Mermaid · 实验功能，默认关闭。用几行文字描述研究流程。',
    demoFootnote: '点击标签，看看不同内容的阅读效果。',
    detailsEyebrow: '为阅读中的思考而做', detailsTitle: '留在论文旁，\n记下完整的想法。',
    featureOneTitle: '按你的方式书写。', featureOneBody: '在批注评论里使用 Markdown 与 LaTeX，随时切换源码和预览。',
    featureTwoTitle: '让思路有迹可循。', featureTwoBody: '用悬浮标题大纲快速定位，在侧栏和页内批注弹窗中阅读预览。',
    featureThreeTitle: '给图表留一点空间。', featureThreeBody: '尝试 SVG 与 Mermaid 预览，并在大图查看器中阅读。两项功能均为实验性，默认关闭。',
    closingEyebrow: '下一次阅读，就从这里开始', closingTitle: '让页边的想法，更清晰。', viewRelease: '查看最新 Release',
    feedback: '反馈问题', licenses: '第三方许可', independent: '独立开发的 Zotero 插件', diagramTitle: '图表预览', close: '关闭', viewLarger: '查看大图',
    demoError: '交互预览暂时无法加载，你仍然可以阅读并复制示例源码。',
  },
};

const mermaidBlocks = [...mermaidExamples.matchAll(/````markdown\r?\n([\s\S]*?)\r?\n````/g)].map(match => match[1]);
if (mermaidBlocks.length !== 2) throw new Error('Expected both documented Mermaid examples.');
const samples = {
  en: {
    markdown: '# Reading notes\n\n## Key findings\n\n- **Structure** makes notes easier to revisit.\n- ==Keep evidence close.=={.blue}\n\n> Your original source stays editable.',
    math: '# Quantitative notes\n\n## Standard error\n\nFor a sample mean, $SE = s / \\sqrt{n}$.\n\n$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$\n\n==Keep uncertainty beside the estimate.=={.blue}',
    svg: svgExample,
    mermaid: mermaidBlocks[0],
  },
  'zh-CN': {
    markdown: '# 阅读笔记\n\n## 关键发现\n\n- **结构清晰**的笔记更容易回顾。\n- ==让证据紧贴观点。=={.blue}\n\n> 原始源码始终可以编辑。',
    math: '# 定量研究笔记\n\n## 标准误\n\n样本均值的标准误为 $SE = s / \\sqrt{n}$。\n\n$$\n\\bar{x} = \\frac{1}{n}\\sum_{i=1}^{n} x_i\n$$\n\n==在估计值旁保留不确定性。=={.blue}',
    svg: svgExample.replace('# Singular value decomposition', '# 奇异值分解').replace('maps the unit circle to an ellipse.', '将单位圆映射为椭圆。'),
    mermaid: mermaidBlocks[1],
  },
};

const $ = (selector) => document.querySelector(selector);
const tabs = [...document.querySelectorAll('[data-example]')];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let lang = 'en';
let example = 'markdown';
let renderer;
let rendererFailed = false;
let animationControls = [];
let demoPlayed = false;
let copyFeedbackTimer;
let copyRequest = 0;
try {
  const preferred = new URLSearchParams(location.search).get('lang') || localStorage.getItem('annotation-markdown-language');
  if (preferred === 'zh-CN') lang = preferred;
} catch { /* The page works without storage. */ }

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

function setLanguage(next, persist = false) {
  lang = next;
  document.documentElement.lang = lang;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = copy[lang][element.dataset.i18n];
  for (const link of document.querySelectorAll('.docs-link')) link.href = `https://github.com/qrkks/zotero-annotation-markdown/blob/main/docs/${lang === 'en' ? 'en' : 'zh-CN'}/user-guide.md`;
  const languageButton = $('#language-toggle');
  languageButton.textContent = lang === 'en' ? '中文' : 'EN';
  languageButton.lang = lang === 'en' ? 'zh-CN' : 'en';
  languageButton.setAttribute('aria-label', lang === 'en' ? '切换到中文' : 'Switch to English');
  $('.demo-tabs').setAttribute('aria-label', lang === 'en' ? 'Annotation examples' : '批注示例');
  $('nav').setAttribute('aria-label', lang === 'en' ? 'Main navigation' : '主导航');
  document.title = lang === 'en' ? 'Zotero Annotation Markdown — Markdown in. Clarity out.' : 'Zotero Annotation Markdown — 写下想法，读出条理。';
  $('meta[name="description"]').content = copy[lang].description;
  if (persist) {
    const url = new URL(location.href);
    if (lang === 'zh-CN') url.searchParams.set('lang', lang);
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url);
    try { localStorage.setItem('annotation-markdown-language', lang); } catch { /* Optional. */ }
  }
  updateExample();
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
$('#language-toggle').addEventListener('click', () => setLanguage(lang === 'en' ? 'zh-CN' : 'en', true));
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
setLanguage(lang);

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

if (!reduceMotion.matches) {
  inView('.detail-item', element => {
    if (reduceMotion.matches) return;
    animate(element, { opacity: [0.3, 1], y: [12, 0] }, { duration: 0.55, ease: [0.22, 1, 0.36, 1] });
  });
}
