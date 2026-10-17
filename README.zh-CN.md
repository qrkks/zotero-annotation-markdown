# Zotero Annotation Markdown

<p align="center">
  <img src="addon/icons/annotation-markdown.svg" width="64" height="64" alt="Zotero Annotation Markdown 图标">
</p>

<p align="center">
  <a href="https://github.com/qrkks/zotero-annotation-markdown/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/qrkks/zotero-annotation-markdown?display_name=tag&amp;sort=semver"></a>
  <a href="https://github.com/qrkks/zotero-annotation-markdown/releases/latest"><img alt="最新版下载量" src="https://img.shields.io/github/downloads/qrkks/zotero-annotation-markdown/latest/total?label=latest%20downloads"></a>
  <a href="https://github.com/qrkks/zotero-annotation-markdown/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/qrkks/zotero-annotation-markdown/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="docs/zh-CN/user-guide.md#兼容性"><img alt="Zotero 9 和 10" src="https://img.shields.io/badge/Zotero-9%20%7C%2010-CC2936?logo=zotero&amp;logoColor=white"></a>
  <a href="LICENSE"><img alt="MIT 协议" src="https://img.shields.io/github/license/qrkks/zotero-annotation-markdown?label=license"></a>
</p>

[English](README.md) | 简体中文

用 Markdown 标题、列表、彩色高亮、LaTeX 公式和实验性 SVG 示意图，让 Zotero 标注评论更清晰易读。渲染时保留 Zotero 保存的标注原文，源码仍可继续编辑。

> 本项目正在持续开发和维护中。如果你遇到 Bug、渲染或兼容性问题，或者有功能建议，欢迎[提交 Issue](https://github.com/qrkks/zotero-annotation-markdown/issues) 与我们交流。提供 Zotero 和插件版本、复现步骤以及最小示例（如 Markdown、LaTeX 或 SVG）将有助于我们更高效地定位问题。

## 功能预览

![同一条 Zotero 标注的 Markdown 源码与渲染预览，展示标题、彩色高亮和 LaTeX 公式](docs/images/source-and-preview.webp)

**左侧**：编辑 Markdown 源码。**右侧**：阅读排版后的预览。离开编辑器或按 **Esc** 即可保存并返回预览。

| 浮动大纲 | 页内标注弹窗 |
| --- | --- |
| <img src="docs/images/floating-outline.webp" width="420" alt="包含多级标题和彩色高亮的长标注，以及对应的浮动大纲"> | <img src="docs/images/popup-preview.webp" width="420" alt="页内标注弹窗中的 Markdown 排版、彩色高亮和 LaTeX 公式预览"> |
| 点击大纲条目，直接跳转到标注侧栏内的对应章节。 | 在设置中开启 **Render page annotation popups as Markdown** 即可使用；该选项默认关闭。 |

上面的 Markdown、大纲和弹窗截图使用演示文本，取自 Zotero 10.0.5 与 Annotation Markdown v0.11.0，预览字号设为 125%。

![左侧为可编辑的 Markdown 和 SVG 围栏源码，右侧为同一条标注渲染后的奇异值分解示意图](docs/images/svd-source-and-preview-7e2b47b8.webp)

**SVG 示意图**：在批注中展示奇异值分解（SVD）等数学图示。编辑 Markdown 与 SVG 围栏源码（**左侧**），离开编辑器或按 **Esc** 后查看渲染结果（**右侧**）。原始 SVG 源码仍可继续编辑。

SVG 渲染是默认关闭的实验性功能。在设置中开启 **渲染 SVG 图示（实验性）**，即可尝试 [SVD 示例](docs/examples/svd.md)、[六个围栏 SVG 样例](docs/examples/svg-samples.md)或[六个裸 SVG 样例](docs/examples/svg-raw-samples.md)。

SVG 渲染分为完整预览、带持续提示的兼容预览，以及带原因的源码回退。兼容提示在大图查看器中也会显示，原始源码保持不变。详见[支持的 SVG 子集](docs/zh-CN/user-guide.md#svg-示意图实验性)。

从 v0.14.2 起，完整 SVG 独立占一行或多行即可，不必添加围栏或空行。这些 SVD 截图使用英文演示文字，取自 Zotero 10.0.6 与 Annotation Markdown v0.15.1。

<details>
<summary>查看 SVG 大图查看器</summary>

![左侧为 SVD 标注预览，右侧为带缩放按钮、比例显示和 Fit 按钮的大图查看器](docs/images/svg-preview-and-viewer.webp)

点击 SVG 图片或 **View larger** 查看图形细节。v0.13.1 支持用 **− / +** 或滚轮同时缩放图片和浮层，点击 **Fit** 恢复完整视图；图片超出 Reader 可用空间后可拖动平移。按 **Esc** 或点击 **Close** 返回标注。

</details>

## 主要功能

### 阅读预览

- **Markdown 与公式**：在 PDF 和 EPUB 标注侧栏中渲染 Markdown 与 LaTeX 数学公式。
- **高亮与链接**：使用 `==高亮文字==` 或 `==高亮文字=={.red}` 等预设颜色；裸 URL 自动转为可点击链接。
- **图片链接**：独立成段的图片链接会显示预览，包括没有文件扩展名的 OpenAI 图片链接；保留标题和原始链接，加载失败时回退到链接。复制来的 Google 网站图标链接会以小图标与简短站点名同行显示，不计入图片数量。
- **SVG 示意图（实验性）**：预览代码块或独立 SVG 源码中的静态图形，并提供大图查看器。默认关闭；详见[支持的 SVG 子集](docs/zh-CN/user-guide.md#svg-示意图实验性)。
- **页内标注弹窗**：可选择将弹窗评论渲染为 Markdown，默认关闭。

### 编辑与导航

- **浮动大纲**：按标题跳转，可调整大纲字号并添加层级序号。含图片的章节显示 `IMG`、`SVG` 或 `IMG · SVG`，悬停可分别查看数量；文内和侧栏的对应标签显示整条标注的总数。智能编号会跳过含已有序号的兄弟组及其全部子孙。
- **快速源码编辑**：使用[快速评论编辑器](docs/zh-CN/user-guide.md#为什么替代编辑器可以更快)编辑原始 Markdown，无法使用时回退 Zotero 原生编辑器。
- **待办标签**：可按已保存评论中的 `todo:` 或 `t:` 行自动添加 `todo` 标签。
- **标签筛选加速（实验性）**：Reader 通过兼容性检查时，加速超大标注列表取消标签筛选后的恢复。默认关闭，不兼容时回退原生列表。

### 设置与兼容

- **预览控制**：侧栏与弹窗渲染可独立开关，并可调整预览字号和渲染策略。
- **公式输出**：默认使用 KaTeX HTML + MathML；可选择原生 MathML 降低公式渲染开销，但间距和外观可能有所不同。
- **界面语言**：设置页跟随 Zotero 的语言，目前支持英文和简体中文。
- **安全渲染**：预览经过清理，保存的源码保持不变，渲染失败时回退为纯文本。
- **Zotero 兼容**：支持 Zotero Desktop 9.0 和 10.0.x，目前优先在 Zotero 10 上验证；详见[兼容性说明](docs/zh-CN/user-guide.md#兼容性)。

## 安装

推荐在 Zotero 插件市场中搜索 `Zotero Annotation Markdown` 并安装。

也可以从[最新 GitHub Release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest)下载 `zotero-annotation-markdown.xpi`。在 Zotero 中打开 **工具 → 插件**，然后把 `.xpi` 文件拖入插件窗口。

## 文档

- [使用指南](docs/zh-CN/user-guide.md)
- [架构与文件职责](docs/zh-CN/architecture.md)
- [开发与发布](docs/zh-CN/development.md)
- [本地化与翻译贡献](docs/zh-CN/localization.md)
- [性能诊断](docs/zh-CN/performance-diagnostics.md)
- [文档索引与翻译规则](docs/README.md)

## 快速开发

```powershell
pnpm install
pnpm test
pnpm run build
pnpm run package
```

打包后的插件位于 `dist/zotero-annotation-markdown.xpi`。

## 许可证

[MIT](LICENSE)
