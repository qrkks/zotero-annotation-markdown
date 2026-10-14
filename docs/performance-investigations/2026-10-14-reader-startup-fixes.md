# Reader startup fixes: hold release (2026-10-14)

English | [简体中文](#简体中文)

The duplicate-load defect is repaired, and live-disable recovery now uses up to
eight previews per commit, waits for commit cleanup, and avoids explicit anchor
layout measurements. This remains an experimental local package. The large-file
responsiveness target has not been achieved, so release stays on hold.

Version: 0.14.3. SHA-256: `7BD52E3E0BFCA9F0CB8E5543919A4FDD4999329AF48D80EE106CFB64188CA67C`.
No dependencies were added. Startup and tag-filter acceleration remain separate,
off-by-default settings. [Structured evidence](../test-evidence/2026-10-14-reader-startup-fixes.json).

Identical native restore requests for one tab/window now share loading and reuse
its Reader. Null and undefined both mean no secondary view. Intentional separate
tabs/windows, split-view changes, custom options and navigation stay native.
Session restore is serialized and respects the saved tab index.

## Final daily-profile checks

Zotero 10.0.6, React 18.3.1, 12 active add-ons, 423 annotations, 84,099,141-byte PDF.
The final package was installed before the following full process restarts:

| Scenario | Launch to strict body readiness | Largest host-timer gap | Readers for the tab |
| --- | ---: | ---: | ---: |
| cold-final-1 | 39.9 s | 2.0 s | 1 |
| cold-final-2 | 40.8 s | 2.0 s | 1 |
| cold-final-3 | 40.8 s | 1.9 s | 1 |
| cold-final-collision | 38.7 s | 1.5 s | 1 |

The collision run deliberately replayed two identical native restore requests
during initialization. Both returned the original Reader. All four runs kept one
Reader, observed all 423 initial previews as shells, passed body-before-preview
ordering, and preserved annotation comments.

Live disable recovered 423 native rows in 54.8 s,
with a largest host-timer gap of 2.4 s. It removed all shells and
the page runtime, restored native session selection, and preserved tabs and PDF
position. Re-enable restored the startup hook. The 60-second criterion passed.
The earlier warm recovery run timed out at 60 s; it is retained as a limitation.

The eight-update transition and 32-update batched transition experiments missed
the recovery deadline and were withdrawn. Concurrent verification/source reading
confounded those warm measurements; they are not causal A/B performance claims.
The final eight-preview synchronous batches avoid accumulated transitions.

All 1016 tests across 39 files, type checking, bilingual documentation checks,
build and packaging passed. Cleanup restored the original selected document,
sidebar, preferences, add-ons, and the pre-test saved stress-document page and
coordinate file. Annotation source remained unchanged. Temporary debug listeners,
preferences and collectors were removed; Zotero remained responsive with one
original Reader. The installed XPI matches the delivered package. Published
update metadata was preserved; nothing was committed,
pushed, tagged or released.

Readiness includes restored PDF initialization, a visible rendered current-page
canvas and two frame opportunities. The timings include remote debugging and
polling overhead. Timer gaps are proxies, not exact UI freeze durations. Process
restarts retain OS caches. These runs inherited the intermediate saved page;
cleanup restored the pre-test state, rather than treating those runs as proof of
preserving the initial page throughout testing.

## 简体中文

同一标签重复加载的问题已修复；禁用恢复现在每批最多提交八个预览，等待提交清理后
继续，并避免反复进行显式锚点布局测量。这仍是实验性本地测试包。大文件打开的
响应性目标尚未达到，继续暂缓发布。

版本 0.14.3，SHA-256：`7BD52E3E0BFCA9F0CB8E5543919A4FDD4999329AF48D80EE106CFB64188CA67C`。
没有引入新依赖。启动加速和标签筛选加速保持独立、默认关闭。
[结构化测试证据](../test-evidence/2026-10-14-reader-startup-fixes.json)。

同一窗口、同一标签的相同原生恢复请求共用加载并复用 Reader；null 和 undefined
都表示没有第二视图。主动另开标签/窗口、改变分屏、自定义参数和显式导航仍走
原生行为。会话恢复按单次任务执行，并尊重保存的标签索引。

### 最终日常配置测试

环境为 Zotero 10.0.6、React 18.3.1、12 个启用插件，样本含 423 条批注、
84,099,141 字节 PDF。上表列出最终包三次普通完整重启和一次主动制造重复请求的
完整重启。冲突测试在初始化过程中重放两次相同恢复请求，两次均返回原 Reader。
四次都只保留一个 Reader，初始 423 个预览全部暂缓，正文先就绪、预览后加载，
批注原文不变。

禁用恢复 423 个原生行耗时 54.8 秒，最大宿主计时间隔
2.4 秒。占位与页面运行时全部清理，会话恢复原生选择，标签、选中项和
PDF 位置保留；重新启用后启动挂钩重新安装。60 秒检查线通过。
此前暖启动环境的恢复测试在 60 秒超时，作为限制保留。

每批八个后台更新和每批 32 个显式批量后台更新的实验都未通过恢复期限，已撤回。
这两组暖测试还受到并行验证和源码读取负载影响，不能视为因果性的性能 A/B 证据。
最终八个预览的同步小批次避免积压后台更新。

39 个文件的 1016 项测试、类型检查、双语文档检查、构建和打包通过。清理恢复了
原选中文档、侧栏、偏好和插件状态，以及压力样本文档测试前保存的页码与坐标文件；
批注源码不变。临时调试监听、偏好和采集器均已清理，Zotero 保持响应，原文档只保留
一个 Reader；安装包与交付包一致。已发布更新元数据保留，没有提交、推送、
打标签或发布。

就绪门槛包含 PDF 恢复初始化、当前可见画布绘制和两次显示帧机会，不能用早期画布
出现代替。远程调试和轮询有额外开销，计时间隔不等于精确 UI 卡死时间，进程重启
不会清空操作系统缓存。这几次重启沿用了中间测试保存的页面；结束时还原测试前
状态，不能把它们当成全过程保留初始页码的证明。
