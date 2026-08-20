# Zotero Annotation Markdown

<p align="center">
  <img src="addon/icons/annotation-markdown.svg" width="64" height="64" alt="Zotero Annotation Markdown 图标">
</p>

[English](README.md) | 简体中文

将 Zotero 阅读器侧栏里的标注评论渲染为 Markdown 和 LaTeX 数学公式，同时不改变 Zotero 实际保存的标注原文。

## 主要功能

- 在 PDF 和 EPUB 阅读器标注侧栏中预览 Markdown 与 LaTeX 数学公式。
- 在渲染预览中自动把裸 URL 转为可点击链接。
- 使用[快速源码编辑器](docs/zh-CN/user-guide.md#为什么替代编辑器可以更快)，在侧栏标签很多的书籍中仍能保持响应速度。
- 可以调整预览字号和标注渲染策略。
- 渲染内容经过清理，渲染失败时保留纯文本。
- 支持 Zotero Desktop 9.0 和 10.0.x。本版优先在 Zotero 10 上验证；Zotero 9 无法使用快速编辑能力时会自动回退原生编辑器。

## 安装

推荐在 Zotero 插件市场中搜索 `Zotero Annotation Markdown` 并安装。

也可以从[最新 GitHub Release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest)下载 `zotero-annotation-markdown.xpi`。在 Zotero 中打开 **工具 → 插件**，然后把 `.xpi` 文件拖入插件窗口。

## 文档

- [使用指南](docs/zh-CN/user-guide.md)
- [架构与文件职责](docs/zh-CN/architecture.md)
- [开发与发布](docs/zh-CN/development.md)
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
