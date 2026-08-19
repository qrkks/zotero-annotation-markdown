# 使用指南

[English](../en/user-guide.md)

## 支持的行为

- PDF 和 EPUB 阅读器侧栏里的标注评论默认按 Markdown 渲染。
- LaTeX 数学公式默认启用，支持 `$...$`、`$$...$$`、`\(...\)` 和 `\[...\]` 分隔符。
- 单个换行会保留为可见换行。
- 裸 URL 会在渲染预览中自动变成可点击链接。
- 编辑标注时显示原始 Markdown 源码。
- 不信任原始 HTML，渲染结果会经过清理。
- Markdown 渲染失败时保留原始纯文本。

## 安装

推荐在 Zotero 插件市场中搜索 `Zotero Annotation Markdown` 并安装。

也可以从[最新 GitHub Release](https://github.com/qrkks/zotero-annotation-markdown/releases/latest)下载 `zotero-annotation-markdown.xpi`。在 Zotero 中打开 **工具 → 插件**，然后把 `.xpi` 文件拖入插件窗口。

## 设置

打开 Zotero 设置并选择 **Annotation Markdown** 面板。当前设置包括：

- 是否渲染标注评论中的 Markdown；
- 是否把剪贴板内容以纯文本形式粘贴到评论中；
- 是否渲染 LaTeX 数学公式；
- 把预览字号调整为 80% 到 150%；
- 选择标注渲染策略。

渲染策略包括：

- **自动（推荐）：** 较小的标注集合会提前渲染，较大的标注集合采用视窗懒加载。
- **渲染全部标注：** 调度所有标注预览进行渲染。
- **仅渲染视窗附近：** 标注接近侧栏可见区域时才进行渲染。

设置会自动保存。如果阅读器没有反映新的设置，可以关闭并重新打开该阅读器，或重启 Zotero。

## 预览与编辑状态

标注未处于编辑状态时，评论显示为渲染后的预览。聚焦 Zotero 原生评论编辑器后，会恢复显示原始 Markdown 源码。标注折叠时仍沿用 Zotero 的紧凑显示方式。

插件只改变显示方式；Zotero 保存的 Markdown 源码不会被生成的 HTML 替换。

## 兼容性

当前实现支持 Zotero Desktop 9.0 和 10.0.x，已在 Windows 上使用 Zotero 9.0.6 和 10.0.0 测试。

阅读器侧栏 DOM 不是完全稳定的公开 API。即使自动化测试通过，Zotero 更新后仍应重新进行真实环境验证。
