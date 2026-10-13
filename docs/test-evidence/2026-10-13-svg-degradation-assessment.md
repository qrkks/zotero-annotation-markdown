# SVG graded degradation assessment / SVG 分级降级原型评估

Date / 日期: 2026-10-13

Historical assessment at commit `90b1a93`, before production integration. Its measurements and prototype decisions describe that snapshot; see the [production integration record](2026-10-13-svg-degradation-integration.md) for current behavior.

本文记录提交 `90b1a93` 的接入前评估；测量及原型决策对应当时快照，当前行为请参见[正式接入记录](2026-10-13-svg-degradation-integration.md)。

## Decision

Use three explicit rendering outcomes: **complete**, **degraded with a warning**, and **source fallback with a reason**. A parser library supports this policy; it does not decide what is safe to omit. The isolated prototype uses the [css-tree parser and walker](https://github.com/csstree/csstree), the existing strict SVG validator, and the existing DOMPurify/image boundary. It is not connected to the shipped plugin.

| Input | Outcome |
| --- | --- |
| Supported static SVG | Complete preview |
| Keyword-only `text-rendering`, `shape-rendering` or `cursor` hints | Omit those hints in the preview copy; show a persistent degradation warning |
| Unsupported geometry, transforms, arrows, masks, meaningful styles or selectors | Source fallback |
| Active content, external resources, document declarations, processing instructions, namespaces, unparsed CSS or resource-limit violations | Source fallback |

The original source and its fallback stay unchanged. Scan every stylesheet, including unused and overridden declarations, before removing anything. Discarded declarations still count toward original complexity limits, including four longhands per `font` shorthand. CSS parsing errors and `Raw` nodes block degradation. Neither unknown properties nor arbitrary nodes are silently removed.

## Dependency decision

Proceed to production integration with **css-tree 3.2.1 parser/walker**, retain the existing **DOMPurify** sanitization and **Gecko** image rendering, and add **@types/css-tree 3.2.0** as a development-only type dependency when the TypeScript integration lands. These are planned changes; production dependencies have not been modified by the prototype assessment. The browser bundle should import only the parser/walker entry points, not the entire package API.

| Deferred component | Reason | Reconsider when |
| --- | --- | --- |
| Full css-tree lexer | Broad CSS syntax matching is unnecessary for the current bounded subset and does not replace URL, resource or omission policy. The standalone full parser/lexer probe costs 200,751 minified bytes / 56,327 gzip bytes. | The supported CSS property/value grammar grows enough to justify the full syntax dictionary. |
| resvg / resvg-wasm | Gecko already provides the tested preview renderer. Another engine requires WASM/font setup and rendering-parity checks; PNG output adds resolution or re-rendering work for zoom. | PNG export, headless/batch conversion or rendering outside Zotero is needed. |
| SVGO | SVG optimization is not the current compatibility problem. Rewritten output needs equivalence checks, and script removal is not sufficient protection for untrusted SVG. | Optimizing trusted icons/assets or an explicit export pipeline is needed. |

References: [css-tree modular exports and syntax validation](https://github.com/csstree/csstree#exports), [resvg-js browser/WASM and PNG support](https://github.com/thx/resvg-js), [SVGO security guidance](https://github.com/svg/svgo/security/advisories/GHSA-4vpr-x523-8j87), [DOMPurify CSS security boundary](https://github.com/cure53/DOMPurify/wiki/Security-Goals-%26-Threat-Model).

## Implementation and verification

- [Prototype](../../scripts/prototypes/svg-degradation.mjs) and [assessment runner](../../scripts/assess-svg-degradation.mjs) are separate from `src/`. The initial strict-render fast path is preserved. Only a rejected input containing a candidate display hint reaches the controlled degradation attempt.
- **76 cases passed:** 8 complete previews, 19 degraded previews and 49 source fallbacks. Existing issue samples, the Chinese Jordan diagram and both EFA fixtures preserve their drawing snapshots. Degraded cases preserve font resets, declaration order, inheritance and the original fallback source.
- Rejection cases include unsafe URLs hidden after a harmless hint, unused/overridden unsafe declarations, imports, executable CSS, escapes, parse recovery, `!important`, functions, script/events/foreign content, unsupported paths and transforms, broken arrow references, masks and duplicate IDs. Original source-size, element, depth, image-size, rule and declaration limits remain enforced before omission.
- Zotero 10.0.6 / Firefox 140 tests ran in the dedicated development profile's actual Reader window using the [native QA driver](../../scripts/prototypes/svg-degradation-native-qa.js). The Jordan diagram, both original EFA diagrams and the degraded EFA table each had **0 changed pixels** versus their expected reference. The degraded case displayed its warning; an external-resource case produced no image. No user SVG/style/script nodes entered the preview HTML.
- Experimental css-tree 3.2.1 is installed only in the isolated `.tmp/svg-degradation-lab` workspace. The production manifest and lockfile are unchanged by this assessment. Raw JSON measurements and browser bundles are retained in `output/svg-degradation-assessment/`.
- A portable [measurement snapshot](2026-10-13-svg-degradation-assessment.json) records case counts, artifact sizes and native comparisons/timings without local profile paths.

## Cost and integration plan

| Browser bundle | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Existing SVG boundary | 47,642 | 17,937 |
| Boundary plus prototype/parser/walker/policy | 117,946 | 37,428 |
| Standalone full parser/lexer probe | 200,751 | 56,327 |

The prototype adds 70,304 minified bytes / 19,491 gzip bytes. The full lexer probe is a separate artifact, not an alternative complete SVG boundary. It is unnecessary for the current display-hint policy.

The final native microbenchmark measured the same EFA table at median/P95 **23/28 ms** on the strict path, **25/37 ms** on the prototype's complete path, and **34/45 ms** on its degraded path. Each has 30 timed samples after warm-up. Timings varied across runs and are exploratory, not end-to-end Reader performance guarantees. The wrapper retries parsing and validation during degradation; production integration should reuse a single parsed SVG and classify recoverable issues within validation.

For production, return a structured result and typed diagnostics from the SVG boundary rather than classifying HTML prefixes or error strings. Preserve existing safety/resource checks, collect only explicitly permitted omissions, perform final SVG-context sanitization, and render an image plus a warning. Propagate that warning to the larger-image viewer. Test source editing, selection/focus, image-load fallback, setting toggles, cache cleanup and warning lifecycle in real saved annotations before packaging. No production behavior change, XPI installation, version bump or publication occurred in this assessment.

## Reproduce the isolated assessment

Run from the repository root in PowerShell:

```powershell
$taskSvgLab = Join-Path (Get-Location) '.tmp/svg-degradation-lab'
New-Item -ItemType Directory -Path $taskSvgLab -Force | Out-Null
[System.IO.File]::WriteAllText((Join-Path $taskSvgLab 'package.json'), '{"name":"svg-degradation-lab","private":true,"type":"module"}')
[System.IO.File]::WriteAllText((Join-Path $taskSvgLab 'pnpm-workspace.yaml'), "packages:`n  - '.'`n")
pnpm --dir $taskSvgLab add css-tree@3.2.1 --ignore-scripts
node scripts/assess-svg-degradation.mjs
```

Load the native QA driver through the Zotero development bridge's privileged JavaScript tool and call `runSvgDegradationNativeQa({ root, expectedProfile })` with the absolute repository root and the explicit dedicated development-profile path. The caller can load it with `new Function(driverText + "\nreturn runSvgDegradationNativeQa;")()`. The profile guard rejects other profiles before reading bundles or writing evidence. The driver performs off-DOM image comparisons and writes local evidence; it does not install an XPI or edit library annotations.

## 中文

采用三种明确结果：**完整预览、带提示的降级预览、带原因的源码回退**。解析库负责识别语法，安全省略策略由插件定义。独立原型使用 [css-tree 的 parser/walker](https://github.com/csstree/csstree)、现有严格 SVG 校验器以及 DOMPurify/隔离图片边界，尚未接入正式插件。

- 选型决策：正式接入采用 **css-tree 3.2.1 的 parser/walker**，保留已有 **DOMPurify** 净化及 **Gecko** 图片渲染；TypeScript 接入时增加开发类型依赖 **@types/css-tree 3.2.0**。浏览器构建只导入需要的子模块；目前这是计划，原型尚未修改正式依赖。
- 暂缓完整 lexer：当前受限属性集合不需要完整 CSS 语法字典，语法合法也不能替代 URL、资源及省略策略；以后属性/值语法显著扩展时再评估。
- 暂缓 resvg/WASM：已有经过验证的 Gecko 预览；新引擎会增加 WASM/字体配置和渲染一致性验证，PNG 缩放还需分辨率或重渲染处理。以后需要 PNG 导出、后台批量转换或脱离 Zotero 的渲染时再评估。
- 暂缓 SVGO：当前需求是输入兼容；优化改写还须验证图形等价性，脚本移除也不足以单独保护不可信 SVG。以后优化可信图标/资源或构建导出流程时再评估。上面的官方链接记录各组件职责和边界。
- 支持的静态 SVG 完整预览；仅含简单关键字的 `text-rendering`、`shape-rendering`、`cursor` 显示提示，可在预览副本中省略并持续提示。
- 不支持的几何、变换、箭头、遮罩、会影响图意的样式和选择器，继续源码回退。主动内容、外部资源、文档声明、处理指令、异常命名空间、未解析的 CSS 与资源超限也继续回退。
- 原始源码及回退内容不变。省略前扫描所有样式表，包含未使用、被覆盖的声明；省略项仍计入原有复杂度上限，每条 `font` 简写按四条属性计数。解析错误与 `Raw` 节点阻止降级，不盲目删除未知属性或任意节点。
- [原型](../../scripts/prototypes/svg-degradation.mjs)与[评估脚本](../../scripts/assess-svg-degradation.mjs)独立于 `src/`。先走原有严格渲染快路径；只有失败且包含候选显示提示时，才尝试受控降级。
- **76 个样例全部通过：8 个完整预览、19 个降级预览、49 个源码回退。** 已有 issue 样例、中文 Jordan 图及两份 EFA 图保留绘图快照；降级样例保留字体重置、声明顺序、继承和原始源码。
- 回退测试覆盖无害提示后隐藏的危险 URL、未使用/被覆盖的危险声明、导入、可执行 CSS、转义、解析恢复、`!important`、函数、脚本/事件/外来内容、不支持的路径和变换、损坏的箭头引用、遮罩、重复 ID，以及原始源码大小、元素、深度、尺寸、规则和声明上限。
- [原生验证脚本](../../scripts/prototypes/svg-degradation-native-qa.js)在 Zotero 10.0.6 / Firefox 140 独立开发配置的实际 Reader 中运行。Jordan 图、两份原始 EFA 图及降级后的 EFA 表格，与各自预期参考图片均为 **0 像素差异**。降级图显示提示；外部资源样例无图片；预览 HTML 不挂载用户 SVG/样式/脚本节点。
- css-tree 3.2.1 仅安装在独立的 `.tmp/svg-degradation-lab` 工作区，本次评估不改变正式依赖清单或锁文件。原始 JSON 与浏览器构建保留在 `output/svg-degradation-assessment/`。
- 可移植的[测量快照](2026-10-13-svg-degradation-assessment.json)保存样例数量、构建大小、原生对比及耗时，不含本地配置路径。
- 原型加 parser/walker/策略相对原 SVG 边界增加 70,304 字节压缩代码、19,491 字节 gzip 数据。完整 parser/lexer 探针是单独的评估产物，当前策略不需要引入完整 lexer。
- 最后一轮原生微基准中，同一 EFA 表格的严格路径中位数/P95 为 **23/28 ms**，原型完整路径为 **25/37 ms**，降级路径为 **34/45 ms**；每条路径预热后测量 30 次。多轮结果存在波动，不能当作 Reader 全流程性能保证。正式接入应在一次 SVG 解析和校验中处理分级问题，避免原型的重复解析。
- 正式接入时，应返回结构化结果和有类型的诊断，保留安全/资源限制，只收集明确允许的省略项，完成最终 SVG 上下文净化，再输出隔离图片及提示，并把提示同步到大图查看器。打包前须验证实际保存批注的编辑、选择/焦点、图片加载回退、开关、缓存清理和提示生命周期。本次仅原型评估，未改变正式行为、安装 XPI、升级版本或发布。
- 可按上面的 PowerShell 命令重建独立评估。通过 Zotero 调试桥加载原生脚本后，显式传入仓库绝对路径和独立开发配置路径，调用 `runSvgDegradationNativeQa({ root, expectedProfile })`；配置不匹配时，在读取构建或写入证据前即停止。脚本记录脱离实时 DOM 的图片对比，不安装插件或编辑文献库批注。
