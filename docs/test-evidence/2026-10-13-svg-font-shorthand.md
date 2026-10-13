# SVG font shorthand validation / SVG 字体简写验证

Date / 日期: 2026-10-13

## Scope

- Expand restricted `font` declarations in supported SVG class rules into validated `font-style`, `font-weight`, `font-size` and `font-family` attributes in the preview copy. Omitted style and weight reset to `normal`; stylesheet order and SVG inheritance remain intact. The reset behavior follows the [CSS Fonts shorthand specification](https://www.w3.org/TR/css-fonts-4/#font-prop) for the supported longhands.
- Preserve the supplied 1200 × 880 EFA table as [a regression fixture](../../tests/fixtures/efa-font-shorthand.svg), including all six font shorthands. Its SHA-256 matches the original attachment: `cf3e5ae68acac6d684b41f9b8b1ef84a075d7b944c559b6889d28060d8dd1b52`.
- Accept numeric sizes in `px`, `pt`, `em` and `%`, unitless zero, optional supported style/weight tokens, and quoted or simple font-family lists. Reject unsupported syntax, functions, system fonts, line heights, font variants/stretch and malformed family names. All expanded longhands count toward the existing 1,024-declaration limit; unused and overridden declarations still undergo validation.

## Verification

- `tests/svg-font-shorthand.test.js` covers the original fixture in explicit/unlabeled fences and raw SVG; source preservation; optional token order, units, case and family lists; reset/override/inheritance behavior; unsupported or malformed input; and complexity bounds.
- `pnpm run verify` passed: **34 test files / 786 tests**, TypeScript, five bilingual documentation pairs, build and local XPI packaging. The development build retains version 0.14.3. Published `updates.json` was restored byte for byte after packaging.
- In Zotero 10.0.6 / Firefox 140, the original SVG and the new renderer's isolated image decoded at 1200 × 880 in the dedicated development profile's actual `resource://zotero/reader/reader.html` window. Canvas comparison found **0 changed pixels out of 1,056,000**, with a maximum channel difference of 0.
- The generated SVG has 129 elements and no remaining stylesheets or class attributes. No SVG or stylesheet nodes enter the preview HTML; the fixture remains unchanged. Native JSON evidence, comparison PNGs, the tested renderer bundle and the local XPI are retained under `output/svg-font-shorthand-qa/`.

## Limits

The native check executes the renderer bundle in the dedicated development Reader. It does not install the new XPI into the normal profile or exercise a saved annotation's full editing lifecycle. Install the local test XPI and enable **Render SVG diagrams (Experimental)** for that manual check. No version bump or publication occurred.

## 中文

- 在支持的 SVG 类规则中，把受限 `font` 简写展开为经过校验的 `font-style`、`font-weight`、`font-size` 和 `font-family` 属性，仅作用于预览副本。省略的字形、字重重置为 `normal`，保留样式表顺序与 SVG 继承；支持的属性遵循 [CSS Fonts 简写规范](https://www.w3.org/TR/css-fonts-4/#font-prop)的重置行为。
- [回归样例](../../tests/fixtures/efa-font-shorthand.svg)保留用户提供的 1200 × 880 EFA 表格和六处字体简写，SHA-256 与原始附件一致：`cf3e5ae68acac6d684b41f9b8b1ef84a075d7b944c559b6889d28060d8dd1b52`。
- 支持 `px`、`pt`、`em`、`%` 数值字号、不带单位的零、可选的受支持字形/字重值，以及带引号或简单名称组成的字体族列表。拒绝不支持的语法、函数、系统字体、行高、字体变体/拉伸和格式错误的字体名。展开后的属性计入原有 1,024 条声明上限；未使用或被覆盖的声明也须通过校验。
- `tests/svg-font-shorthand.test.js` 覆盖原图在明确/无语言围栏和裸 SVG 中的预览、源码保留、可选值顺序、单位、大小写、字体族列表、重置/覆盖/继承，以及不支持或错误的输入和复杂度边界。
- `pnpm run verify` 全部通过：**34 个测试文件、786 项测试**、TypeScript、五组双语文档、构建和本地 XPI 打包。开发构建保留 0.14.3 版本，打包后逐字节恢复已发布的 `updates.json`。
- 在 Zotero 10.0.6 / Firefox 140 独立开发配置的实际 Reader 窗口中，原图与新渲染器生成的隔离图片均以 1200 × 880 解码；1,056,000 个像素中 **0 个不同**，通道最大差值为 0。
- 生成的 SVG 含 129 个元素，无残留样式表或类属性；预览 HTML 不挂载 SVG/样式表节点，样例保持原样。原生 JSON 证据、对比 PNG、测试渲染器构建及本地 XPI 保留在 `output/svg-font-shorthand-qa/`。
- 原生验证是在独立开发 Reader 中运行渲染器构建，未安装到日常配置，也未验证保存批注的完整编辑流程。安装本地测试包并开启 **渲染 SVG 图示（实验性）** 后，可手工核对该流程。本次未升级版本或发布。
