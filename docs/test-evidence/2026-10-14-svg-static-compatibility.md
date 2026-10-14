# SVG static compatibility validation / SVG 静态兼容验证

Date / 日期: 2026-10-14

## English

The change supports simple selectors for existing SVG elements, CSS class/type
specificity and validated root accessibility metadata. It retains source text,
the isolated-image boundary and existing resource/complexity limits, with no new
dependencies. The supplied FACIT-COST fixture passes through labeled fences,
unlabeled fences and standalone raw SVG input.

Automated verification passed **38 test files / 1,027 tests**, type checking,
five bilingual documentation pairs, build and package-content/hash checks.
Coverage includes mixed selector groups, inheritance, embedded fonts, escaped
metadata, unsafe/unsupported inputs, resource limits, the viewer, preference
refresh, source preservation and cleanup.

The local candidate is `zotero-annotation-markdown-0.15.0-svg-compat-test.xpi`,
1181698 bytes, SHA-256 `27bf33b23ae5d9d81e2e6f65337206655b3ef07daeb7bfb9911925f71b609c55`.
The published update manifest was restored after packaging. The user reported no
issues after trying the provided candidate. Host version and individual manual
check results were not supplied. This records a user report, not an independently
instrumented native test run.

## 简体中文

本次支持已有 SVG 元素的简单选择器、CSS 类/元素优先级，以及经过校验的根元素
无障碍标注。保留源码、隔离图片边界及原有资源/复杂度限制，没有新增依赖。
用户提供的 FACIT-COST 样例通过带语言围栏、无语言围栏和独立裸 SVG 三种输入验证。

自动检查通过 **38 个测试文件、1,027 项测试**、类型检查、五组双语文档检查、
构建及包内容/哈希检查。覆盖混合选择器分组、继承、内嵌字体、标注文字转义、
危险/不支持的输入、资源上限、大图查看器、设置刷新、源码保留及清理。

本地候选包为 `zotero-annotation-markdown-0.15.0-svg-compat-test.xpi`，大小
1181698 字节，SHA-256 为 `27bf33b23ae5d9d81e2e6f65337206655b3ef07daeb7bfb9911925f71b609c55`。
打包后已恢复正式更新清单。用户试用候选包后反馈未发现问题；未提供宿主版本或
逐项实测结果。本记录保存用户反馈，不把它记为独立采集的原生环境自动测试。

[Structured evidence / 结构化记录](2026-10-14-svg-static-compatibility.json)
