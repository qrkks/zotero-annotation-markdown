# Implementation review and repair ledger — 2026-10-23

## English

Scope: Annotation Markdown 0.16.2 plugin runtime, settings, tests and build/release tooling. The promotional website is outside this review. The source-plus-preview architecture, final sanitization, isolated static SVG images, bounded render caches, native settings and deterministic packaging remain appropriate; replacing the project with Plugin Template is unnecessary.

### Initial evidence

- Baseline: 48 test files / 1,216 tests, full source/tool/test TypeScript checks and five bilingual documentation pairs passed.
- Draft teardown: in-memory production-controller reproduction of `stop()` and disabled-rendering `refresh()` removed a changed textarea without calling the commit bridge.
- Reader ownership: the strong registry Map had no production caller of `unregister()`. Simulated Reader destruction did not stop its controller before whole-plugin shutdown; this is not a live Gecko heap measurement.
- Failed initialization: a rejected asynchronous start stayed registered, prevented retry and bypassed partial-controller cleanup.
- Image requests: mocked viewport intersections started 128 distinct unresolved loads without a concurrency limit; shutdown did not cancel them. The host request did not select anonymous credentials.
- Experimental native row acceleration: 20 retries at 250 ms exhausted before a delayed sidebar mount; subsequent Reader discovery only deduplicated registration.
- TODO settings: external parent-preference synchronization did not update the dependent cleanup control's disabled state.
- `pnpm audit --prod` reported three DOMPurify 3.4.16 advisories. Current string sanitization does not use their required template/DOM-return, in-place-hook or XHTML/SMIL configurations. Updating the dependency is still required before release; the audit alone does not establish an exploitable plugin vulnerability.

### Repair ledger

| Item | Required behavior | Status |
| --- | --- | --- |
| Fast-editor teardown | Commit changed drafts before cleanup; preserve recoverable text when saving fails | Fixed; includes false/throw, new bundles and detached native rows |
| Reader destruction | Stop and unregister only the destroyed Reader; remove associated lifecycle listeners | Fixed; close/file and close/tab reconcile by Reader identity |
| Failed startup | Clean partial resources, remove failed entries and allow retry | Fixed; late old startup cannot remove a newer registration |
| Linked images and favicons | Bound concurrent requests, deduplicate URLs, cancel on stop and use anonymous preview requests | Fixed; at most four distinct requests per Reader |
| Late sidebar activation | Re-probe the experimental native row hook when actual annotation rows appear | Fixed; row-insertion observation disconnects on success, permanent fallback or stop |
| TODO dependencies | Synchronize enabled state on both commands and external preference updates | Fixed; dependent choice and stored preference remain intact |
| DOMPurify | Update to a patched version with lockfile consistency and rendering regressions | Updated to 3.4.17; unrelated locked dependencies preserved |

Keep plugin ID, preference keys/values, stored annotation source, published update metadata and the existing release process. Broad controller/adapter refactoring and a new development scaffold are separate improvements. Do not infer real-host compatibility or performance from jsdom alone.

### Final validation

- `pnpm run verify`: 48 test files / **1,246 tests passed**, source/tool/test typechecks, five bilingual documentation pairs, build and XPI packaging passed.
- `pnpm audit --prod`: **no known vulnerabilities found** after the DOMPurify update.
- `pnpm run release:verify v0.16.2`: passed against the local test package before restoring the published update manifest. This is a local consistency check, not a new published release.
- Local XPI: `dist/zotero-annotation-markdown.xpi`, **1,343,894 bytes**, SHA-256 `aa4f3d761b2529482fa347cb66aeb65a734338aa64e4ac9b86f2f57d5054b3ed`.
- Packaged build-input SHA-256: `7909cad59fc811d94c0d0f5ce073bc479edbf6163d287739569542a1a9acb924`.
- `git diff --check` passed; packaging restored `updates.json` to its original bytes. The plugin version remains 0.16.2 for this local test build. No commit, push, tag or publication was performed.
- After the Dev host was opened, the exact local XPI was installed and checked in **Zotero 10.0.6 / Gecko 140**. All seven top-level checks passed; [machine-readable native evidence](2026-10-23-implementation-review-native.json) distinguishes installed Reader operations from native-realm fixtures.

### Native Dev validation

- Installed runtime: shutting down with a changed fast-editor draft saved its source before removing the editor.
- Failed save and plugin reload: an intentionally rejected annotation update retained the draft and status through shutdown and full plugin reload; restoring the save bridge and retrying saved the same draft. The stored source was unchanged before retry.
- Actual duplicate Reader: closing a temporary Reader for the same PDF removed its plugin resources while preserving the original Reader and its preview DOM. Both `close/tab` and `close/file` notifications were observed.
- Actual delayed sidebar: with the experimental native row hook enabled, the hidden sidebar had zero annotation rows and an inactive hook beyond the initial retry window. Opening it mounted 19 rows and activated the hook. This confirms activation, not a rendering-speed benchmark.
- Native Gecko network primitives: four checks passed for the four-request bound, URL deduplication/cache reuse, native abort signals, anonymous request options, cancellation, queue disposal and abort-listener cleanup. HTTP was mocked; no remote requests were sent.
- Native Gecko lifecycle primitives: five checks passed for failed-start cleanup/retry, old-continuation isolation, pending-start cancellation, Reader identity reconciliation and shutdown-listener cleanup. These used detached native scratch documents and a mock host roster.
- Restoration: all **19/19** original fixture comments and temporary preferences matched their backups; the original Reader remained open, temporary Readers were closed, and no test editor or scratch DOM remained. Temporary QA globals were removed after collecting evidence. The patched XPI remains installed only in Dev; its previous XPI and fixture-state backups are in the ignored `output/implementation-review-native-2026-10-23/` directory.

This run covers plugin reload, not a full-process restart. It does not establish physical-input/native-menu behavior, heap usage, production network compatibility or performance.

Draft failure recovery deliberately preserves a visible textarea until retry or copying. When React replaces a comment, only the unsaved plugin editor is reattached as a small recovery region; the old host row is not remounted. Failed-save fixtures explicitly release their drafts during teardown, so recovery cannot spill into a later test. An already-destroyed Reader document cannot provide this recovery UI: copy a failed draft before closing the Reader.

Anonymous preview requests no longer inherit Zotero's cookie jar. Images requiring authentication may fall back to the original caption link. This behavior and the recovery path are documented in both user-guide languages.

## 简体中文

范围：Annotation Markdown 0.16.2 的插件运行时、设置、测试及构建发布工具；本次不审查宣传官网。保留源码与预览分离、最终净化、隔离静态 SVG 图片、有预算的渲染缓存、原生设置和确定性打包等现有设计，无须整体迁移 Plugin Template。

### 初始证据

- 基线：48 个测试文件、1,216 项测试、源码/工具/测试完整类型检查及五组双语文档检查通过。
- 草稿清理：在内存中运行生产 controller，`stop()` 和关闭全部渲染后的 `refresh()` 都直接移除了已修改的文本框，没有调用提交桥。
- Reader 所有权：强引用 registry Map 的 `unregister()` 没有生产调用者。模拟销毁 Reader 不会在插件整体关闭前停止其 controller；未进行真实 Gecko 堆测量。
- 初始化失败：异步启动被拒绝后仍保留登记，无法重试，也没有清理部分创建的 controller。
- 图片请求：模拟交叉观察器让 128 个不同 URL 的未完成请求全部启动，没有并发上限，停止后也没有取消；宿主请求未明确选择匿名凭据。
- 实验性原生行加速：20 次、每次 250 ms 的重试在侧栏延迟挂载前耗尽，后续 Reader 发现事件只对登记去重。
- TODO 设置：外部同步父偏好后，从属清理控件的禁用状态没有更新。
- `pnpm audit --prod` 报告 DOMPurify 3.4.16 的三条公告。当前字符串净化没有使用公告要求的模板/DOM 返回、就地净化 hook 或 XHTML/SMIL 配置。发布前仍须更新依赖；不能单凭审计结果认定插件存在可利用漏洞。

### 修复清单

| 项目 | 目标行为 | 状态 |
| --- | --- | --- |
| 快速编辑器清理 | 清理前提交已修改草稿，保存失败时保留可恢复文本 | 已修复，覆盖返回 false、抛错、新 bundle 和原生行被替换 |
| Reader 销毁 | 只停止和注销被销毁的 Reader，并移除对应生命周期监听 | 已修复，使用 close/file、close/tab 通知并按 Reader 身份清理 |
| 启动失败 | 清理部分资源、移除失败登记并允许重试 | 已修复，旧启动延迟完成不会删除新登记 |
| 图片链接与来源图标 | 限制并发、URL 去重、停止时取消请求，预览使用匿名请求 | 已修复，每个 Reader 最多四个不同 URL 请求并发 |
| 侧栏延迟激活 | 实际批注行出现时重新探测实验性原生行 hook | 已修复，成功、永久回退或停止时断开插入观察器 |
| TODO 从属设置 | 同时响应用户命令与外部偏好更新 | 已修复，保留子选项勾选状态和存储值 |
| DOMPurify | 更新修复版本、同步锁文件并执行渲染回归 | 已更新至 3.4.17，保留无关依赖的锁定版本 |

保留插件 ID、偏好键和值、已保存批注源码、已发布更新元数据及现有发布流程。controller/adapter 大规模拆分和接入开发脚手架属于后续改进，不能仅凭 jsdom 推断真实宿主兼容性或性能。

### 最终验证

- `pnpm run verify`：48 个测试文件、**1,246 项测试全部通过**；源码/工具/测试完整类型检查、五组双语文档检查、构建及 XPI 打包通过。
- `pnpm audit --prod`：DOMPurify 更新后，**未发现已知漏洞**。
- `pnpm run release:verify v0.16.2`：恢复已发布更新清单前，本地测试包一致性检查通过；此结果不代表发布了新版本。
- 本地 XPI：`dist/zotero-annotation-markdown.xpi`，**1,343,894 字节**，SHA-256 为 `aa4f3d761b2529482fa347cb66aeb65a734338aa64e4ac9b86f2f57d5054b3ed`。
- 包内构建输入 SHA-256：`7909cad59fc811d94c0d0f5ce073bc479edbf6163d287739569542a1a9acb924`。
- `git diff --check` 通过；打包后已逐字节恢复 `updates.json`。本地测试构建保留插件版本 0.16.2；未提交、推送、打标签或发布。
- Dev 宿主打开后，已安装上述同一份本地 XPI，并在 **Zotero 10.0.6 / Gecko 140** 中完成验证。七组检查全部通过；[原生验证 JSON](2026-10-23-implementation-review-native.json) 区分了已安装插件的实际 Reader 操作与原生环境测试夹具。

### Dev 真实宿主验证

- 已安装运行时：快速编辑器存在已修改草稿时，关闭运行时会先保存源码，再移除编辑器。
- 保存失败与插件重载：故意让批注更新失败，草稿和状态提示在运行时关闭及完整插件重载后仍保留；恢复保存桥后重试，成功保存同一份草稿。重试前的存储源码保持原值。
- 实际重复 Reader：为同一 PDF 临时打开第二个 Reader，关闭后其插件资源被移除，原 Reader 及其预览 DOM 保持不变；观察到了 `close/tab` 和 `close/file` 两种通知。
- 实际延迟侧栏：启用实验性原生行 hook，侧栏隐藏时没有批注行，超过初始重试窗口后 hook 仍未激活；打开侧栏后出现 19 行并成功激活。此检查验证激活行为，未测量渲染速度。
- Gecko 原生网络基础能力：四项检查覆盖四请求并发上限、URL 去重及缓存、原生中止信号、匿名请求选项、取消、丢弃排队任务和移除中止监听。HTTP 使用模拟实现，没有发送远程请求。
- Gecko 原生生命周期基础能力：五项检查覆盖启动失败清理与重试、旧异步流程隔离、待启动取消、按 Reader 身份清理及关闭监听清理；使用原生临时文档和模拟宿主 Reader 列表。
- 恢复状态：**19/19** 条原始夹具批注及临时偏好均与备份一致；原 Reader 保持打开，临时 Reader 已关闭，没有残留测试编辑器或临时 DOM。收集证据后已删除临时 QA 全局对象。修复 XPI 仅留在 Dev 中，旧 XPI 和夹具状态备份保存在已忽略的 `output/implementation-review-native-2026-10-23/` 目录。

本轮覆盖插件重载，未覆盖完整进程重启；不据此声称验证了物理输入与原生菜单、堆占用、真实网络兼容性或性能。

草稿保存失败时会保留可见文本框，供重试或复制。React 替换评论后，只把未保存的插件编辑器挂到小型恢复区域，不重新挂载旧宿主行。保存失败测试会在收尾时显式释放草稿，防止恢复逻辑影响下一项测试。Reader 文档本身已销毁时无法提供该恢复界面，保存失败的草稿须在关闭 Reader 前复制。

匿名预览请求不再继承 Zotero Cookie；需要登录的图片可能回退为原始标题链接。此行为和草稿恢复路径均已同步到中英文用户指南。
