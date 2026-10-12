# SVG class styles validation / SVG 类样式验证

Date / 日期: 2026-10-12

## Scope

- Add bounded `.class` selectors and comma groups to the existing optional static SVG preview. Reuse presentation-attribute validation, flatten class rules only in the preview copy, preserve stylesheet order and SVG inheritance, and retain restricted embedded fonts.
- The persisted [EFA fixture](../../tests/fixtures/efa-class-styles.svg) reproduces the supplied 1120 × 1200 diagram with 13 class rules, Chinese labels, colored nodes, dashed return paths and local arrow markers.
- Unsupported selectors, properties, external references, escapes and `!important` remain source-code fallbacks. Limits are 256 class rules, 1,024 declarations, 16 selectors per group and 16 classes per element, in addition to existing SVG/font limits.

## Pre-release automated and native checks

- `tests/svg-class-styles.test.js` covers explicit/unlabeled fences and raw SVG; unchanged source fallback; grouped selectors, repeated declarations, class-list independence, inheritance and multiple stylesheet order; fonts and local references; unsupported CSS, original attribute restrictions and complexity bounds.
- The full test suite, TypeScript check, bilingual documentation check, build and local XPI packaging passed using a development build based on 0.14.2. During that initial validation no version bump or publication was performed; published `updates.json` was restored after local packaging.
- In Zotero 10.0.6, using the dedicated development profile and its real `resource://zotero/reader/reader.html` window, the source SVG and renderer-generated isolated image both decoded at 1120 × 1200. Canvas comparison found **0 changed pixels out of 1,344,000**, with a maximum channel difference of 0. Visual inspection confirmed Chinese text, colors, dashed paths and arrows.
- The preview SVG contains 65 elements, no class attributes and no class stylesheet. No SVG or stylesheet nodes enter the preview HTML. The fixture file is unchanged.
- The local XPI contains the new class parser and existing image viewer. Generated images and native JSON evidence are retained under `output/svg-class-styles-qa/` locally.

## Limits and manual check

The native comparison exercises the renderer bundle in the development Reader window. It does not install the new XPI into the user's normal profile or validate a saved library annotation end to end. For an end-to-end check in your normal profile, install the XPI, enable **Render SVG diagrams (Experimental)**, paste the fixture as a complete SVG comment, and check preview, larger-image viewing and source editing.

## 中文

- 为现有可选的静态 SVG 预览增加受限的 `.class` 选择器和逗号分组；复用表现属性验证，仅在预览副本中展开类规则，遵循样式表顺序和 SVG 继承，保留受限的内嵌字体支持。
- [EFA 回归样例](../../tests/fixtures/efa-class-styles.svg)保留用户提供的 1120 × 1200 图示，包含 13 条类规则、中文标签、彩色节点、虚线返回路径和局部箭头。
- 不支持的选择器、属性、外部引用、转义及 `!important` 仍回退为源码。除现有 SVG/字体限制外，增加最多 256 条类规则、1,024 条声明、每组 16 个选择器和每个元素 16 个类名的限制。
- 自动测试覆盖明确/无语言围栏和裸 SVG、原始源码保留、分组及重复声明、类名顺序无关、继承、多张样式表顺序、字体和局部引用，以及不支持的 CSS、原始属性限制和复杂度上限。发布前使用基于 0.14.2 的开发构建，完整测试、类型检查、双语文档检查、构建及本地 XPI 打包均通过；这次初步验证未升级版本或发布，打包后恢复了已发布的 `updates.json`。
- 在 Zotero 10.0.6 独立开发配置的实际 Reader 窗口中，原图和转换后图片均以 1120 × 1200 解码；1,344,000 个像素中 **0 个不同**，通道最大差值为 0。目视确认中文、颜色、虚线和箭头正常。
- 预览 SVG 保留 65 个元素，不含类属性或类样式表；预览 HTML 不挂载 SVG/样式表节点，回归文件保持原样。本地 XPI 包含新的类规则解析器和原有图片查看器；图片及原生 JSON 证据保留在本地 `output/svg-class-styles-qa/`。
- 原生比较是在开发 Reader 中运行渲染器构建，未向用户日常配置安装新 XPI，也未验证实际保存的批注全流程。在日常配置中核对全流程时，可安装 XPI、开启 **渲染 SVG 图示（实验性）**，把样例粘贴为完整 SVG 评论，核对预览、大图查看和源码编辑。
