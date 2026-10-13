# SVG graded degradation production integration / SVG 分级降级正式接入

Date / 日期: 2026-10-13

## Behavior and dependencies

The production SVG renderer now returns structured **complete**, **degraded** or **fallback** results through `renderDetailed()`, while its existing string API continues serving Markdown fences and raw SVG. XML is parsed once. Only `text-rendering`, `shape-rendering` and `cursor` with a single keyword may be omitted from presentation attributes or supported class rules. A persistent warning lists omitted properties and the total count, and is also displayed in the larger-image viewer. Image-load failure hides that warning and reveals the original source.

All original CSS is scanned before omissions, including unused/overridden values. Original source, element, nesting, dimension, rule, selector, declaration and embedded-font limits remain enforced. Every font shorthand counts as four declarations. CSS parse recovery, unknown meaningful properties, active content, external resources, unsupported geometry/fonts/references and foreign namespaces still reject the input. Existing harmless empty declaration separators are normalized before parsing; strings remain literal. The final DOMPurify pass still runs in the isolated SVG image context.

- Runtime dependency: **css-tree 3.2.1**, importing only `css-tree/parser` and `css-tree/walker`. Type dependency: **@types/css-tree 3.2.0**. The [official exports](https://github.com/csstree/csstree#exports) support this modular boundary. Full lexer, resvg/WASM and SVGO remain deferred for the reasons in the [historical assessment](2026-10-13-svg-degradation-assessment.md).
- `src/svg-diagnostics.ts` owns typed and bounded omission diagnostics; `src/svg-class-styles.ts` owns CSS validation and declaration order; `src/svg-renderer.ts` owns XML validation and image creation; `src/svg-preview-viewer.ts` copies the warning as text and includes its unscaled height in viewer fitting.
- The historical wrapper remains an independent comparison tool. Its strict reference explicitly disables production degradation with `allowDegradation: false`; it is not used by the plugin.

## Verification

- `pnpm run verify`: **35 files / 859 tests**, TypeScript, five bilingual documentation pairs, build and local XPI packaging passed. The additional production/lifecycle regressions cover public Markdown/raw inputs, original source, one XML parse, font cascade, omission counts, unsafe/unused/overridden CSS, parsing failures, original resource bounds, viewer document replacement, preference/cache refresh, editing, image failure and cleanup.
- The independent assessment still passes **76 cases: 8 complete, 19 degraded, 49 fallback**. Current bundle measurements describe the integrated renderer; earlier recorded sizes belong to commit `90b1a93`.
- The [measurement snapshot](2026-10-13-svg-degradation-integration.json) records the native saved-annotation tests in Zotero 10.0.6 / Firefox 140. Both the Jordan diagram and the supplied EFA table passed all nine Reader checks: saved preview/source preservation, pixel comparison, viewer warning/Escape/focus, setting/cache refresh, image-load fallback, editing to complete preview, editing to unsafe source fallback, disable cleanup and re-enable. Both had zero changed pixels (179,200 and 1,056,000 pixels respectively). The development-only [driver](../../scripts/prototypes/svg-degradation-integration-native-qa.js) uses the actual Reader manager and fast editor; fixture comments and preferences were restored in `finally`.
- The integrated SVG boundary measures **115,202 minified bytes / 37,411 gzip bytes**, versus the pre-integration boundary's 47,642 / 17,937 bytes: +67,560 / +19,474 bytes. These are isolated boundary bundles, not the whole plugin. No full lexer dictionary is imported.
- The local XPI stays at version **0.14.3**. Published `updates.json` is restored byte for byte after packaging. The package is installed only in the dedicated development profile; no daily-profile installation, version bump, push or publication is included.

## Native reproduction

Install the local test XPI into a dedicated development profile and show its Reader; a hidden/occluded Reader can throttle layout callbacks. Open the repository's synthetic regression PDF and identify a fixture annotation belonging to that Reader. Load the driver through the development bridge, then call:

```js
const run = new Function(driverText + "\nreturn runSvgDegradationIntegrationNativeQa;")();
await run({ root: repositoryRoot, expectedProfile: dedicatedProfile, annotationID: fixtureID, fixture: "efa-font-shorthand" });
```

Both paths must be explicit absolute paths. The profile guard and parent-Reader check run before any mutation. The test temporarily replaces only the selected synthetic fixture's comment, exercises saved edits through the same Reader manager used by the plugin, and restores its source/preferences. Raw evidence and the local XPI are retained in `output/svg-degradation-integration/`.

## 中文

正式 SVG 渲染器已通过 `renderDetailed()` 返回完整、降级或源码回退的结构化结果；现有字符串接口继续服务代码围栏和裸 SVG，XML 只解析一次。首批只允许省略表现属性或受支持类规则中的 `text-rendering`、`shape-rendering` 和 `cursor`，且值必须是单个简单关键字。持续显示的提示列出属性及省略总次数，大图查看器保留相同提示。图片加载失败时隐藏兼容提示并显示原始源码。

- 省略前检查所有原始 CSS，包括未使用或被覆盖的值；原始源码、元素、深度、尺寸、规则、选择器、声明及内嵌字体限制继续生效，每条字体简写计为四条声明。CSS 解析恢复、影响图意的未知属性、主动内容、外部资源、不支持的几何/字体/引用和外来命名空间继续回退。原来支持的无意义空声明分隔符在解析前规范化，字符串保持字面内容；最终 DOMPurify 净化仍在隔离 SVG 图片上下文执行。
- 正式引入 **css-tree 3.2.1** 的 parser/walker，开发类型依赖为 **@types/css-tree 3.2.0**，仅导入需要的子模块。[官方导出说明](https://github.com/csstree/csstree#exports)支持此边界；完整 lexer、resvg/WASM 和 SVGO 仍按[接入前评估](2026-10-13-svg-degradation-assessment.md)的理由暂缓。
- `svg-diagnostics.ts` 管理有类型且数量受限的省略诊断，`svg-class-styles.ts` 负责 CSS 校验和声明顺序，`svg-renderer.ts` 负责 XML 校验与隔离图片，`svg-preview-viewer.ts` 以文字复制提示并把其未缩放高度计入大图适配。历史原型只作独立对比，严格参考路径显式使用 `allowDegradation: false`，正式插件不调用该包装器。
- 完整验证通过：**35 个测试文件、859 项测试**、类型检查、五组双语文档、构建和本地 XPI 打包。新增回归覆盖正式 Markdown/裸 SVG 入口、源码保留、单次 XML 解析、字体层叠、省略计数、危险/未使用/被覆盖 CSS、解析失败、原始资源上限、查看器文档替换、设置与缓存刷新、编辑、加载失败和清理。
- 独立评估的 **76 个样例仍全部通过：8 个完整、19 个降级、49 个回退**。当前构建体积对应已接入的渲染器；先前体积对应提交 `90b1a93`。
- [测量快照](2026-10-13-svg-degradation-integration.json)记录 Zotero 10.0.6 / Firefox 140 中保存的测试批注。Jordan 图和用户提供的 EFA 表格均通过九项真实 Reader 检查：保存后的预览与源码保留、像素对比、大图提示/Escape/焦点、设置与缓存刷新、加载失败回退、编辑后完整预览、编辑危险内容后源码回退、禁用清理及重新开启。两图分别比较 179,200 和 1,056,000 个像素，均为零差异。[开发验证脚本](../../scripts/prototypes/svg-degradation-integration-native-qa.js)调用实际 Reader 管理器和快速编辑器，测试评论与偏好均已在 `finally` 中恢复。
- 已接入的独立 SVG 边界构建为 **115,202 字节压缩代码 / 37,411 字节 gzip**，接入前为 47,642 / 17,937 字节，增加 67,560 / 19,474 字节。此数字对应独立边界构建，不是整个插件；未导入完整 lexer 语法字典。
- 本地 XPI 保持 **0.14.3**，打包后逐字节恢复已发布的 `updates.json`，仅安装到独立开发配置。本次不安装到日常配置、不升级版本、不推送或发布。
- 复现时须显示独立开发 Reader；隐藏或被遮挡的 Reader 会节流布局回调。打开合成回归 PDF，选择属于该 Reader 的测试批注，通过开发桥加载脚本并按上方示例传入仓库绝对路径、独立配置绝对路径、测试批注 ID 和样例名称。配置和所属 Reader 校验发生在修改前；仅临时替换该合成测试批注的评论，通过正式管理器保存编辑，结束后恢复源码与偏好。原始证据及测试 XPI 保留在 `output/svg-degradation-integration/`。
