# Reader startup: avoid blocking on large annotation lists (2026-10-13)

> **Scope update (2026-10-14):** Document-opening acceleration is excluded from v0.15.0. Its implementation is archived on [`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment); this report retains the historical experimental results. See the [deferral decision](2026-10-14-reader-startup-deferred.md).
>
> **范围更新（2026-10-14）：** 文件打开加速不包含在 v0.15.0 中，完整实现保留在 [`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment) 分支；本文保留原实验结果。详见[暂缓发布决定](2026-10-14-reader-startup-deferred.md)。

English | [简体中文](#简体中文)

## Latest release decision (2026-10-14): hold release

The latest local revision guards repeated native tab restoration and batches
live-disable recovery. See the [repair and repeat-test follow-up](2026-10-14-reader-startup-fixes.md)
and its [evidence](../test-evidence/2026-10-14-reader-startup-fixes.json).
Large-file responsiveness remains below the release target.

The preceding package's repeat tests found a duplicate Reader for one tab, a
150-second body-readiness timeout, and slow live-disable recovery. See the
[follow-up release gate](2026-10-14-reader-startup-release-gate.md) and its
[public evidence](../test-evidence/2026-10-14-reader-startup-acceptance.json).
The recovery revision and earlier samples below remain historical evidence.

## Recovery revision implemented (2026-10-14)

The new local package fixes the two failures identified below. Supported PDF
loading/visibility remains deferred beyond ten seconds; failed or unsupported
probes retain progressive fallback, and rejected loading tasks can release it.
An owned native-session writer parks only a selected large Zotero 10 pane Reader
tab on disk, retaining every tab and its data. After add-on startup, the existing
unloaded tab is selected with the early Reader hook installed. User input or a
changed selection cancels automatic selection. Standalone windows remain native.
If the add-on cannot run at the next launch, the parked book remains available
as an unloaded tab; native data has not been removed.

Development and daily restarts of the interim package both logged zero Readers
at plugin startup followed by automatic book selection and an active startup
runtime. The development reading page and original comments were preserved.
The unprofiled daily restart initially kept all 423 previews as placeholders,
then observed strict body readiness before the first automatic preview. The
full daily configuration remains slow and has roughly two-second timer gaps.

Sequential interim daily manual samples observed a current-page canvas/frame
after 19.698 s with all plugins, 8.698 s with Weavero and Ethereal Style both
temporarily disabled, and 12.659 s after both were restored. All comments were
unchanged. This reversible hot-isolation test suggests extra cost from the
combined environment, but does not separate the two plugins or rule out cache
warming/hot-reload effects. An inclusive profile also contains their calls;
overlapping sampled stacks must not be summed into causal wall-clock costs.

The final package additionally handles rejected PDF loading tasks. Its SHA-256
is `F7E9FE17FB32FEC182E3DEB58D6E1303CE1876F42B1AA120EDC9B2B4B0D88427`;
it was verified installed in the daily profile. A manual run observed the
current canvas/frame after 10.195 s with accessibility enabled, while all
previews still remained deferred. Later readback confirmed `pdf-painted`, all
423 rows, unchanged comments, and all 12 plugins active. The early canvas probe
can precede final reading-position initialization and is not full-readiness
timing. Reading page, scale, horizontal offset and scroll/spread modes were
retained; repeated layout/reloads shifted the saved vertical coordinate by
three PDF units, so pixel-exact preservation is not established.

All 38 test files / 998 tests, type checking, bilingual docs checks, build and
packaging passed. No new dependency, version bump, commit, push or release was
introduced. Published `updates.json` was restored byte-for-byte. Diagnostic
timers/collectors, the temporary debugger preferences and local listener were
cleaned up; development settings were restored and the daily book was left open.
The two strategy bugs are fixed; the wider daily opening-latency objective is
still incomplete. The failed retest below describes the prior package, and the
earlier timing/profile sections remain historical evidence.

## Daily-profile retest (2026-10-14): acceptance failed

The same XPI and byte-identical 84,099,141-byte PDF with 423 annotations were
tested in the daily profile, with 12 active add-ons and both acceleration
preferences enabled. The current package does **not** meet the daily-profile
startup goal. Development-profile success below must not be generalized.

Automatic session restoration created and initialized the Reader before
Annotation Markdown started. The early runtime readback found all 423 native
rows, no preview placeholders, no startup runtime and no collection hook.
After plug-in startup the collection hook was present, but this already-created
Reader remained outside its coverage. The add-on startup log occurred 57.6 s
and 42.8 s after process start in two launches; these intervals are not measured
PDF first-frame times or exact unresponsive durations. An unresponsive daily
window was observed during startup.

A manual close/reopen after all add-ons started did activate the patch. It took
28.159 s from `Reader.open` to observing the current PDF canvas and a frame
opportunity. Reader initialization took 7.362 s. Relative to the Reader factory,
the ten-second PDF timeout released preview loading at 10.090 s, the first
preview appeared at 10.642 s, and the current PDF frame opportunity arrived at
20.440 s. Thus automatic previews preceded the body on this slow path. The
maximum page timer gap was 1.303 s. A later screenshot verified visible PDF
content. Original annotation comments were unchanged.

This was one manual run in a normal-size 927×594 window, on restored page 35;
it does not measure the user's maximized layout. Accessibility was false at
final readback. This is not an A/B comparison or a root-cause profile, and the
prior accessibility profile cannot be assigned as this run's cause. The
pre-factory initialization and slow PDF path also need profiling; delaying
preview creation alone cannot be assumed to account for the entire delay.

Revisit the startup entry point for automatic restoration and distinguish a
PDF that is still loading from an unsupported or failed readiness probe before
releasing the timeout fallback. Use this daily configuration for acceptance.
Temporary debugging preferences and the local listener were restored/closed;
the book was left open. Only evidence and this assessment changed in the retest;
no revised implementation or XPI was produced.

## Decision and scope

The primary goal is opening a large annotated document without a prolonged
unresponsive window, including the first open without a height cache. Reusing
the existing filter-clear height cache alone does not meet this goal.

Use an experimental cold-start path that preserves every native
outer annotation row, gives document rendering priority, and creates
native preview subtrees only when needed. Reuse bounded scheduling
and measured-height reservation where appropriate. Do not require a full-list
render or full-list height measurement before this path can activate.

The production implementation and its regression gates are described below.
The isolated prototype remains separate and is not imported by the add-on.
No dependency or published XPI has changed.

Native profiling now establishes a host accessibility-notification bottleneck
even with the Annotation Markdown add-on fully disabled. Prioritize reducing
initial native preview subtrees and their notification volume. Moving the
Markdown renderer to a Worker is not the remedy for this observed blocking path.

## Document priority and independent switches

The current local test package separates startup acceleration into the new,
off-by-default `readerStartupLazy` preference. Existing `nativeRowLazy` values
are preserved and now control only filter clearing. Enabling the former
combined experiment does not automatically enable the new startup preference.

For lists of at least 100 annotations, all automatic previews initially remain
lightweight placeholders, including the first viewport and selected row. The
PDF gate waits for primary-view initialization, a successfully rendered current
page canvas intersecting the visible viewport on both axes, and two animation
frame opportunities. Nearby previews then load one per low-priority task.
The 10-second timeout uses progressive recovery; an explicit user gesture may
load an individual preview earlier. Disabling restores owned hooks and recovers
previews in bounded batches. No accessibility setting is changed.

Three visible 423-row runs of the final package passed the document gate before
the first automatic preview: the gate completed 1.647–1.920 s after the Reader
factory, and previews began at 1.728–2.003 s. One run enabled startup acceleration
with filter acceleration disabled, confirming independent operation. Native
click selection, scrolling, filter clearing, cache exclusion, live disable,
ordering and the 19-row native path passed. Comments, preferences and Reader
closure were verified. All 37 test files / 979 tests, type checking, bilingual
docs checks, build and packaging passed.

These are sequential samples from one PDF, with warmed caches; the earlier
eager-preview reference followed an application restart. Do not infer a general
speedup percentage. Animation callbacks are frame opportunities, not proof of
OS pixel presentation. The independent canvas probe can observe a page before
restored-view initialization finishes; runtime `bodyFrameMs` is the acceptance
gate. Short stalls remain, including a 497 ms maximum timer gap in the lifecycle
run. An invalid harness attempt captured the old opening method before enabling
the new preference and bypassed the patch; it is excluded from performance data.

The final local XPI SHA-256 is
`5F9EC28E2BEF473EB3D833EFA61B274665EA5E98C7B15C56547381686D8DFFFD`.
Version remains 0.14.3; no commit, push or release occurred. Published
`updates.json` was restored byte-for-byte. Historical measurements and package
digests below belong to earlier builds, not this revision.

## Real-host evidence

Initial implementation, superseded by the document-priority revision above:
`src/reader-startup-lazy.ts` integrates the chosen
preview deferral into the production composition root behind the existing
off-by-default `nativeRowLazy` experiment. The isolated prototype below remains
separate. The new manager wraps the Reader collection's own `push` and each new
Reader's readiness method, installs before native `createReader`, then restores
that readiness method. It preserves factory arguments and native outer rows,
checks React/APIs/function signatures and hook ownership, and restores owned
hooks on disable. Live disable recovers previews in bounded batches; unload
cancels pending work. Startup placeholders invalidate the filter-height cache.

The packaged implementation passed 37 test files / 967 tests, type checking,
bilingual docs checks, build and packaging. In three visible 423-row window runs, open-to-rows was 1.21–1.40 s, the native-content frame opportunity was 132–169 ms and the maximum timer gap was 644–660 ms. Far selection reached the viewport in 82–89 ms in all three runs. A separate native tab run without the prototype probe observed 1.36 s to rows and a 395 ms maximum startup timer gap. Native DOM click selection, middle scrolling, filter narrowing to one row and restoring 423 rows, cache exclusion, live disable/recovery, hook removal and ordering passed. A 19-row synthetic window kept native previews without placeholders.
Original comments, preferences and Reader closure passed in every run. These
few samples do not validate every document, editing gesture or host version;
the first production package still has noticeable jank. No Worker, dependency
or accessibility setting change was introduced.

The tested XPI SHA-256 is
`F0D3E71EF2BD8FB07A1CD665A7ED8D558E9BC78C13A8307C720A7E20D530D164`.
The earlier profile/candidate evidence below describes the preceding builds
and must not be attributed to this package. The package remains a local manual
test artifact; no release or version bump occurred and published updates.json
was restored byte-for-byte after packaging.

Windows, Zotero 10.0.6, React 18.3.1, Annotation Markdown 0.14.3, and a dedicated
development profile. The stress attachment is a copied ebook with 423
annotations. A 19-annotation synthetic attachment was used for lifecycle and
mechanism checks. Only aggregate results are retained in
[the evidence JSON](../test-evidence/2026-10-13-reader-startup.json).

Initial runs used the earlier 0.14.3 XPI with SHA-256
`2A3C736DF4525D3B1CDA80E4C1346F4EE30F0161ACD9E23D66AE92E4F30785CB`.
The final three candidate runs used the current repository build, installed
and verified byte-for-byte, SHA-256
`5D07F6C158232E1D72B7846432C07E01101F15DA7CE096010156881D55C40A55`.
Both builds report version 0.14.3. Their compiled JavaScript difference is the
native-row compatibility gate/partial-hook cleanup, not the Markdown renderer.

| Condition | Observed result |
| --- | --- |
| Full native previews, Markdown disabled, lightweight measurement | Open-to-rows 3.53 s; first row frame 1.63 s after the Reader factory; maximum 16 ms timer interval gap 1.89 s. Completed and closed cleanly. |
| Full native previews, Markdown enabled, lightweight measurement | Rows committed, then the development window remained unresponsive for about 179 s before termination. No successful completion time is available. |
| Progressive native previews, Markdown enabled, initial viewport eager, scroll policy enabled; three completed runs | Open-to-rows 1.31–1.73 s; first visible native-content frame 158–168 ms after the Reader factory; maximum timer gap 586–670 ms. All 423 outer rows remained present. |
| Progressive previews with the existing native-row setting also enabled; two completed runs | Open-to-rows 1.11–1.46 s. Selection and scrolling completed. The existing native-row runtime status was absent, so this does **not** prove simultaneous operation of both accelerators. |
| Current repository build, progressive previews, Markdown and native-row acceleration enabled; three completed runs | Open-to-rows 1.46–1.74 s; visible native-content frame 140–166 ms; maximum timer gap 537–738 ms. The existing native-row runtime was active. Selection, focus and scrolling completed. Filter relaxation was not exercised. |
| Current repository build, full native previews, Markdown and native-row acceleration enabled, lightweight measurement; one run | Completed: open-to-rows 2.87 s; first row frame 1.20 s; maximum timer gap 2.92 s. This successful run does not reproduce the earlier prolonged failure, but still exposes a large blocking interval. |
| Gecko profiler, current build enabled, full native previews; one run | Recovered after a 160.26 s main-thread task. Its platform accessibility show/hide intervals total 156.71 s. |
| Gecko profiler, Annotation Markdown add-on fully disabled, full native previews; one run | Recovered after a 140.27 s main-thread task. Its platform accessibility show/hide intervals total 136.84 s. |
| Gecko profiler, add-on fully disabled, progressive previews; one run | Longest task 402.85 ms; maximum timer gap 541 ms. All 423 outer rows remained, with 411 preview placeholders. |

The enabled full-preview failure was reproduced with geometry measurement and
cache capture explicitly disabled. An external process check reported the
window as unresponsive, and on-disk stage markers stopped after annotation-row
commit. Only the verified development process was terminated; preferences
were restored after restart.

Earlier baseline attempts that timed out the debugger after 120 s also forced
full-list geometry and/or cache capture. They are retained as failed attempts,
not ordinary startup timing data. The lighter disabled-feature baseline above
shows why those earlier timeouts cannot alone establish the cause of a user's
hang. The attempted alternating six-run comparison was aborted by the first
enabled full-preview failure; it is not a completed A/B benchmark.

The earlier timing-only results identified an important startup boundary;
the subsequent native profiles identify a specific host blocking path, described
below. There is still visible jank in the candidate: roughly half-second timer
gaps are not smooth interaction. These few sequential runs do not prove that
every large document will recover. The current full-preview baseline completed
once without a prolonged hang; do not describe every current-build open as a
persistent hang. Severity and incidence remain distinct from startup cost.

Open-to-rows includes host opening work. Factory-to-frame measures the Reader
page separately. A `requestAnimationFrame` callback is a frame opportunity,
not a browser paint timing or proof that Markdown/math has fully rendered.
The first native-content metric excludes placeholders intersecting the
viewport. Timer gaps are responsiveness proxies, not attributed CPU tasks.
All reported successful large samples were visible; hidden-window samples
with missing frames or suppressed intersections were excluded from timing.

## Native blocking path and Worker decision

The three profiled conditions used Gecko 140.17.0, the same 423-annotation sample,
2 ms sampling with `js`, `stackwalk` and `cpu`, a 5 s settlement timer, no full-list
geometry reads and no height-cache capture. The baseline probe observed native
creation without replacing components. The disabled conditions disabled the
Annotation Markdown add-on itself through AddonManager, in addition to its
feature settings. The development MCP bridge remained active.

In the two full-preview profiles, the longest main-thread task contains
`NotificationController::WillRefresh` lasting 160.25/140.26 s. Each task contains
126,691 `a11y::PlatformShowHideEvent` intervals, totaling 156.71/136.84 s.
Native leaf samples are predominantly in `win32u.dll`. The enabled run's long
refresh tick belongs to the Reader UI page. Mozilla describes the
[platform marker as firing show/hide events to the OS](https://bugzilla.mozilla.org/show_bug.cgi?id=1919688),
and the [Windows implementation](https://github.com/mozilla/gecko-dev/blob/master/accessible/windows/msaa/MsaaAccessible.cpp)
sends native MSAA events through `NotifyWinEvent`. This is evidence for a native
accessibility-notification bottleneck, not a long Markdown or KaTeX computation.

The progressive condition reduces all main-thread show/hide intervals in the
observation profile to 3,836, totaling 391.29 ms. Its longest task is 402.85 ms,
including a 397.43 ms accessibility refresh. The profile includes Reader close;
it does not include eventually materializing all 411 deferred previews or a
long scroll session. These are sequential, same-process runs with profiler
overhead and one observation per condition, not an incidence estimate or a
claim of a universal speedup. Marker durations are wall time and can nest;
totals from different marker names must not be summed as exclusive CPU costs.

Accessibility was active throughout, with `accessibility.force_disabled` left
at 0. The runtime identified an external UI Automation instantiator locally;
activation alone does not prove that client caused the delay. Its application
name/path and the raw profiles remain private. No application was terminated
and no accessibility preference was changed in these three profiler runs.
The profiler stopped, add-on state and feature settings were restored, original
comments were unchanged, and all test Readers closed.

[Workers cannot operate the page DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
or move this native Windows notification path out of Zotero's main thread.
Pure normalization, Markdown and
[KaTeX string generation](https://katex.org/docs/api.html) remain possible future
Worker candidates if segmented real-host profiling justifies them. The current
renderer also uses DOMPurify and SVG DOM parsing; any split must preserve the
security boundary, bound in-flight results and account for copying/memory and
Reader lifecycle. No Worker or new dependency is introduced by this assessment.

## What the prototype changed

- **Earlier installation:** the dedicated harness observes a newly created
  Reader's DOMContentLoaded boundary and installs inside its page before
  `createReader()` runs. A post-initialization controller is too late to avoid
  the initial full native list. This is a private-host integration experiment.
- **Cold open:** keep all native outer rows, identifiers, selection state,
  focus handlers and ordering. Replace only deferred `SidebarPreview`
  subtrees. The measured large runs created 12 initial previews and 411 preview
  placeholders without a height cache. This is progressive rendering, not a
  virtual list that removes offscreen rows.
- **First viewport:** render it synchronously. Deferring everything until an
  intersection callback made the 19-row readable frame worse: 175 ms baseline
  versus 340/414 ms for cache/preview variants. A quick blank shell frame is
  not sufficient. The viewport estimate in this prototype assumes a top-start
  list and must be improved for restored scroll positions.
- **Bounded work:** one observer and a deduplicated queue; at most two previews
  or an 8 ms scheduling budget per task. A single expensive preview can exceed
  that budget; this is not a hard task-duration limit.
- **Scrolling:** pause deferred creation until 120 ms of scroll quiet, remove
  queued entries that have left the observed range, and compensate changes
  above the first visible outer row. Temporarily suppress browser scroll
  anchoring during that compensation and restore its prior style afterward.
- **Selection:** selected native previews bypass deferral. Before the scroll
  policy, a distant native-only selection materialized but still missed the
  viewport after 2.5 s. With the policy, native-only and Markdown-enabled
  selections reached the viewport in about 799/802 ms. A separate large test
  exercised focus on a deferred row. Source comments, row ordering, four
  feature preferences and Reader closure were verified on completed runs.
- **Reopen experiment:** the separate `cached-rows` mode accepts measured
  height/content/layout snapshots. It reserves height even after native
  content is mounted, and bypasses a snapshot on changed content, layout or
  selection. It is secondary to the cold-open goal. Snapshot collection is
  intentionally optional so diagnosis does not require forcing all geometry.

All prototype hooks, observers, timers and temporary anchoring styles are
cleaned up before the test Reader closes. `stop()` alone is not a production
disable/re-enable contract for leaving a live Reader full of deferred nodes.
The harness checks the development data directory, requires no existing
Reader, backs up settings under `.tmp`, and restores them in `finally`.
An abrupt process termination requires the explicit recovery used in this
investigation because JavaScript `finally` cannot run in a killed process.

## External projects and dependency decision

Primary sources checked on 2026-10-13:

| Project | Useful capability | Decision |
| --- | --- | --- |
| [Zotero Reader PR #156](https://github.com/zotero/reader/pull/156), head `a869c6aa7eebbd6aec82029ce3ec1696a4c7e98e`, open/unmerged when checked | Defers SidebarPreview with react-intersection-observer and a 100 px placeholder. Supports the choice of subtree deferral. | Track and coordinate with the native approach. Its author's performance claims are not our measurements. |
| [TanStack Virtual](https://tanstack.com/virtual/latest/docs/api/virtualizer), source `676a098bfbe168a9bcb55ce3cca984823a85cea7`; virtual-core source package 3.19.3, MIT | Headless size estimation, measurement, initial measurement snapshots, item keys, offsets and scroll correction. | Best candidate if we later own the list or build a native navigation adapter. Do not add it for this prototype. |
| [React Virtuoso](https://virtuoso.dev/), source `1ef70a220bda15ca123863622b15be3ece178b74`; react-virtuoso source package 4.18.19, MIT | Variable-height measurement and a complete React list component. | More list ownership and React integration than this change requires. Defer adoption. |

Zotero's [AnnotationsView source](https://github.com/zotero/reader/blob/4bfd82ee848e36e80aaff2a2c732615c89ad1e72/src/common/components/sidebar/annotations-view.js)
maps the full list and performs imperative DOM selection, focus and scrolling.
Removing offscreen outer rows would require adapting those contracts. Neither
library supplies an earlier Zotero initialization hook or preserves these
native contracts automatically. The API sizes and source-package versions
above are research snapshots, not dependency selections.

Use native IntersectionObserver and the existing scheduling patterns for the
first integration. Do not build a general virtualizer. A future owned list
should reuse a maintained virtualizer rather than expanding this prototype
into a competing geometry engine.

## Production gates and verification

Before shipping an experimental startup feature:

1. Install before first native preview creation with explicit capability
   probes, hook ownership, safe native fallback and full cleanup on disable,
   reload, exceptions and Reader close. Do not use the QA array interception
   unreviewed as a production API.
2. Repeat visible large-document tests with and without a cache, restored
   middle/end positions, PDF and EPUB, different widths/fonts/output settings,
   native images and selected/expanded annotations. Record long blocking
   intervals, input responsiveness and memory recovery, not just the first
   shell frame. Improve the remaining roughly 0.6 s stalls.
3. Validate mouse/touch clicks on a still-deferred preview, native context
   menus, keyboard navigation, focus, editing/save/Escape and fast editor
   interaction. API selection and focus tests do not cover every gesture.
4. Coordinate with the existing filter-clear experiment. Placeholder heights
   must never be accepted as final measured heights. The earlier enabled-setting
   tests had no active runtime because that XPI still gated Zotero 10.0.3.
   The current build armed the runtime and reported 423 cached rows while 411
   previews were still deferred. That is a cache-coordination risk; startup
   coexistence does not validate filter relaxation or those cached heights.
5. Keep any reopen cache bounded, validate actual scroller width/content
   version/fonts/images/settings, and handle invalidation and memory lifetime.
   The prototype's full-string fingerprints remain in memory only and are
   not a production cache format. Cold startup must work without them.

Prototype sources: [page installer](../../scripts/prototypes/reader-startup-page.mjs),
[dedicated native harness](../../scripts/prototypes/reader-startup-native-qa.js),
and [regressions](../../tests/reader-startup-prototype.test.js).
Focused checks passed 30 tests including the existing native-row suite. New
tests cover early installation, original-factory restoration, unsupported
runtime rejection, cache invalidation, eager viewport handling, discarded
scroll work, scroll-idle scheduling and anchor/style cleanup. Full verification
passed 36 files / 952 tests, type checking, bilingual documentation checks,
build and packaging. The production dependency audit found no known
vulnerability; published updates.json bytes were restored after local packaging.

Private annotation text, identifiers, attachment metadata, profile paths and
screenshots are excluded from saved public evidence. Raw development logs and
the failed foreground helper remain under ignored `.tmp` only.

## 简体中文

### 最新发布决策（2026-10-14）：暂缓发布

最新本地修订保护重复的原生标签恢复，并将禁用恢复改为批次提交。详见[修复与重复测试记录](2026-10-14-reader-startup-fixes.md#简体中文)与[证据](../test-evidence/2026-10-14-reader-startup-fixes.json)。大文件响应性仍未达到发布目标。

此前包的重复测试发现同标签页重复 Reader、150 秒正文就绪超时及实时禁用恢复过慢。详见[此前发布检查](2026-10-14-reader-startup-release-gate.md#简体中文)与[公开证据](../test-evidence/2026-10-14-reader-startup-acceptance.json)。下面的恢复策略修正及更早样本继续保留为历史证据。

### 恢复策略修正已实施（2026-10-14）

新本地测试包修复了下面发现的两处失败：支持的 PDF 仍在加载或不可见时，即使超过 10 秒也继续暂缓预览；失败或无法探测时保留渐进回退，加载任务拒绝也能放行回退。自有会话保存挂钩只在磁盘会话中延后选中的 Zotero 10 大样本 Reader 标签，保留所有标签和数据；插件启动后，先安装早期 Reader 挂钩，再选中已有的未加载标签。用户操作或选择变化会取消自动选择，独立窗口仍沿用原生恢复。若下次启动时插件无法运行，原书仍作为未加载标签保留，没有移除原生数据。

中间测试包在开发配置与日常配置完整重启后，均记录到插件启动时 Reader 数为零，随后自动选中原书并启用启动运行时。开发配置的阅读页和批注原文保留。日常配置未开启性能采样器的重启测试中，423 个预览先全部占位，严格正文就绪门槛先于首个自动预览。完整日常配置仍慢，仍存在约两秒的心跳间隔。

中间包在日常配置的顺序手动测试中，全部插件开启时到当前画布/帧机会为 19.698 秒，临时同时停用 Weavero 和 Ethereal Style 时为 8.698 秒，恢复两者后为 12.659 秒，批注原文均未变。这次可逆的热隔离测试支持叠加环境增加开销的判断，但不能区分两者，也不能排除缓存预热或热重载影响。包含子调用的性能采样中也出现了它们的调用，但重叠采样不能相加为各自的因果耗时。

最终包额外处理了 PDF 加载任务拒绝，SHA-256 为 `F7E9FE17FB32FEC182E3DEB58D6E1303CE1876F42B1AA120EDC9B2B4B0D88427`，已核验安装到日常配置。一次无障碍功能启用时的手动测试，10.195 秒观察到当前画布/帧机会，所有预览仍保持暂缓；后续读回确认 pdf-painted 门槛、423 行、原文不变以及全部 12 个插件启用。早期画布探针可能先于最终阅读位置初始化，不能把它当成完整就绪耗时。阅读页、缩放、横向偏移及滚动/跨页模式保留；重复布局与重载后，保存的纵向坐标相差三个 PDF 单位，未证实像素级完全一致。

38 个测试文件、998 项测试、类型检查、中英文文档检查、构建及打包全部通过。未新增依赖、提升版本、提交、推送或发布，正式 updates.json 已按原字节恢复。诊断计时器/状态对象、临时调试配置及本地监听已清理，开发设置已还原，日常版的书保持打开。两处策略缺陷已修复，日常配置的整体打开耗时目标仍未完全实现。下面失败复测属于旧包，后续早期计时和性能画像均保留为历史证据。

### 日常配置复测（2026-10-14）：验收未通过

使用同一个 XPI，在日常配置中测试了逐字节相同的 84,099,141 字节 PDF、423 条批注；12 个插件处于启用状态，两个加速开关均已开启。**当前包尚未达到日常配置打开不卡的目标**，不能把下面的开发配置成功数据推广到日常环境。

启动恢复会在 Annotation Markdown 启动前创建并初始化 Reader。早期运行时读回发现 423 条原生行、零预览占位，没有启动运行时和集合挂钩；插件启动后集合挂钩存在，但已创建的 Reader 仍未被接管。两次启动中，插件启动日志分别出现在进程启动后 57.6 秒和 42.8 秒；这不是正文首帧时间，也不是准确的无响应持续时间。启动过程中观察到日常窗口无响应。

全部插件就绪后，手动关闭并重新打开确实启用了补丁。从 `Reader.open` 到观察到当前 PDF 画布及帧机会用时 28.159 秒，Reader 初始化用时 7.362 秒。相对 Reader 工厂，10 秒超时在 10.090 秒放行预览，首个预览在 10.642 秒出现，当前 PDF 帧机会在 20.440 秒出现。因此这条慢路径上，自动预览先于正文。页面心跳最大间隔为 1.303 秒，后续截图已核验正文可见；批注原文未变。

本轮只有一次手动打开，窗口恢复为普通尺寸 927×594，阅读位置为第 35 页，不代表用户最大化窗口的布局。最终读回时无障碍功能未启用。这不是 A/B 对照或根因性能剖析，不能把此前无障碍通知的性能画像直接归因到本轮。工厂之前的初始化和较慢的 PDF 路径也需剖析，不能认定延迟批注预览就能解释或消除全部耗时。

需要重新评估自动恢复的启动入口，并在放行超时降级前区分“PDF 仍在加载”和“无法探测或加载失败”，以日常配置作为验收环境。临时调试配置已还原，本地监听已关闭，书保持打开。本轮仅更新证据与评估，尚未产生新的实现或 XPI。

### 决策与范围

首要目标是让超大批注文档打开时不再长时间失去响应，尤其是没有高度缓存的第一次打开。只复用筛选取消时的高度缓存机制，不能满足这个目标。

采用实验性首次打开方案：保留所有原生批注外层行，优先让正文绘制，再按需、分批创建预览子树。可以复用现有调度与高度保留思想，但不能要求先完整渲染、测量整个列表才能启动加速。正式实现见下文；独立原型仍未接入生产入口，未新增依赖，也未改变已发布 XPI。

原生性能采样已确认：完全禁用 Annotation Markdown 插件后，宿主的无障碍通知路径仍会产生长阻塞。因此优先减少首批原生预览子树及通知量；把 Markdown 渲染器移入 Worker 不能解决本次捕获的瓶颈。

### 正文优先与独立开关

当前本地测试包新增默认关闭的 `readerStartupLazy`，单独控制打开加速。保留原来的 `nativeRowLazy` 保存值，仅控制清除标签筛选的加速。此前开启合并实验不会自动开启新的启动选项。

不少于 100 条批注时，所有自动预览先使用轻量占位，包括首屏和选中行。PDF 门槛等待主视图初始化、当前页成功绘制且画布在横纵方向均与可见视口相交，再经过两次动画帧机会；随后每个低优先级任务加载一个附近预览。等待超过 10 秒仍分批恢复；用户主动操作可以提前加载单个预览。禁用时还原自有挂钩并分批恢复预览，未更改无障碍设置。

最终包的三次可见 423 行实测均先通过正文门槛，再自动加载预览：门槛在 Reader 工厂后 1.647–1.920 秒完成，预览在 1.728–2.003 秒开始。其中一轮仅启用启动加速、关闭筛选加速，证实开关独立。实际点击选择、滚动、清除筛选、占位缓存排除、实时禁用、顺序保持和 19 行原生路径通过，原文、配置恢复及 Reader 关闭均已核验。37 个测试文件、979 项测试、类型检查、中英文文档检查、构建及打包全部通过。

这些数据来自同一个 PDF 的顺序测试，缓存已预热；较早的首屏立即加载参考数据来自应用重启后，不能推导通用加速百分比。动画回调只是帧机会，不能证明操作系统已显示像素。独立画布探针可能在恢复阅读位置的初始化完成前观察到页面，验收采用运行时的 `bodyFrameMs` 门槛。仍有短顿，生命周期测试最大心跳间隔为 497 ms。有一次无效测量提前保存旧打开方法，绕过启用后的补丁，已排除在性能数据之外。

最终本地 XPI 的 SHA-256 为 `5F9EC28E2BEF473EB3D833EFA61B274665EA5E98C7B15C56547381686D8DFFFD`，版本仍为 0.14.3，未提交、推送或发布；正式 `updates.json` 已按原字节恢复。下面的历史数据和包摘要属于此前构建，不能归因到本次版本。

### 实测与解释

早期实施记录（已由上面的正文优先版本替代）：`src/reader-startup-lazy.ts` 把选定的预览延迟方案接入正式组合入口，共用默认关闭的 nativeRowLazy 实验开关；下述独立原型仍单独保留。管理器只包裹 Reader 集合自身的 push 和新 Reader 的就绪方法，在原生 createReader 前安装后还原就绪方法。保留工厂参数及原生外层行，探测 React/接口/函数特征及挂钩所有权。禁用时还原自有挂钩并分批恢复预览，卸载时取消待处理工作；启动占位使筛选高度缓存失效。

实际打包的实现通过 37 个测试文件、967 项测试、类型检查、中英文文档检查、构建及打包。三次可见的 423 行窗口测试中，打开到行 1.21–1.40 秒，原生内容帧机会 132–169 ms，心跳最大间隔 644–660 ms；远处选择均在 82–89 ms 到达视口。另一次未安装原型探针的原生标签页测试中，打开到行 1.36 秒，启动心跳最大间隔 395 ms；实际 DOM 点击选择、中部滚动、筛选收窄到一行再恢复 423 行、占位缓存排除、实时禁用恢复、挂钩移除和顺序保持均通过。19 行合成样本保持原生预览、没有占位。每轮均核验原文、配置恢复及 Reader 关闭。这些少量样本尚不能覆盖所有文档、编辑手势和宿主版本，首个正式接入测试包仍有明显短顿。未引入 Worker、新依赖或无障碍配置改动。

测试包 SHA-256 见上面的实施更新。后面的早期性能采样与原型数据属于此前构建，不能归因到该测试包。本次仅提供本地手动测试包，未发布或提升版本；打包后已按原字节恢复正式 updates.json。

测试环境为 Windows、Zotero 10.0.6、React 18.3.1、Annotation Markdown 0.14.3，使用独立开发资料库中复制的 423 条批注电子书。另有 19 条合成批注用于机制和生命周期检查。[证据 JSON](../test-evidence/2026-10-13-reader-startup.json) 只保存汇总数据。

初期测试使用较早的同版本 XPI，最后三次候选方案验证使用当前仓库构建，并核验安装包与构建产物完全相同。两个包的 SHA-256 见英文段落；编译后 JavaScript 的差异仅涉及原生行版本兼容门槛和部分安装失败时的清理，不涉及 Markdown 渲染器。

- 原生完整预览、关闭 Markdown、采用轻量测量：打开到批注行约 3.53 秒；Reader 工厂启动到行帧约 1.63 秒；16 ms 心跳的最大间隔约 1.89 秒，测试正常结束。
- 原生完整预览、开启 Markdown、同样不读取列表几何、不采集高度缓存：批注行挂载后，开发窗口持续失去响应约 179 秒，随后仅终止了核验过的开发进程，重启后恢复配置。没有有效的完成时间。
- 渐进预览、开启 Markdown、首屏直接渲染、启用滚动策略：三次大样本测试打开到批注行约 1.31–1.73 秒，可见原生内容帧约 158–168 ms，心跳最大间隔约 586–670 ms；423 个外层批注行始终存在。
- 同时打开既有原生行加速设置的两次测试约 1.11–1.46 秒，选择和滚动完成；但没有检测到该加速运行时状态，不能据此声称两个加速器已同时工作。
- 当前仓库构建、开启 Markdown 和原生行加速的三次候选方案测试约 1.46–1.74 秒，可见原生内容帧约 140–166 ms，心跳最大间隔约 537–738 ms。既有加速运行时已激活；选择、焦点和滚动完成，但未验证筛选取消。
- 当前仓库构建、完整原生预览、同时开启这两个设置的一次轻量基线成功完成：打开到行约 2.87 秒，行帧约 1.20 秒，心跳最大间隔约 2.92 秒。这次没有复现早期持续失去响应，但仍有明显的长阻塞。
- Gecko 原生性能采样、当前插件启用、完整原生预览：出现 160.26 秒主线程任务后自行恢复，其中平台无障碍显示/隐藏通知累计 156.71 秒。
- Gecko 原生性能采样、完全禁用 Annotation Markdown 插件、完整原生预览：出现 140.27 秒主线程任务后自行恢复，其中同类通知累计 136.84 秒。
- Gecko 原生性能采样、插件完全禁用、渐进预览：最长任务 402.85 ms，心跳最大间隔 541 ms；保留全部 423 个外层行，其中 411 个预览仍为占位。上述三个采样条件各完成一次。

早期两次调试连接 120 秒超时还涉及全列表几何或缓存采集，不能直接当作用户卡死的证明。后来不强制读取几何的原生基线能完成，而开启 Markdown 的轻量基线仍有效复现失去响应。计划中的六次交替比较被第一轮故障中断，不构成完整 A/B 基准。

早期时序数据识别出了重要启动边界；后续原生调用栈进一步定位了下面的宿主阻塞路径。候选方案仍有约半秒卡顿，几次顺序测试也不能保证所有大文档都能恢复。
不能把当前构建每一次完整预览打开都描述为持续卡死：已有一次成功完成。故障严重程度及发生概率，与候选方案降低启动工作量，是不同的验收指标。

“打开到批注行”包含宿主打开工作；“工厂到帧”只衡量 Reader 页面。requestAnimationFrame 是帧机会，不是浏览器实际绘制时间，也不代表 Markdown 和公式已全部完成。可见原生内容指标排除占位；心跳间隔用于观察响应性，不能归因到某个 CPU 任务。有效的大样本均在前台；隐藏窗口中缺失帧、交叉观察被抑制的数据不用于性能结论。

### 原生阻塞路径与 Worker 决策

三个采样条件使用 Gecko 140.17.0、同一份 423 条批注样本、2 ms 采样间隔及 js/stackwalk/cpu 功能，批注行出现后设置 5 秒观察计时器，不强制读取全列表几何、不采集高度缓存。基线探针仅观察原生创建，不替换组件。禁用条件通过 AddonManager 完全禁用 Annotation Markdown 插件本身，同时关闭其功能配置；独立开发 MCP 桥仍然启用。

两个完整预览样本的最长主线程任务都包含 NotificationController::WillRefresh，分别持续 160.25/140.26 秒；各自任务内都有 126,691 次 a11y::PlatformShowHideEvent 区间，累计 156.71/136.84 秒。原生叶调用栈采样主要落在 win32u.dll；插件启用样本的长刷新属于 Reader UI 页面。[Mozilla 对该标记的说明](https://bugzilla.mozilla.org/show_bug.cgi?id=1919688) 是向操作系统发送显示/隐藏通知，[Windows 实现](https://github.com/mozilla/gecko-dev/blob/master/accessible/windows/msaa/MsaaAccessible.cpp) 通过 NotifyWinEvent 发送原生 MSAA 事件。这直接支持本次瓶颈位于原生无障碍通知路径，不是长时间 Markdown 或 KaTeX 计算。

渐进预览样本中，整个观察采样的主线程显示/隐藏通知降至 3,836 次，累计 391.29 ms；最长任务 402.85 ms，其中无障碍刷新 397.43 ms。采样包含 Reader 关闭，但没有测量最终展开全部 411 个占位或长时间滚动。这是同进程、顺序执行、各一次且带采样开销的观察，不能推断故障发生率或普遍加速倍数。标记记录墙钟时间且可能嵌套，不同标记名称的总时长不能相加视为独占 CPU 成本。

测试始终保持无障碍服务开启，accessibility.force_disabled 保持 0。宿主在本地标识出了外部 UI Automation 激活方，但激活来源不能证明该客户端导致延迟；应用名称/路径及原始采样只留在本地。三次原生采样均未终止任何应用、未改动无障碍配置。结束后停止采样、恢复插件状态及功能配置、核验批注原文不变，并关闭全部测试 Reader。

[Worker 无法操作页面 DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)，也无法把这条原生 Windows 通知路径搬离 Zotero 主线程。纯文本规范化、Markdown 和 [KaTeX 字符串生成](https://katex.org/docs/api.html) 可作为以后按真实分段测量决定的 Worker 候选；当前渲染器还使用 DOMPurify 和 SVG DOM 解析，拆分必须保留安全边界、限制排队结果，并评估复制/内存及 Reader 生命周期。本次未引入 Worker 或新依赖。

### 原型中的关键处理

1. 在新开发 Reader 的 DOMContentLoaded 边界、createReader 执行前安装。初始化完成后的控制器无法阻止第一次完整原生列表创建；这里仍属于私有宿主接口实验。
2. 首次打开不需要缓存，只延迟 SidebarPreview 子树。保留原生行、标识、选择、焦点、排序及导航契约。大样本首批创建 12 个预览，其余 411 个占位。它不是删除屏外行的虚拟列表。
3. 首屏直接渲染。全部等待观察器的 19 行试验中，原生内容帧约 175 ms，缓存行和预览延迟方案反而约 340/414 ms。快速显示空占位不能算成功。当前首屏估计假设从列表顶部打开，恢复中间或末尾位置仍需适配。
4. 单观察器、去重队列，每任务最多两项或 8 ms 调度预算。单条很重的预览仍可能超出预算。
5. 快速滚动时暂停屏外创建，滚动静止 120 ms 后再处理；移除已经离开观察范围的排队项。加载导致前面内容变高时，以当前可见外层行补偿位置，并临时关闭、随后恢复浏览器滚动锚定。
6. 选中批注立即绕过延迟。滚动策略调整前，原生模式的远处目标在 2.5 秒后仍偏离视口；调整后，原生及开启 Markdown 两个测试约 799/802 ms 到达视口。另有独立焦点测试。完成的测试均核验原文、行顺序、四项配置恢复和 Reader 关闭。
7. 另有重新打开的缓存行试验：校验内容和布局、保留测得高度、对选中或失效项使用原生内容。它是次要增强，不能成为首次打开避免卡死的前提。缓存采集可以关闭。

测试 Reader 关闭前会还原工厂和组件、观察器、计时器及临时锚定样式。单独调用 stop 后保留仍带占位的活 Reader，不等于完成生产级关闭/重新启用流程。测试入口限定开发资料库、要求现有 Reader 为零，先在 .tmp 备份配置，finally 中恢复；进程被强制终止时 finally 无法执行，需要显式恢复。

### 外部库决策

2026-10-13 检查了 [Zotero Reader PR #156](https://github.com/zotero/reader/pull/156)：仍未合并，使用 react-intersection-observer 延迟预览及 100 px 占位。这个上游方向值得跟进，但作者的性能描述不是本次实测。

[TanStack Virtual](https://tanstack.com/virtual/latest/docs/api/virtualizer) 有尺寸估计、测量、初始测量快照、稳定标识、偏移和滚动补偿，适合未来自己拥有列表或建立原生导航适配层的情况。[React Virtuoso](https://virtuoso.dev/) 提供更完整的 React 变高列表，但要求更多列表和 React 集成控制。研究时的源码版本、提交及 MIT 许可见上表，均未选为当前依赖。

原生 AnnotationsView 映射整个批注列表，并直接查询 DOM 来选择、聚焦和滚动。两个库都不能自动提供更早的 Zotero 初始化入口，也不能直接保留这些契约。第一阶段使用原生 IntersectionObserver 和现有调度模式，不引入通用虚拟列表库，也不把原型扩展成自制通用虚拟化引擎。

### 接入前的验收门槛

- 能力探测、钩子所有权、安全回退、关闭/重载/异常/禁用清理必须完整；不能直接把测试入口对 Reader 数组的拦截当作正式 API。
- 重复验证无缓存和有缓存、恢复中间/末尾位置、PDF/EPUB、宽度/字体/公式输出设置、图片和选中展开状态；记录长阻塞、输入响应及关闭后内存恢复，并继续降低剩余的约 0.6 秒停顿。
- 补齐尚未加载预览的鼠标/触摸点击、原生右键菜单、键盘、编辑/保存/Escape、快捷编辑器。API 选择和焦点测试不能覆盖所有手势。
- 与筛选加速协调：禁止把占位高度当作最终测量高度。旧 XPI 的版本限制使该运行时未激活；当前构建中运行时已激活，却在 411 个预览仍处于占位时记录了 423 个缓存行，暴露缓存协调风险。启动时共同工作不代表筛选取消和这些缓存高度已验证。
- 重新打开缓存必须有容量和生命周期限制，校验实际侧栏宽度、内容版本、字体、图片和设置。原型完整字符串指纹只留在内存，不能直接成为生产缓存格式。没有缓存也必须能避免首次打开卡死。

源码、宿主测试入口和回归测试见上面的文件链接。聚焦检查通过 30 项测试，包含既有原生行加速测试。新增回归覆盖早期安装、原函数恢复、不支持的运行时、缓存失效、首屏同步、过期滚动任务取消、滚动静止调度与锚定样式恢复。完整验证通过 36 个测试文件、952 项测试、类型检查、中英文文档检查、构建和打包；生产依赖审计没有已知漏洞。本地打包后已恢复正式 updates.json 的原始内容。

公开证据不含批注内容/标识、书籍元数据、资料库路径或截图。开发原始日志及无效的自动前台辅助脚本只保存在已忽略的 .tmp 中。
