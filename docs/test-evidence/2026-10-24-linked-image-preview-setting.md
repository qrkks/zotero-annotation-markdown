# Automatic image-link preview setting — 2026-10-24

## English

Added **Automatically preview image links** to Reader Annotations, on by default. The preference is `extensions.annotationMarkdown.linkedImagePreviewEnabled`. Turning it off restores standalone image links and cancels their active/queued preview work; explicit Markdown images and source favicons retain their existing behavior. Open sidebar/popup previews, offscreen preview counts, annotation IMG badges and outline counts follow the setting without changing stored Markdown.

The loader uses per-task native-realm cancellation and attempt/identity guards so an old request cannot overwrite a re-enabled preview or remove a newer pending task. Previously released offscreen previews remain placeholders after their image counts refresh. Settings and both user guides/READMEs have matching English and Simplified Chinese coverage.

- `pnpm run verify`: **49 files / 1,267 tests passed**, all source/tool/test typechecks, five bilingual documentation pairs, build and packaging passed.
- `pnpm run release:verify v0.16.2`: local consistency passed; published `updates.json` restored byte-for-byte. No release was published.
- Local/Dev-installed XPI: **1,344,900 bytes**, SHA-256 `2f719f2e1bbb92f86483fd41db4892a2a6731a9e6502d47fd727bddc8d55e90c`; build-input SHA-256 `3c12f52496068334b3e23ba9e63730b4bd8e314f4c8f8f403503db50955366b9`.
- **Zotero Dev 10.0.6 / Gecko 140:** five installed-package checks passed: initial default-on rendering, native XUL checkbox, disable/cancel, re-enable/count refresh and disabled preference retained through full plugin reload. See [native evidence](2026-10-24-linked-image-preview-setting.json).
- Native HTTP was mocked: two host-request calls, zero remote requests. Automated regressions separately cover sidebar/popup toggling, standard images, outline/badge updates, offscreen placeholders, favicon isolation, stale intersection notifications and late cancelled completions.
- Restored all **19/19** in-memory and persisted fixture comments, original preference overrides and selection; restored the host HTTP method, closed the temporary preference window and removed QA globals. The original Reader remains open with no test editor. The new XPI stays installed in Dev, and previous-package/state backups remain in ignored `output/linked-image-preview-toggle-2026-10-24/`.

This is a same-version local test package. No commit, push, tag or publication was performed. Native commands were programmatic; physical input, full-process restart and real remote HTTP compatibility are outside this run.

Final layout: the image-link checkbox and description follow Mermaid, keeping the Render options together. All 33 preference-pane tests and packaging/local verification passed. The Dev native pane confirms **SVG → Mermaid → image links**, descriptions stay with their controls, and the stored choice is preserved. The local/installed package matches the XPI hash recorded above. The Dev preference pane is open for inspection.

## 简体中文

已在“阅读器批注”中增加 **自动预览图片链接**，默认开启，偏好键为 `extensions.annotationMarkdown.linkedImagePreviewEnabled`。关闭后，独立图片链接恢复为普通链接，并取消对应的活动及排队预览请求；显式 Markdown 图片和来源图标保持原有行为。已打开的侧栏/页内弹窗、离屏预览计数、批注 IMG 标签及大纲计数都会随设置更新，存储的 Markdown 原文保持不变。

加载器使用原生环境中的逐任务中止信号，并校验尝试及任务身份，防止旧请求覆盖重新开启的预览或删除新排队任务。已释放的离屏预览在计数更新后继续保持占位状态。设置、中英文用户指南及 README 已同步。

- `pnpm run verify`：**49 个文件、1,267 项测试全部通过**；源码/工具/测试类型检查、五组双语文档检查、构建及打包通过。
- `pnpm run release:verify v0.16.2`：本地一致性检查通过；已逐字节恢复公开的 `updates.json`，没有发布新版本。
- 本地及 Dev 已安装 XPI：**1,344,900 字节**，SHA-256 为 `2f719f2e1bbb92f86483fd41db4892a2a6731a9e6502d47fd727bddc8d55e90c`；构建输入 SHA-256 为 `3c12f52496068334b3e23ba9e63730b4bd8e314f4c8f8f403503db50955366b9`。
- **Zotero Dev 10.0.6 / Gecko 140**：五项已安装包检查全部通过，覆盖初始默认开启、原生 XUL 复选框、关闭并取消请求、重新开启及计数更新、完整插件重载后保留关闭状态。详见[原生验证 JSON](2026-10-24-linked-image-preview-setting.json)。
- 原生检查中的 HTTP 使用模拟实现：两次宿主请求调用，没有远程请求。自动化回归另行覆盖侧栏/弹窗切换、标准图片、大纲及标签更新、离屏占位行、来源图标隔离、过期交叉观察通知及取消后的迟到结果。
- **19/19** 条内存及已持久化的夹具批注均已恢复；原偏好覆盖值和选择状态已恢复。宿主 HTTP 方法已还原，临时设置窗口已关闭，QA 全局对象已移除。原 Reader 保持打开，没有测试编辑器。新 XPI 留在 Dev 中，旧包及状态备份保存在已忽略的 `output/linked-image-preview-toggle-2026-10-24/`。

这是保留原版本号的本地测试包，未提交、推送、打标签或发布。原生命令由程序触发；本轮没有验证物理输入、完整进程重启及真实远程 HTTP 兼容性。

最终布局：图片链接开关及说明放在 Mermaid 后面，使 Render 选项保持相邻。全部 33 项设置面板测试、打包和本地一致性检查通过。Dev 原生设置面板已确认 **SVG → Mermaid → 图片链接**，各说明紧随对应控件，存储选项保持原值。本地及已安装包与上文记录的 XPI 哈希一致。Dev 设置面板已打开，供检查顺序。
