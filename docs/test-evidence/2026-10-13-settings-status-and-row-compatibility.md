# MathML label and native-row compatibility / MathML 标签与原生行兼容性

Date / 日期: 2026-10-13

## Decision and behavior

Remove **Experimental** only from the native MathML output choice. Standard KaTeX HTML + MathML remains the default; saved preference values and the layout-difference description are unchanged. SVG and native-row acceleration keep their experimental labels and off-by-default behavior.

Native-row acceleration no longer requires Zotero 10.0.3. The controller probes the Reader regardless of the reported Zotero version; that version is retained only in diagnostic logs. React **18.3.1**, required React/browser APIs, annotation fiber signatures, writable memo metadata, sibling-component consistency, and at least **100** cached unselected row heights remain required. This change does not expand the acceleration to Reader startup or ordinary selection/scrolling.

The controller owns the runtime before calling its startup method. If startup throws after patching the annotation component, stopping the partial runtime restores the original component and removes its listeners and state. Historical performance reports describe their original version-gated implementation and remain unchanged.

## Validation and limits

- `pnpm run verify` passed **35 test files / 941 tests**, type checking, five bilingual documentation pairs, build and package. `pnpm audit --prod` reported no known vulnerabilities; `git diff --check` passed.
- Controller regressions cover probing with several Zotero version values and missing version metadata. Runtime regressions reject a different React version, missing hooks/APIs, incompatible fiber shapes, immutable memo metadata, and inconsistent sibling components before modifying the native component. A real runtime fixture exercises cleanup after a startup exception.
- Fluent tests check both language labels: native MathML has no experimental suffix; SVG and native-row acceleration retain theirs. Existing math semantics, live switching, scrolling, editing, and sanitization regressions pass.
- A dedicated Windows / Zotero **10.0.6** Reader exposed React **18.3.1** and **19** native rows. Evaluating the current page runtime passed its actual host checks and returned `active: true`, `cachedRows: 0`. Stopping it restored the inspected component functions, removed the runtime global, and retained the fixture comment unchanged. The Reader and development profile were closed afterward.
- The native run proves host compatibility and startup/cleanup, **not filter-clear speed**. Its row count is below the minimum cache threshold, so no placeholder restoration was activated. The earlier large-list measurements remain evidence for Zotero 10.0.3 only; other versions still require manual large-list performance checks.

The local XPI and full verification log are in the ignored `.tmp/settings-status-and-row-compatibility/` directory. Packaging restored the published root `updates.json`; no version bump, push, or release is included.

## 中文

只移除原生 MathML 输出选项的 **实验性** 标签，默认仍是 KaTeX HTML + MathML，保存的偏好值和排版差异说明保持不变。SVG 与原生行加速保留实验性标签，并继续默认关闭。

原生行加速不再限定 Zotero 10.0.3，控制器不依赖报告的 Zotero 版本决定是否探测；版本信息仅用于诊断日志。仍要求 **React 18.3.1**、所需 React/浏览器接口、批注 fiber 特征、可写的 memo 元数据、一致的兄弟行组件，以及至少 **100** 个未选中原生行的精确高度缓存。没有扩展到 Reader 首次打开或普通选中/滚动。

控制器在调用启动方法前接管运行时；修改批注组件后若启动异常，会停止部分启动的运行时，还原原始组件并清理监听器与状态。历史性能报告继续保留当时的版本门禁事实。

- 全量验证通过：**35 个测试文件、941 项测试**、类型检查、五组双语文档、构建与打包；生产依赖审计未发现已知漏洞，差异空白检查通过。
- 回归覆盖多个 Zotero 版本值及缺失版本信息下的探测，以及 React 版本不同、缺少接口、不兼容 fiber、不可写 memo、兄弟组件不一致时的原生回退；真实运行时样例覆盖启动异常后的清理。双语 Fluent 测试确认只移除 MathML 标签，其余两个保留；原有公式语义、切换、滚动、编辑及净化测试通过。
- 独立 Windows / Zotero **10.0.6** Reader 使用 **React 18.3.1**，共有 **19** 个原生行。当前页面运行时通过实际结构检查，返回 `active: true`、`cachedRows: 0`；停止后被检查的组件函数已还原，全局运行时已移除，测试评论保持原文，随后关闭 Reader 和开发配置。
- 此次原生验证证明兼容性和启动/清理，**不证明取消筛选的性能收益**。行数少于缓存门槛，没有启动占位行恢复。此前大列表测量仍仅对应 Zotero 10.0.3，其他版本的实际加速效果需手动验证。

本地 XPI 与完整验证日志放在已忽略的 `.tmp/settings-status-and-row-compatibility/`。打包后恢复已发布的根目录 `updates.json`；本次未升级版本、推送或发布。
