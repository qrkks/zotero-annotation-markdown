import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import { trackAnnotationOutline } from "../src/annotation-outline.ts";
import { createMarkdownRenderer } from "../src/markdown-renderer.ts";

let controller;
afterEach(() => {
  controller?.stop();
  controller = undefined;
  document.documentElement.lang = "";
  document.body.innerHTML = "";
});

function setup({
  initialExpanded = false,
  enabled = true,
  fontScale = 1,
  numbering = false,
  smartNumbering = true,
  viewportWidth = 800,
  viewportHeight = 700,
  scrollerRect = { left: 20, top: 60, right: 320, bottom: 660, width: 300, height: 600 },
  MutationObserverRef = window.MutationObserver
} = {}) {
  document.documentElement.lang = "zh-CN";
  document.body.innerHTML = `<section id="annotation-tab-panel">
    <div id="annotations" style="overflow-y:auto">
      <div data-sidebar-annotation-id="a" class="annotation selected">
        <div class="comment"><div class="content">source a</div><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>章节概述</h1><p>内容</p><h2>细节</h2></div></div>
      </div>
      <div data-sidebar-annotation-id="b" class="annotation">
        <div class="comment"><div class="content">source b</div><div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>后续章节</h1><h2>结论</h2><h3>限制</h3></div></div>
      </div>
    </div>
  </section>`;
  const scroller = document.querySelector("#annotations");
  scroller.getBoundingClientRect = () => scrollerRect;
  Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: viewportWidth });
  Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: viewportHeight });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: viewportWidth });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewportHeight });
  let expanded = initialExpanded;
  let currentFontScale = fontScale;
  const setExpanded = vi.fn(value => { expanded = value; });
  controller = trackAnnotationOutline({
    document,
    MutationObserver: MutationObserverRef,
    isEnabled: () => enabled,
    isExpanded: () => expanded,
    setExpanded,
    isNumberingEnabled: () => numbering,
    isSmartNumberingEnabled: () => smartNumbering,
    getFontScale: () => currentFontScale
  });
  return {
    rows: [...document.querySelectorAll(".annotation")],
    scroller,
    setExpanded,
    getExpanded: () => expanded,
    setNumbering(value) { numbering = value; controller.sync(); },
    setSmartNumbering(value) { smartNumbering = value; controller.sync(); },
    setEnabled(value) { enabled = value; controller.sync(); },
    setFontScale(value) {
      currentFontScale = value;
      controller.sync();
    }
  };
}

test("ignores outline-owned style mutations instead of scheduling a render loop", () => {
  let mutationCallback;
  const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
    mutationCallback = callback;
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = vi.fn(() => 1);

  try {
    const { scroller } = setup({ MutationObserverRef: FakeMutationObserver });
    const outline = document.querySelector("[data-annotation-markdown-outline='true']");

    mutationCallback([{
      type: "attributes",
      attributeName: "style",
      target: outline,
      addedNodes: [],
      removedNodes: []
    }]);
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    mutationCallback([{
      type: "attributes",
      attributeName: "style",
      target: scroller,
      addedNodes: [],
      removedNodes: []
    }]);
    expect(window.requestAnimationFrame).toHaveBeenCalledOnce();
  } finally {
    controller?.stop();
    controller = undefined;
    window.requestAnimationFrame = originalRequestAnimationFrame;
  }
});

test("ignores bulk insertion of unselected annotation rows without rescanning the outline", () => {
  let mutationCallback;
  const FakeMutationObserver = vi.fn(function FakeMutationObserver(callback) {
    mutationCallback = callback;
    return { observe: vi.fn(), disconnect: vi.fn() };
  });
  const enabled = vi.fn(() => true);
  setup({ MutationObserverRef: FakeMutationObserver, enabled });
  enabled.mockClear();
  const row = document.createElement("div");
  row.className = "annotation";
  row.dataset.sidebarAnnotationId = "bulk";
  row.innerHTML = `<div class="comment"><div class="content">bulk</div></div>`;
  document.querySelector("#annotations").append(row);

  mutationCallback([{
    type: "childList",
    target: document.querySelector("#annotations"),
    addedNodes: [row],
    removedNodes: []
  }]);

  expect(enabled).not.toHaveBeenCalled();
});

async function flushMutations() {
  await Promise.resolve();
  await Promise.resolve();
}

function replaceSelectedSubheading(source, output = "htmlAndMathml") {
  const holder = document.createElement("div");
  holder.innerHTML = createMarkdownRenderer({ windowRef: window, getMathOutput: () => output })
    .render(`## ${source}`);
  const heading = holder.querySelector("h2");
  document.querySelector(".annotation.selected h2").replaceWith(heading);
  controller.sync();
  return heading;
}

test("creates a collapsed outline only for one selected preview with multiple headings", () => {
  setup();
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const toggle = outline.querySelector(".annotation-markdown-outline-toggle");
  const items = [...outline.querySelectorAll(".annotation-markdown-outline-item")];

  expect(toggle.textContent).toBe("大纲 · 2");
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(true);
  expect(items.map(item => item.textContent)).toEqual(["章节概述", "细节"]);
  expect(items.map(item => item.dataset.level)).toEqual(["1", "2"]);
  expect(document.querySelectorAll("[data-annotation-markdown-outline='true']")).toHaveLength(1);
  expect(outline.parentElement).toBe(document.body);
  expect(outline.dataset.side).toBe("right");
  expect(outline.style.left).toBe("326px");
  expect(outline.style.top).toBe("68px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("0.85em");
});

test("toggles hierarchy numbers in place without changing headings, focus or expansion", () => {
  const f = setup({ initialExpanded: true });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const items = [...outline.querySelectorAll(".annotation-markdown-outline-item")];
  const headings = [...f.rows[0].querySelectorAll("h1,h2")];
  const originals = headings.map(heading => heading.innerHTML);
  items[1].focus();
  f.setNumbering(true);
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect([...outline.querySelectorAll(".annotation-markdown-outline-item")]).toEqual(items);
  expect(items.map(item => item.textContent)).toEqual(["1 章节概述", "1.1 细节"]);
  expect(items[1].getAttribute("aria-label")).toBe("1.1 细节");
  expect(items[1].title).toBe("1.1 细节");
  expect(items[1].querySelector(".annotation-markdown-outline-number").getAttribute("aria-hidden")).toBe("true");
  expect(document.activeElement).toBe(items[1]);
  expect(f.getExpanded()).toBe(true);
  expect(headings.map(heading => heading.innerHTML)).toEqual(originals);
  f.setNumbering(false);
  expect(items.map(item => item.textContent)).toEqual(["章节概述", "细节"]);
  expect(items[1].title).toBe("细节");
  expect(outline.querySelector(".annotation-markdown-outline-number")).toBeNull();
  expect(document.activeElement).toBe(items[1]);
});

test("switches smart avoidance without rebuilding navigation or changing source and math", () => {
  const f = setup({ numbering: true, initialExpanded: true });
  document.querySelector(".annotation.selected h1").textContent = "五、结果";
  replaceSelectedSubheading("$1.2$ 参数");
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const items = [...outline.querySelectorAll(".annotation-markdown-outline-item")];
  const preview = f.rows[0].querySelector("[data-annotation-markdown-preview]");
  const originalPreview = preview.innerHTML;
  const originalSource = f.rows[0].querySelector(".content").innerHTML;
  const originalMath = items[1].querySelector(".katex");
  const labels = items.map(item => item.textContent);
  items[1].focus();

  f.setSmartNumbering(false);
  expect(items.map(item => item.textContent)).toEqual([`1 ${labels[0]}`, `1.1 ${labels[1]}`]);
  expect(items[0].title).toBe("1 五、结果");
  expect(items[1].getAttribute("aria-label")).toMatch(/^1\.1 /);
  expect(items[1].querySelector(".katex")).toBe(originalMath);
  f.setNumbering(false);
  expect(items.map(item => item.textContent)).toEqual(labels);
  f.setNumbering(true);
  expect(items[0].textContent).toBe("1 五、结果");
  f.setSmartNumbering(true);
  expect(items.map(item => item.textContent)).toEqual(labels);
  expect(items[0].title).toBe("五、结果");
  expect(outline.querySelector(".annotation-markdown-outline-number")).toBeNull();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect([...outline.querySelectorAll(".annotation-markdown-outline-item")]).toEqual(items);
  expect(document.activeElement).toBe(items[1]);
  expect(f.getExpanded()).toBe(true);
  expect(preview.innerHTML).toBe(originalPreview);
  expect(f.rows[0].querySelector(".content").innerHTML).toBe(originalSource);
});

test("numbers the reported authored and leading headings uniformly when smart avoidance is off", () => {
  setup({ numbering: true, smartNumbering: false });
  const source = readFileSync(path.join(process.cwd(), "tests", "fixtures", "outline-leading-subheadings.md"), "utf8");
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = createMarkdownRenderer({ windowRef: window }).render(source);
  const originalHeadings = [...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML);
  controller.sync();
  const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
  expect(items.map(item => item.querySelector(".annotation-markdown-outline-number")?.textContent.trim()))
    .toEqual(["1.1", "1.2", "1.2.1", "1.2.2", "1.3", "1.4", "2", "3", "3.1", "3.2", "4", "4.1", "4.2", "5", "6"]);
  expect(items[0].textContent).toMatch(/^1\.1 1\. /);
  expect([...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML)).toEqual(originalHeadings);
});

test("keeps the reported leading H2 headings below the later H1 level without changing titles", () => {
  setup({ numbering: true });
  const source = readFileSync(path.join(process.cwd(), "tests", "fixtures", "outline-leading-subheadings.md"), "utf8");
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = createMarkdownRenderer({ windowRef: window }).render(source);
  const originalHeadings = [...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML);
  controller.sync();

  const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
  expect(items.map(item => item.querySelector(".annotation-markdown-outline-number")?.textContent.trim() ?? null))
    .toEqual(Array(15).fill(null));
  expect(items.map(item => item.dataset.level))
    .toEqual(["2", "2", "3", "3", "2", "2", "1", "1", "2", "2", "1", "2", "2", "1", "1"]);
  expect(items[0].textContent).toBe("1. 先拆解你的思路：你说的“可互相比”= 能做倍数比值（ratio）");
  expect([...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML)).toEqual(originalHeadings);
});

test.each([
  [[3, 2, 1], ["1.1.1", "1.2", "2"]],
  [[1, 3, 2, 3, 1, 2, 3], ["1", "1.1.1", "1.2", "1.2.1", "2", "2.1", "2.1.1"]],
  [[2, 4, 4, 2, 6], ["1", "1.1", "1.2", "2", "2.1.1"]],
  [[4, 4], ["1", "2"]],
  [[2, 2, 3, 3, 2, 2, 1, 1, 2, 2, 1, 2, 2, 1, 1], ["1.1", "1.2", "1.2.1", "1.2.2", "1.3", "1.4", "2", "3", "3.1", "3.2", "4", "4.1", "4.2", "5", "6"]]
])("keeps numbering depth consistent for each present heading level (%j)", (levels, expected) => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = levels.map((level, index) => `<h${level}>Heading ${index}</h${level}>`).join("");
  controller.sync();
  expect([...document.querySelectorAll(".annotation-markdown-outline-number")].map(label => label.textContent.trim()))
    .toEqual(expected);
  expect(preview.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(0);
});

test("numbers skipped levels consistently without duplicating explicit handwritten numbers", () => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = '<h2>1. 手写标题</h2><h4>A</h4><h3>B</h3><h5>C</h5><h2>D</h2><h1>E</h1><h3>F</h3><h1>G</h1>';
  controller.sync();
  const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
  expect(items.map(item => item.textContent)).toEqual([
    "1. 手写标题", "A", "B", "C", "D", "2 E", "2.1.1 F", "3 G"
  ]);
  expect(preview.querySelector("h2").textContent).toBe("1. 手写标题");
});

test.each([
  "一、研究背景", "（一）测量方法", "(二) 方法", "第十二章 实验", "第2节 方法", "第一部分 理论",
  "1. 研究背景", "2、测量方法", "(3) 数据分析", "（４）数据分析", "5) Discussion", "６． 结论",
  "1.2. 小节", "1.2、子小节", "**一、** 研究背景", "[1.](https://example.com) 研究背景"
])("does not add an automatic prefix to an explicit authored number (%s)", source => {
  setup({ numbering: true });
  const heading = replaceSelectedSubheading(source);
  const original = heading.innerHTML;
  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(item.querySelector(".annotation-markdown-outline-number")).toBeNull();
  expect(item.textContent).toBe(heading.textContent);
  expect(item.getAttribute("aria-label")).toBe(heading.textContent);
  expect(item.title).toBe(heading.textContent);
  controller.sync();
  expect(heading.innerHTML).toBe(original);
});

test.each([
  "2026 年的发展", "1.5 倍提升", "2026.10.13 发布说明", "1.2 参数", "1 标题",
  "一元方差分析", "二项分布", "第一类错误", "第1次测量", "Model 1", "`1.` 是代码示例",
  "A. Methods", "(a) Methods", "I. Methods", "(iv) Methods", "Chapter 5 Results"
])("keeps automatic numbers for ordinary or ambiguous numeric content (%s)", source => {
  setup({ numbering: true });
  replaceSelectedSubheading(source);
  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(item.querySelector(".annotation-markdown-outline-number").textContent).toBe("1.1 ");
});

test("keeps a top-level authored group and its descendants unnumbered during toggles", () => {
  const f = setup({ numbering: true, initialExpanded: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = '<h1>第三章 结果</h1><h2>（一）已有编号</h2><h2>未编号</h2>';
  controller.sync();
  const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
  const originals = [...preview.querySelectorAll("h1,h2")].map(heading => heading.innerHTML);
  expect(items.map(item => item.textContent)).toEqual(["第三章 结果", "（一）已有编号", "未编号"]);
  items[2].focus();
  f.setNumbering(false);
  expect(items.map(item => item.textContent)).toEqual(["第三章 结果", "（一）已有编号", "未编号"]);
  f.setNumbering(true);
  expect(items.map(item => item.textContent)).toEqual(["第三章 结果", "（一）已有编号", "未编号"]);
  expect(document.activeElement).toBe(items[2]);
  expect(f.getExpanded()).toBe(true);
  expect(document.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(0);
  expect([...preview.querySelectorAll("h1,h2")].map(heading => heading.innerHTML)).toEqual(originals);
});

test("suppresses earlier and later siblings with all their descendants while preserving another parent", () => {
  const f = setup({ numbering: true, initialExpanded: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = '<h1>结果</h1><h2>方法</h2><h3>细节</h3><h2>五、分析</h2><h3>统计</h3><h2>局限</h2><h3>风险</h3><h1>讨论</h1><h2>结论</h2>';
  const originals = [...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML);
  controller.sync();
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const items = [...outline.querySelectorAll(".annotation-markdown-outline-item")];
  expect(items.map(item => item.textContent)).toEqual([
    "1 结果", "方法", "细节", "五、分析", "统计", "局限", "风险", "2 讨论", "2.1 结论"
  ]);
  expect(items[1].getAttribute("aria-label")).toBe("方法");
  expect(items[1].title).toBe("方法");
  items[8].focus();
  f.setNumbering(false);
  expect(items[8].textContent).toBe("结论");
  f.setNumbering(true);
  expect(items[8].textContent).toBe("2.1 结论");
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect(document.activeElement).toBe(items[8]);
  expect(f.getExpanded()).toBe(true);
  expect(items[8].querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(1);
  expect([...preview.querySelectorAll("h1,h2,h3")].map(heading => heading.innerHTML)).toEqual(originals);
});

test("confines a lower-level authored group to its parent without suppressing parent headings", () => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = '<h1>研究</h1><h2>方法</h2><h3>五、分析</h3><h4>统计</h4><h3>局限</h3><h4>风险</h4><h2>讨论</h2><h3>结论</h3>';
  controller.sync();
  expect([...document.querySelectorAll(".annotation-markdown-outline-item")].map(item => item.textContent))
    .toEqual(["1 研究", "1.1 方法", "五、分析", "统计", "局限", "风险", "1.2 讨论", "1.2.1 结论"]);
});

test.each([1, 2])("suppresses highest-level peers and leading orphan descendants when the numbered root appears later (H%s)", rootLevel => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = `<h3>前置说明</h3><h4>细节</h4><h2>前置章节</h2><h${rootLevel}>五、结果</h${rootLevel}><h${rootLevel + 1}>方法</h${rootLevel + 1}><h${rootLevel}>讨论</h${rootLevel}><h${rootLevel + 1}>结论</h${rootLevel + 1}>`;
  controller.sync();
  expect(document.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(0);
  expect([...document.querySelectorAll(".annotation-markdown-outline-item")].map(item => item.textContent))
    .toEqual(["前置说明", "细节", "前置章节", "五、结果", "方法", "讨论", "结论"]);
});

test("recomputes sibling-group suppression when an authored number is added or removed", () => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  preview.innerHTML = '<h1>研究</h1><h2>方法</h2><h2>讨论</h2>';
  controller.sync();
  const sibling = preview.querySelectorAll("h2")[1];
  sibling.textContent = "五、讨论";
  controller.sync();
  expect([...document.querySelectorAll(".annotation-markdown-outline-item")].map(item => item.textContent))
    .toEqual(["1 研究", "方法", "五、讨论"]);
  sibling.textContent = "讨论";
  controller.sync();
  expect([...document.querySelectorAll(".annotation-markdown-outline-item")].map(item => item.textContent))
    .toEqual(["1 研究", "1.1 方法", "1.2 讨论"]);
});

test.each(["root", "nested"])("keeps distinct similarly prefixed parent paths independent (%s)", scope => {
  setup({ numbering: true });
  const preview = document.querySelector(".annotation.selected [data-annotation-markdown-preview]");
  if (scope === "root") {
    preview.innerHTML = Array.from({ length: 10 }, (_, index) =>
      `<h1>章节 ${index + 1}</h1><h2>${index === 0 ? "五、分析" : "数据"}</h2>`).join("");
  } else {
    preview.innerHTML = '<h1>研究</h1>' + Array.from({ length: 10 }, (_, index) =>
      `<h2>部分 ${index + 1}</h2><h3>${index === 0 ? "五、分析" : "数据"}</h3>`).join("");
  }
  controller.sync();
  const items = [...document.querySelectorAll(".annotation-markdown-outline-item")];
  expect(items.at(-1).textContent).toBe(scope === "root" ? "10.1 数据" : "1.10.1 数据");
  expect(items[scope === "root" ? 1 : 2].textContent).toBe("五、分析");
});

test.each(["htmlAndMathml", "mathml"])("treats leading math as content but preserves explicit numbering before it (%s)", output => {
  setup({ numbering: true });
  const heading = replaceSelectedSubheading("$1.$ 的意义", output);
  const original = heading.innerHTML;
  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(item.querySelector(".annotation-markdown-outline-number").textContent).toBe("1.1 ");
  expect(item.title).toBe("1.1 $1.$ 的意义");
  expect(heading.innerHTML).toBe(original);

  const numberedHeading = replaceSelectedSubheading("**（一）** $A^{-1}XA=\\Lambda X$ 的性质", output);
  const numberedOriginal = numberedHeading.innerHTML;
  const numberedItem = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(numberedItem.querySelector(".annotation-markdown-outline-number")).toBeNull();
  expect(numberedItem.title).toBe("（一） $A^{-1}XA=\\Lambda X$ 的性质");
  expect(numberedItem.querySelector(output === "mathml" ? "math" : ".katex-html")).not.toBeNull();
  expect(numberedHeading.innerHTML).toBe(numberedOriginal);
});

test("restarts numbering for each selected annotation and retains its choice while disabled", () => {
  const f = setup({ numbering: true, initialExpanded: true });
  f.rows[0].querySelector("h1").textContent = "五、章节概述";
  controller.sync();
  expect(document.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(0);
  f.rows[0].classList.remove("selected");
  f.rows[1].classList.add("selected");
  controller.sync();
  expect([...document.querySelectorAll(".annotation-markdown-outline-item")].map(item => item.textContent))
    .toEqual(["1 后续章节", "1.1 结论", "1.1.1 限制"]);
  f.setEnabled(false);
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  f.setEnabled(true);
  expect(document.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(3);
  expect(f.getExpanded()).toBe(true);
  controller.stop();
  expect(document.querySelector(".annotation-markdown-outline-number, [data-annotation-markdown-outline-target]")).toBeNull();
});

test.each(["htmlAndMathml", "mathml"])("numbers formula titles without altering their math or source (%s)", output => {
  setup({ numbering: true });
  const holder = document.createElement("div");
  holder.innerHTML = createMarkdownRenderer({ getMathOutput: () => output }).render("## 矩阵 $A^{-1}XA=\\Lambda X$ 的性质");
  const heading = holder.querySelector("h2");
  const original = heading.innerHTML;
  document.querySelector(".annotation.selected h2").replaceWith(heading);
  controller.sync();
  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(item.textContent).toBe("1.1 矩阵 A−1XA=ΛX 的性质");
  expect(item.title).toBe("1.1 矩阵 $A^{-1}XA=\\Lambda X$ 的性质");
  expect(item.querySelector(output === "mathml" ? "math" : ".katex-html")).not.toBeNull();
  expect(heading.innerHTML).toBe(original);
});

test("clones visible KaTeX DOM and preserves source TeX in tooltips", () => {
  setup();
  const rendered = document.createElement("div");
  rendered.innerHTML = createMarkdownRenderer({ windowRef: window })
    .render("## [它就是课本上的](https://example.com) $A^{-1}XA=\\Lambda X$ 吗？");
  const heading = rendered.querySelector("h2");
  const sourceKatex = heading.querySelector(".katex");
  expect(heading.querySelector("a")).not.toBeNull();
  expect(heading.querySelector(".katex-mathml")).not.toBeNull();
  expect(heading.querySelector(".katex-html")).not.toBeNull();
  expect(heading.textContent).toContain("\\Lambda");
  document.querySelector(".annotation.selected h2").replaceWith(heading);
  controller.sync();

  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  const outlineKatex = item.querySelector(".katex");
  expect(item.textContent).toBe("它就是课本上的 A−1XA=ΛX 吗？");
  expect(item.title).toBe("它就是课本上的 $A^{-1}XA=\\Lambda X$ 吗？");
  expect(item.getAttribute("aria-label")).toBe(item.textContent);
  expect(item.querySelector("a")).toBeNull();
  expect(outlineKatex).not.toBeNull();
  expect(outlineKatex).not.toBe(sourceKatex);
  expect(outlineKatex.querySelector(".katex-html")).not.toBeNull();
  expect(outlineKatex.querySelector(".katex-mathml")).toBeNull();
  expect(outlineKatex.querySelector("annotation[encoding='application/x-tex']")).toBeNull();
  expect(heading.querySelector(".katex-mathml")).not.toBeNull();
});

test("clones native MathML into the outline without duplicating its TeX annotation", () => {
  setup();
  const rendered = document.createElement("div");
  rendered.innerHTML = createMarkdownRenderer({ windowRef: window, getMathOutput: () => "mathml" })
    .render("## 矩阵 $A^{-1}XA=\\Lambda X$ 的性质");
  const heading = rendered.querySelector("h2");
  const sourceMath = heading.querySelector("math");
  document.querySelector(".annotation.selected h2").replaceWith(heading);
  controller.sync();
  const item = document.querySelectorAll(".annotation-markdown-outline-item")[1];
  expect(item.title).toBe("矩阵 $A^{-1}XA=\\Lambda X$ 的性质");
  expect(item.textContent).toBe("矩阵 A−1XA=ΛX 的性质");
  expect(item.getAttribute("aria-label")).toBe(item.textContent);
  expect(item.querySelector("math")).not.toBeNull();
  expect(item.querySelector("math")).not.toBe(sourceMath);
  expect(item.querySelector("annotation")).toBeNull();
  expect(sourceMath.querySelector("annotation")).not.toBeNull();
});

test("resizes the outline text and available panel width on a live preference change", async () => {
  const { setFontScale } = setup({ viewportWidth: 420, initialExpanded: true });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");

  setFontScale(1.5);
  await nextFrame();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("1.275em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("280px");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  setFontScale(2);
  await nextFrame();
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("1.7em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("290px");

  setFontScale(0.8);
  await nextFrame();
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-font-size")).toBe("0.68em");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
});

test("caps the enlarged outline panel width in a wide reader", () => {
  setup({ viewportWidth: 800, fontScale: 2 });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("320px");
});

function nextFrame() {
  return new Promise(resolve => {
    if (window.requestAnimationFrame) window.requestAnimationFrame(resolve);
    else setTimeout(resolve, 0);
  });
}

test("falls back inside to the left while reserving the sidebar scrollbar", () => {
  setup({ viewportWidth: 420 });
  const outline = document.querySelector("[data-annotation-markdown-outline='true']");

  expect(outline.dataset.side).toBe("left");
  expect(outline.style.left).toBe("298px");
  expect(outline.style.getPropertyValue("--annotation-markdown-outline-panel-width")).toBe("224px");
});

test("keeps the portal mounted at the sidebar viewport while the selected row scrolls away", () => {
  const { rows, scroller } = setup({ initialExpanded: true });
  rows[0].getBoundingClientRect = () => ({ top: -900, bottom: -300 });
  scroller.dispatchEvent(new Event("scroll"));

  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  expect(outline).not.toBeNull();
  expect(outline.parentElement).toBe(document.body);
  expect(outline.style.top).toBe("68px");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);
});

test("persists explicit open and close choices across selected annotations", async () => {
  const { rows, setExpanded, getExpanded } = setup();
  document.querySelector(".annotation-markdown-outline-toggle").click();
  expect(setExpanded).toHaveBeenCalledWith(true);
  expect(getExpanded()).toBe(true);
  expect(document.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  rows[0].classList.remove("selected");
  rows[1].classList.add("selected");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").textContent).toBe("大纲 · 3");
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("true");

  document.querySelector(".annotation-markdown-outline-toggle").click();
  expect(setExpanded).toHaveBeenLastCalledWith(false);
  rows[1].classList.remove("selected");
  rows[0].classList.add("selected");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("false");
});

test("temporarily hides during editing without changing the stored choice", async () => {
  const { rows, setExpanded } = setup({ initialExpanded: true });
  rows[0].querySelector(".comment").classList.add("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(setExpanded).not.toHaveBeenCalled();

  rows[0].querySelector(".comment").classList.remove("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded")).toBe("true");
  expect(setExpanded).not.toHaveBeenCalled();
});

test("prepares a popup outline only when the stable popup is about to reveal", async () => {
  const { setExpanded } = setup({ initialExpanded: true });
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-positioning="true">
    <div class="preview"><div class="comment">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
        <h1>弹窗第一章</h1><p>内容</p><h2>弹窗细节</h2>
      </div>
    </div></div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 390, width: 400, height: 300
  });
  Object.defineProperty(preview, "clientHeight", { configurable: true, value: 200 });
  Object.defineProperty(preview, "scrollHeight", { configurable: true, value: 600 });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 300, width: 380, height: 200
  });
  await flushMutations();

  const popupOutline = popup.querySelector("[data-annotation-markdown-outline='true']");
  expect(popupOutline).toBeNull();
  expect(document.body.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  controller.preparePopup(popup);
  const preparedOutline = document.body.querySelector("[data-annotation-markdown-outline='true']");
  expect(preparedOutline).not.toBeNull();
  expect(preparedOutline.parentElement).toBe(document.body);
  expect(preparedOutline.hidden).toBe(true);
  const outlineBeforeReveal = preparedOutline;
  const outline = outlineBeforeReveal;
  const toggle = outline.querySelector(".annotation-markdown-outline-toggle");
  expect(outline.dataset.context).toBe("popup");
  expect(outline.dataset.side).toBe("right");
  expect(outline.style.left).toBe("506px");
  expect(outline.style.top).toBe("98px");
  expect(outline.querySelector(".annotation-markdown-outline-toggle").getAttribute("aria-expanded"))
    .toBe("true");
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(false);

  popup.removeAttribute("data-annotation-markdown-popup-positioning");
  popup.setAttribute("data-annotation-markdown-popup-ready", "true");
  controller.sync();
  expect(document.body.querySelector("[data-annotation-markdown-outline='true']")).toBe(outlineBeforeReveal);
  expect(outlineBeforeReveal.hidden).toBe(false);
  expect(toggle.closest("[data-annotation-markdown-outline-host-scope='true'].annotation"))
    .not.toBeNull();

  const hostOutsidePointer = vi.fn();
  window.addEventListener("mousedown", hostOutsidePointer);
  const pointer = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  toggle.dispatchEvent(pointer);
  window.removeEventListener("mousedown", hostOutsidePointer);
  expect(pointer.defaultPrevented).toBe(false);
  expect(hostOutsidePointer).not.toHaveBeenCalled();

  outline.querySelector(".annotation-markdown-outline-toggle").click();
  expect(outline.querySelector(".annotation-markdown-outline-panel").hidden).toBe(true);
  expect(setExpanded).toHaveBeenCalledWith(false);
});

test("scrolls the popup preview and cleans the outline while positioning or editing", async () => {
  setup();
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-ready="true">
    <div class="preview"><div class="comment">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
        <h1>弹窗第一章</h1><p>内容</p><h2>弹窗细节</h2>
      </div>
    </div></div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const comment = popup.querySelector(".comment");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 390, width: 400, height: 300
  });
  Object.defineProperties(preview, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, writable: true, value: 40 }
  });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 300, width: 380, height: 200
  });
  preview.scrollTo = vi.fn();
  preview.querySelector("h2").getBoundingClientRect = () => ({ top: 250 });
  await flushMutations();

  document.querySelectorAll(".annotation-markdown-outline-item")[1].click();
  expect(preview.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 182, behavior: "smooth" });

  popup.removeAttribute("data-annotation-markdown-popup-ready");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  popup.setAttribute("data-annotation-markdown-popup-ready", "true");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();

  comment.classList.add("annotation-markdown-fast-editing");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test.each([
  [false, "弹窗细节", "弹窗细节", 0],
  [true, "弹窗细节", "1.1 弹窗细节", 1],
  [true, "（一）弹窗细节", "（一）弹窗细节", 0]
])("keeps popup outline controls mounted when the host replaces equivalent preview DOM (numbering: %s, heading: %s)", async (numbering, heading, label, prefixCount) => {
  setup({ initialExpanded: true, numbering });
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-ready="true">
    <div class="preview"><div class="comment">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
        <h1>弹窗第一章</h1><p>内容</p><h2>${heading}</h2>
      </div>
    </div></div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 390, width: 400, height: 300
  });
  Object.defineProperties(preview, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, writable: true, value: 40 }
  });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 300, width: 380, height: 200
  });
  await flushMutations();

  const outline = document.querySelector("[data-annotation-markdown-outline='true']");
  const item = outline.querySelectorAll(".annotation-markdown-outline-item")[1];
  const replacement = preview.cloneNode(true);
  Object.defineProperties(replacement, {
    clientHeight: { configurable: true, value: 200 },
    scrollHeight: { configurable: true, value: 600 },
    scrollTop: { configurable: true, writable: true, value: 40 }
  });
  replacement.getBoundingClientRect = preview.getBoundingClientRect;
  replacement.scrollTo = vi.fn();
  replacement.querySelector("h2").getBoundingClientRect = () => ({ top: 250 });
  preview.replaceWith(replacement);
  await flushMutations();

  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBe(outline);
  expect(document.querySelectorAll(".annotation-markdown-outline-item")[1]).toBe(item);
  expect(item.title).toBe(label);
  expect(item.textContent).toBe(label);
  expect(item.querySelectorAll(".annotation-markdown-outline-number")).toHaveLength(prefixCount);
  expect(item.isConnected).toBe(true);

  item.click();
  expect(replacement.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 182, behavior: "smooth" });
});

test("does not replace the sidebar outline for a non-overflowing ready popup", async () => {
  setup();
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup" data-annotation-markdown-popup-ready="true">
    <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true" style="overflow-y:auto">
      <h1>短弹窗</h1><h2>无需导航</h2>
    </div>
  </div>`);
  const popup = document.querySelector(".annotation-popup");
  const preview = popup.querySelector("[data-annotation-markdown-preview='true']");
  popup.getBoundingClientRect = () => ({
    left: 100, top: 90, right: 500, bottom: 290, width: 400, height: 200
  });
  Object.defineProperties(preview, {
    clientHeight: { configurable: true, value: 160 },
    scrollHeight: { configurable: true, value: 160 }
  });
  preview.getBoundingClientRect = () => ({
    left: 110, top: 100, right: 490, bottom: 260, width: 380, height: 160
  });
  await flushMutations();

  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test("hides when the annotation tab is not visible while a page popup is open", async () => {
  const { scroller, setExpanded } = setup({ initialExpanded: true });
  const panel = document.querySelector("#annotation-tab-panel");
  document.body.insertAdjacentHTML("beforeend", `<div class="annotation-popup">
    <div class="annotation selected">
      <div class="annotation-markdown-rendered" data-annotation-markdown-preview="true"><h1>页内</h1><h2>弹窗</h2></div>
    </div>
  </div>`);

  panel.setAttribute("aria-hidden", "true");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  panel.removeAttribute("aria-hidden");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  document.querySelector(".annotation-popup").remove();
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();

  panel.style.display = "none";
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  panel.style.display = "";
  scroller.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0
  });
  panel.classList.add("inactive");
  await flushMutations();

  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(setExpanded).not.toHaveBeenCalled();
});

test("does not create an outline for one heading, multiple selection, or disabled rendering", async () => {
  const { rows } = setup();
  rows[0].querySelector("h2").remove();
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  rows[0].classList.remove("selected");
  rows[1].classList.add("selected");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).not.toBeNull();
  rows[0].classList.add("selected");
  await flushMutations();
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();

  controller.stop();
  controller = undefined;
  setup({ enabled: false });
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
});

test("scrolls only the annotation sidebar to a chosen heading", () => {
  const { scroller } = setup({ initialExpanded: true });
  Object.defineProperty(scroller, "scrollTop", { configurable: true, writable: true, value: 100 });
  scroller.getBoundingClientRect = () => ({ top: 20 });
  scroller.scrollTo = vi.fn();
  const headings = [...document.querySelectorAll("[data-annotation-markdown-preview='true'] h1, [data-annotation-markdown-preview='true'] h2")];
  headings[1].getBoundingClientRect = () => ({ top: 220 });

  document.querySelectorAll(".annotation-markdown-outline-item")[1].click();

  expect(scroller.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 292, behavior: "smooth" });
  expect(document.querySelectorAll(".annotation-markdown-outline-item")[1].getAttribute("aria-current")).toBe("location");
});

test("removes its own UI and heading markers on shutdown", () => {
  setup({ initialExpanded: true });
  expect(document.querySelectorAll("[data-annotation-markdown-outline-target]")).toHaveLength(2);
  controller.stop();
  controller = undefined;
  expect(document.querySelector("[data-annotation-markdown-outline='true']")).toBeNull();
  expect(document.querySelector("[data-annotation-markdown-outline-target]")).toBeNull();
});
