# 性能诊断

[English](../en/performance-diagnostics.md)

插件提供一份需要手动启用的性能日志，用于诊断阅读器滚动、标注渲染和编辑缓慢等问题。它面向开发和错误报告，不建议日常保持开启。

## 隐私警告

诊断日志可能包含标注标识符、DOM 类名，以及抽样标注评论的内容片段（每条最多 300 个字符）。公开分享前必须检查并脱敏。如果日志包含私人研究笔记或文档内容，请勿直接上传完整文件。

## 启用诊断

1. 打开 Zotero **设置 → 高级 → Config Editor**。
2. 搜索 `extensions.annotationMarkdown.performanceDiagnostics`。
3. 把该首选项设为 `true`。
4. 关闭并重新打开阅读器，然后开始一次干净的复现。

测试结束后，把该首选项恢复为 `false`。插件能够观察首选项变化，但重新打开阅读器可以建立清晰的生命周期，避免混合旧控制器状态和新状态。

Zotero 支持文档介绍了 [Config Editor](https://www.zotero.org/support/preferences/advanced) 和[隐藏首选项的使用方法](https://www.zotero.org/support/preferences/hidden_preferences)。

## 查找和重置日志

日志文件名为：

```text
annotation-markdown-debug.log
```

它直接存放在当前 Zotero 配置目录中，而不是 Zotero 数据目录中。常见配置目录为：

```text
Windows: C:\Users\<用户名>\AppData\Roaming\Zotero\Zotero\Profiles\<随机字符串>
macOS:   /Users/<用户名>/Library/Application Support/Zotero/Profiles/<随机字符串>
Linux:   ~/.zotero/zotero/<随机字符串>
```

如果存在多个配置，请参阅 Zotero 的[配置目录说明](https://www.zotero.org/support/kb/profile_directory)。

当前日志达到 5 MiB 时会自动轮换。插件只保留一个名为 `annotation-markdown-debug.log.1` 的备份，因此诊断日志总占用约限制在 10 MiB。采集干净日志时：

1. 关闭 Zotero。
2. 重命名或删除 `annotation-markdown-debug.log`。
3. 启动 Zotero，只复现一次问题。
4. 关闭发生问题的阅读器，使生命周期结束信息写入日志。

Zotero 关闭时可以安全删除当前日志及其 `.1` 备份；它们只包含诊断信息，并会在需要时重新创建。

即使性能诊断没有启用，日志中也可能出现部分启动和生命周期消息。详细的 `perf` 和 `edit` 条目只会在上述首选项启用后产生。

## 采集有效的复现记录

尽量分别记录每种操作：

1. 打开 PDF 或 EPUB，等待标注侧栏稳定。
2. 从上到下滚动标注侧栏。
3. 点击页面标记，等待侧栏跳转到对应标注。
4. 编辑一条较长的标注，连续输入几秒钟；先开启更快的替代编辑器，再关闭它进行对比。
5. 折叠并展开较长标注，然后滚动离开并返回。
6. 关闭阅读器。

记下每次操作的大致时间，以便把看到的停顿与日志时间戳对应起来。

## 阅读日志

每行以 ISO 时间戳开头。最重要的条目类型包括：

| 条目 | 含义 |
| --- | --- |
| `perf renderNow` | 同步 DOM 扫描和渲染调度。`durationMs` 不包含 eager 或 lazy 模式中之后执行的全部空闲任务。 |
| `perf lazyRender` | 自适应空闲渲染批次，以及累计的渲染和缓存统计。 |
| `edit pause` | 标注评论编辑器处于活动状态时暂停渲染观察；这里既可能是更快的替代编辑器，也可能是 Zotero 原生编辑器。 |
| `edit resume` | 编辑结束，插件重新协调受影响的标注。 |
| `edit paused mutations` | 暂停编辑区间附近的 DOM 变更摘要，并不等于每次按键的计数。 |

### 渲染字段

| 字段 | 解释 |
| --- | --- |
| `mode` | 根据渲染策略和标注数量显示 `sync`、`eager` 或 `lazy`。 |
| `nodes`, `handled`, `filtered` | 扫描到、处理或排除的候选评论节点数量。 |
| `batchNodes` | 一个自适应空闲批次，目前为一至四条标注。 |
| `totalNodes` | 当前控制器生命周期内累计渲染的标注数。 |
| `cachedNodes` | 从渲染 HTML 缓存中命中的节点数。 |
| `markdownMs` | 源码标准化、Markdown/KaTeX 转换和内容清理的累计时间。 |
| `domMs` | 把渲染 HTML 或占位节点应用到阅读器 DOM 的累计时间。 |
| `p50Ms`, `p95Ms`, `maxMs` | 单条标注渲染耗时的分布。 |
| `slowNodes` | 测得渲染工作至少耗时 16 ms 的标注数。 |
| `sourceChars` | 累计处理的源码字符数。 |
| `mountedPreviews` | 当前挂载在 DOM 中的完整渲染预览数。 |
| `placeholders` | 当前用轻量占位节点代替完整预览的数量。 |
| `cacheEntries`, `cacheBytes` | 渲染缓存条目数和估算缓存大小。 |
| `offscreenEntries`, `offscreenBytes` | 视窗外缓存条目数和估算大小。 |

`cacheBytes` 和 `offscreenBytes` 是根据保留字符串和固定权重计算的估算值，适合比较不同测试，但**不是** Zotero 进程的真实内存占用。测量实际内存和内存泄漏时，应使用操作系统工具或性能分析器。

### 编辑字段

| 字段 | 解释 |
| --- | --- |
| `pausedForMs` | 编辑期间插件暂停渲染观察的时间。 |
| `commentNodes` | 开始编辑时存在的标注评论节点数。 |
| `renderedPreviews`, `placeholders` | 编辑边界处已挂载的插件预览状态。 |
| `batches`, `mutations` | 暂停区间附近汇总的 MutationObserver 活动。 |
| `activeEditorMutations` | 与当前标注评论编辑器相关的 DOM 变更。 |
| `pluginOwnedMutations` | 与本插件所有 DOM 相关的变更。 |

## 解读常见模式

- `markdownMs` 很高而 `domMs` 相对较低，通常指向 Markdown、数学公式或内容清理工作。
- `domMs` 很高，尤其伴随大量 `mountedPreviews` 时，通常指向 DOM 插入、样式或布局压力。
- `cacheEntries` 增长但估算字节数稳定通常属于正常现象。如果关闭阅读器后仍持续增长，或多次干净复现之间不断增长，应使用真实内存分析器进一步调查。
- `cachedNodes` 很高但仍能看到停顿，说明 HTML 转换缓存有效，但 DOM 重建或浏览器布局仍可能较慢。
- 如果开启更快的替代编辑器后输入仍然缓慢，应取消勾选 **Use the fast annotation comment editor**，并在同一标注中对比。两种模式差异很大，通常可以隔离 Zotero 原生编辑器的成本；两种模式表现相近，则更可能与保留 DOM、布局、其他插件或 Reader 本身有关。只有在第二轮对比时才需要禁用整个插件。
- lazy 或 eager 模式下单次较慢的 `renderNow durationMs` 并不代表全部后台渲染时间，还需结合后续 `perf lazyRender` 条目判断。

## 分享诊断报告

请提供：

- Zotero 版本、操作系统和插件版本；
- 选择的渲染策略；
- 是否开启更快的替代编辑器，以及关闭后的对比结果；
- 大致标注数量，以及是否有评论跨越多个视窗；
- 准确的复现步骤和大致时间；
- 最小范围的相关日志片段；
- 禁用插件后问题是否仍然发生。

分享前请删除标注文本片段、标注键或 ID、文档标题、路径以及其他敏感元数据。采集结束后，应关闭该首选项，并删除不再需要的日志。
