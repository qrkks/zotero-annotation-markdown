# Document-opening acceleration deferred / 文件打开加速暂缓发布

Date / 日期: 2026-10-14

## English

Exclude document-opening acceleration from v0.15.0. The user reported acceptable
responsiveness after several manual opens, but chose to keep this broader native
Reader monkey patch on a separate branch for later discussion. No rollout or
default-setting change is implied by that qualitative acceptance.

The complete implementation, settings, startup/session/tab-load hooks and their
regression tests are preserved on
[`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment),
at commit `7b74352`. Main retains the assessment, aggregate test evidence,
development-only probe and probe regressions. Those artifacts are not imported
by the packaged add-on. The release has no document-opening setting or native
Reader startup/session/tab-load hook.

Keep the earlier measurements unchanged: four process restarts retained one
Reader, strict body readiness took approximately 39–41 seconds from launch,
and a clean-start live-disable recovery completed in 54.8 seconds. Earlier warm
recovery exceeded the 60-second check. The user's manual experience complements
these timer-based responsiveness proxies; it does not establish broad host or
document compatibility. Revisit those limits before promoting the branch.

The release proceeds with SVG font-shorthand compatibility and graded fallback,
outline numbering and smart ordinal avoidance, native MathML label cleanup, and
Reader compatibility probing for the existing tag-filter acceleration. SVG and
tag-filter acceleration retain their experimental labels and off-by-default
settings. Tag-filter acceleration still requires exact cached row heights and
does not accelerate the first document open.

Preserved records:

- [Initial assessment](2026-10-13-reader-startup-assessment.md)
- [Earlier release gate](2026-10-14-reader-startup-release-gate.md)
- [Fixes and repeat checks](2026-10-14-reader-startup-fixes.md)
- [Initial evidence](../test-evidence/2026-10-13-reader-startup.json)
- [Earlier acceptance evidence](../test-evidence/2026-10-14-reader-startup-acceptance.json)
- [Final experimental evidence](../test-evidence/2026-10-14-reader-startup-fixes.json)

## 简体中文

文件打开加速不包含在 v0.15.0 中。用户多次手动打开后认为响应性已经可以接受，但
选择把涉及原生 Reader 启动路径的猴子补丁单独保留在分支，以后再讨论。此次手动
反馈不代表扩大启用范围或修改默认值。

完整实现、设置、启动/会话/标签加载挂钩及相应回归测试保留在
[`qrkks/reader-startup-experiment`](https://github.com/qrkks/zotero-annotation-markdown/tree/qrkks/reader-startup-experiment)
分支，提交为 `7b74352`。主线保留评估、汇总测试证据、仅供开发使用的探针及探针
回归测试；打包的插件不会导入这些实验成果，发布包没有文件打开加速设置，也不
安装原生 Reader 启动、会话或标签加载挂钩。

此前数据保持原样：四次进程重启均只保留一个 Reader，从启动到严格正文就绪约
39–41 秒；重新启动后的禁用恢复用时 54.8 秒，早期暖环境恢复超过 60 秒检查线。
用户手动反馈补充了这些基于计时间隔的响应性指标，不能据此证明全部宿主与文档
的兼容性。以后推进该分支前，仍需复核这些限制。

本次继续发布 SVG 字体简写兼容与分级回退、大纲编号及智能避让、原生 MathML 标签
调整，以及既有标签筛选加速的 Reader 兼容性探测。SVG 与标签筛选加速保留实验性
标签、继续默认关闭。标签筛选加速仍要求精确行高缓存，不加速文档首次打开。

上面列出的评估和测试证据全部保留，供后续讨论与验证使用。
