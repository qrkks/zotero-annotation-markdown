# Reader startup release gate: hold release (2026-10-14)

> **Scope update (2026-10-14):** Document-opening acceleration is excluded from v0.15.0. Its implementation is archived on [`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment); this report retains the historical experimental results. See the [deferral decision](2026-10-14-reader-startup-deferred.md).
>
> **范围更新（2026-10-14）：** 文件打开加速不包含在 v0.15.0 中，完整实现保留在 [`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment) 分支；本文保留原实验结果。详见[暂缓发布决定](2026-10-14-reader-startup-deferred.md)。

English | [简体中文](#简体中文)

The final local XPI is **not ready for release**. The follow-up completed three
full process restarts, five full-environment manual controls, two hot-disable
runs for each of Weavero and Ethereal Style, live disable/re-enable, and a
same-version package replacement. Source code and package bytes were unchanged.

The tested package is version 0.14.3, SHA-256
`F7E9FE17FB32FEC182E3DEB58D6E1303CE1876F42B1AA120EDC9B2B4B0D88427`.
The daily environment has Zotero 10.0.6, React 18.3.1, 12 active add-ons,
Weavero **0.22.0**, and Ethereal Style 6.0.91. The sample contains 423 annotations
and an 84,099,141-byte PDF. This Weavero version differs from the earlier report.

## Results

| Scenario | Runs | Strict body readiness | Largest 25 ms host-timer gap per run |
| --- | ---: | --- | --- |
| Full process restart | 3 | Two reached readiness at approximately 38.3 / 39.5 s from the launch command; one timed out at 150 s | 1.5–2.4 s |
| Manual open, all add-ons | 5 | 22.8–37.1 s | 1.1–5.1 s |
| Manual open, only Weavero disabled | 2 | 17.5–18.9 s | 1.7–2.0 s |
| Manual open, only Style disabled | 2 | 17.1–19.2 s | 2.3–2.7 s |

Successful runs observed all 423 initial previews as placeholders and body
readiness before, or in the same polling tick as, the first native preview.
Original annotation comments were unchanged. Readiness requires native
reading-position initialization, a visible successfully rendered current-page
canvas, and two animation-frame opportunities; early canvas appearance alone
does not qualify. Timer gaps are responsiveness proxies, not exact Windows UI
freeze durations. Remote debugging and polling add overhead. These are process
restarts without a profiler, not operating-system reboots or disk-cache eviction.

The **second restart created two distinct Reader instances with the same tab
ID** and did not reach the strict body gate within 150 seconds. Its reading
page shifted from the preceding successful reference. The third run inherited
that persisted position; it is not independent proof of preserving the original
page. A trace of the successful third run captured one open call through our
deferred selection, Weavero wrappers, and the native tab hook. The failed run's
call trace was not captured, so the duplicate-open cause remains unassigned.

**Live disable did not finish preview recovery within 60 seconds.** Later
readback showed recovery progressing: 169 previews recovered and 250 remained
pending. Re-enabling and reopening succeeded. Replacing the installed XPI with
the same package and reopening also succeeded. A real version upgrade was not
tested. The recovery deadline failure must not be reported as a permanent hang,
but its duration fails this lifecycle check.

Individual hot-disable runs suggest additional cost from the combined add-on
environment. They retain stalls and cannot isolate caching, garbage collection,
run order, or hot-reload effects. Differences in elapsed time are not causal
per-add-on costs.

## Decision and cleanup

Hold release until duplicate loading of one native tab and slow live-disable
recovery are understood and fixed, followed by the same daily-profile checks.
Any load coalescing must preserve intentional separate tabs/windows and navigation
requests. Keep the acceleration experimental and disabled by default.

All 423 original comments remained unchanged. The original file selection,
tab order, sidebar choice, preference values, and all 12 active add-ons were
restored. A first cross-window position restoration attempt produced the wrong
page; it was corrected after closing the test Reader using its native saved
state and last-page API, with both read back. The restored coordinates use the
first valid manual-run reference, not a claim of pixel-exact pre-test position.
Diagnostic wrappers, collectors, temporary preferences and user.js were removed;
both temporary listeners were verified closed.

The earlier automated gate passed 38 files / 998 tests, type checking, docs,
build and packaging. Production code did not change in this follow-up, so those
tests were not repeated. The new host failures are outside that existing coverage.
No version bump, commit, push or publication occurred; published updates.json
bytes remain unchanged. Raw profile data and identifiers stay under ignored
`.tmp`; [public evidence](../test-evidence/2026-10-14-reader-startup-acceptance.json)
contains aggregate observations only.

## 简体中文

最终本地 XPI **暂不具备发布条件**。本轮完成了三次完整进程重启、五次完整插件环境手动打开对照、分别停用 Weavero 与 Ethereal Style 各两次、实时禁用/重新启用，以及同版本原包覆盖安装。发布源码与包字节没有变化。

测试包版本为 0.14.3，SHA-256 为
`F7E9FE17FB32FEC182E3DEB58D6E1303CE1876F42B1AA120EDC9B2B4B0D88427`。
日常环境为 Zotero 10.0.6、React 18.3.1、12 个启用的插件、Weavero **0.22.0**、Ethereal Style 6.0.91；样本有 423 条批注，PDF 为 84,099,141 字节。Weavero 版本已不同于前一份记录。

### 测试结果

| 场景 | 次数 | 严格正文就绪耗时 | 每轮最大的 25 ms 主窗口计时间隔 |
| --- | ---: | --- | --- |
| 完整进程重启 | 3 | 两次从启动命令附近计时约 38.3 / 39.5 秒，一次 150 秒超时 | 1.5–2.4 秒 |
| 全部插件手动打开 | 5 | 22.8–37.1 秒 | 1.1–5.1 秒 |
| 仅停用 Weavero 后手动打开 | 2 | 17.5–18.9 秒 | 1.7–2.0 秒 |
| 仅停用 Style 后手动打开 | 2 | 17.1–19.2 秒 | 2.3–2.7 秒 |

成功样本中，423 个初始预览均先占位，正文就绪先于首个原生预览，或在同一轮轮询中被观察到；批注原文均未变。正文就绪要求原生阅读位置初始化完成、当前页画布成功渲染且在可见区域，并经历两次动画帧机会；较早出现画布不能单独作为就绪标准。计时间隔只是响应性的代理指标，不是 Windows 界面卡死时长的精确测量。远程调试与轮询会增加开销；这些是未开启性能采样器的完整进程重启，没有重启系统或清空磁盘缓存。

**第二次重启为同一个标签页创建了两个不同的 Reader 实例**，150 秒内没有达到严格正文就绪门槛，阅读页相对前一个成功基准发生偏移。第三次沿用了该次失败后保存的位置，不能作为原阅读页保留的独立证明。第三次成功样本的调用记录只有一次打开，路径经过我们的延后选择、Weavero 包装和原生标签页挂钩；失败样本没有捕获调用记录，因此尚未确定重复打开的来源。

**实时禁用后的预览恢复未在 60 秒内完成。** 后续读回表明它仍在推进：已恢复 169 个预览，仍有 250 个待恢复。重新启用后重新打开成功，同版本原包覆盖安装后重新打开也成功；尚未测试真实版本升级。不能把这次恢复超时说成永久卡死，但它没有通过本轮启停时限检查。

单插件热隔离结果提示叠加环境可能增加开销，但仍有停顿，也不能排除缓存、垃圾回收、执行顺序和热重载的影响。不能把耗时差直接当作某个插件的因果耗时。

### 决策与恢复

暂缓发布。先弄清并修复同标签页重复加载与实时禁用恢复过慢，再用同一日常环境复测。若增加加载合并机制，必须保留用户主动打开不同标签页/窗口及导航请求的行为。启动加速继续保留实验性标签，默认关闭。

423 条批注原文均未变。原选中文件、标签页顺序、侧栏选择、配置值及全部 12 个启用的插件已经还原。第一次跨窗口还原位置得到错误页码；关闭测试 Reader 后，通过原生保存状态与最近阅读页 API 修正，并读回两者确认。坐标以本轮首个有效手动样本为基准，不承诺与测试前逐像素一致。诊断包装、采集对象、临时设置和 user.js 已移除，两个临时监听均确认关闭。

此前自动化检查通过 38 个文件 / 998 项测试、类型检查、文档、构建及打包。本轮没有修改发布源码，因此未重复整套检查；新发现的宿主问题不在既有测试覆盖内。未提升版本、提交、推送或发布，正式 updates.json 字节未变。原始数据与标识符仅保留于忽略的 `.tmp`，[公开证据](../test-evidence/2026-10-14-reader-startup-acceptance.json)只记录汇总观察。
