# Changelog

## 0.12.1 - 2026-10-08

### Fixed

- Initialize page annotation popup rendering when a Reader opens with the annotation sidebar closed, without requiring the sidebar to be opened once first ([#2](https://github.com/qrkks/zotero-annotation-markdown/issues/2)).

### 修复

- 修复批注侧栏关闭时新打开的 Reader 未初始化页面批注弹窗渲染的问题，无需先打开一次侧栏即可渲染弹窗（[#2](https://github.com/qrkks/zotero-annotation-markdown/issues/2)）。

## 0.12.0 - 2026-10-08

### Added

- Add optional native MathML output under **Math rendering** in Settings, marked experimental and off by default. Switching output refreshes open Readers and preserves formula source; native formula spacing and typography may differ.

### Why try native MathML?

Formula-heavy annotations can render with less work and less generated markup when Zotero lays out MathML directly, without the companion KaTeX HTML formula tree. In a Windows / Zotero 10.0.5 test with 413 nonempty annotation comments, rendering and sanitization took 62.6% less time, DOM mounting and synchronous layout took 52.3% less time, and cumulative generated DOM elements fell by 63.1%. A separate retained-preview probe with the 12 longest comments reduced additional allocated memory from 106.9 MiB to 37.8 MiB. These are controlled preview measurements; they do not establish a reduction in total Zotero RAM or a meaningful improvement in Reader startup time.

To try it, open **Settings → Annotation Markdown → Math rendering → Native MathML only (Experimental)**. Formula spacing, height, and typography can differ. **KaTeX HTML + MathML (default)** remains the default and is available to switch back at any time.

See the [MathML-only benchmark, native interaction tests, and visual comparison](https://github.com/qrkks/zotero-annotation-markdown/blob/v0.12.0/docs/performance-investigations/2026-10-08-mathml-only.md) for the sample, methodology, results, and limitations.

### Changed

- Clarify the math-output choices and use consistent **font size** labels for Markdown previews and the floating outline.

### Fixed

- Preserve formula scroll positions when identical preview output is refreshed after focus or DOM attribute changes, including wide formulas in page annotation popups.
- Avoid packaging standalone KaTeX WOFF2 fonts that are already embedded in the stylesheet; retain WOFF and TTF fallbacks.

### 新增

- 在设置的 **Math rendering** 中添加默认关闭的原生 MathML 实验选项。切换后即时刷新已打开的 Reader，并保留公式源码；原生公式间距和字体外观可能有所不同。

### 为什么尝试原生 MathML 直出？

公式多、标注长时，由 Zotero 直接排版 MathML，可以省去配套的 KaTeX HTML 公式节点，减少渲染工作和生成的内容。在 Windows / Zotero 10.0.5 上对 413 条非空标注评论的测试中，渲染与清理耗时减少 62.6%，DOM 挂载与同步布局耗时减少 52.3%，累计生成的 DOM 元素减少 63.1%。另一个保留最长 12 条标注预览的测试中，额外分配的内存从 106.9 MiB 降至 37.8 MiB。这些是受控的预览测试结果，不代表整个 Zotero 的内存会按相同比例下降，也尚未证明 Reader 打开速度有明显提升。

在 **设置 → Annotation Markdown → Math rendering → Native MathML only (Experimental)** 中开启。公式间距、高度和字体外观可能有所不同，因此继续标为实验选项；默认仍是 **KaTeX HTML + MathML (default)**，可以随时切回。

完整样本、方法、结果和适用范围见 [MathML 直出性能测试、原生交互验证与排版对照](https://github.com/qrkks/zotero-annotation-markdown/blob/v0.12.0/docs/performance-investigations/2026-10-08-mathml-only.md)。

### 变更

- 明确公式渲染方式的名称，并统一 Markdown 预览与浮动大纲的 **font size** 文案。

### 修复

- 在焦点或 DOM 属性变化后刷新相同预览内容时保留公式滚动位置，包括页内标注弹窗中的宽公式。
- 避免重复打包已嵌入样式表的 KaTeX WOFF2 字体，同时保留 WOFF 和 TTF 回退字体。

## 0.11.1 - 2026-10-07

### Fixed

- Update DOMPurify to 3.4.16 and KaTeX to 0.18.2 to address upstream security advisories.

### Changed

- Add real-Zotero screenshots to both READMEs and clarify the markdown-it origins of highlight syntax.

### 修复

- 更新 DOMPurify 至 3.4.16、KaTeX 至 0.18.2，修复上游安全公告涉及的问题。

### 变更

- 为中英文 README 添加真实 Zotero 截图，并说明高亮语法在 markdown-it 生态中的来源。

## 0.11.0 - 2026-09-30

### Added

- Add optional acceleration when clearing tag filters restores many annotations. The experimental option is off by default and currently supports Zotero 10.0.3. It uses cached row heights and restores distant native rows in small batches; it does not accelerate the first opening.

### Changed

- Remove the experimental label from page annotation popup Markdown rendering. Keep its independent switch and off-by-default behavior.
- Clarify when experimental tag-filter restoration acceleration applies, including when to enable it, its supported Zotero version, and the first-opening limitation.

### Fixed

- Keep popup and sidebar Markdown previews synchronized after editing the same annotation, and stabilize formula scrolling in popups.
- Reduce add-on overhead when opening large annotation lists, including when Markdown rendering is disabled.
- Support Markdown emphasis boundaries next to CJK text.
- Update markdown-it to 14.3.1 to fix excessive processing time for certain automatically linked text.

### 新增

- 新增可选的标签筛选恢复加速功能，减少取消筛选时大量标注恢复造成的卡顿。该实验性选项默认关闭，目前支持 Zotero 10.0.3，使用缓存行高并分批恢复远处原生标注行，不加速首次打开。

### 变更

- 移除页内标注弹窗 Markdown 渲染的实验性标签，保留独立开关和默认关闭行为。
- 补充实验性标签筛选恢复加速的使用条件，说明开启时机、支持的 Zotero 版本和首次打开限制。

### 修复

- 编辑同一条标注后，同步弹窗与侧栏的 Markdown 预览，并稳定弹窗中的公式滚动。
- 减少大型标注列表打开时的插件开销，包括 Markdown 渲染关闭时的额外开销。
- 支持紧邻中日韩文字的 Markdown 强调语法边界。
- 更新 markdown-it 至 14.3.1，修复部分自动链接文本处理耗时过长的问题。

## 0.10.2 - 2026-09-28

### Fixed

- Open the fast editor automatically for newly focused empty page annotation popups after Zotero's layout settles, without requiring a second click.
- Keep popup fast editing independent from experimental popup Markdown rendering, preserve the native fallback, and cancel automatic takeover when focus moves elsewhere.

### 修复

- 新建空页内标注弹窗获得焦点后，等待 Zotero 布局稳定并自动打开快速编辑器，无需再次点击。
- 将弹窗快速编辑与实验性弹窗 Markdown 渲染解耦，保留原生回退，并在焦点移到别处时取消自动接管。

## 0.10.1 - 2026-09-27

### Fixed

- Keep page annotation popups open when Escape exits the fast editor, returning to the Markdown preview on the first press.
- Stabilize popup outline clicks and hover tooltips while Zotero continues updating popup DOM and position.
- Make first-time editing of empty popup comments predictable, retain scrolling after large pastes, restore the native Add Comment entry when left empty, and keep newly rendered long previews inside the Reader viewport.

### 修复

- 在快速编辑器中首次按下 Escape 时仅退出编辑并返回 Markdown 预览，不再同时关闭页内标注弹窗。
- Zotero 持续更新弹窗 DOM 和位置时，保持弹出大纲的点击与悬停提示稳定可用。
- 统一空弹出评论的首次编辑行为；大量粘贴后保持可滚动，内容仍为空时恢复原生“添加评论”入口，并将新生成的长预览限制在 Reader 可视区域内。

## 0.10.0 - 2026-09-25

### Added

- Extend the floating outline to long rendered page annotation popups with at least two headings. The popup outline stays outside Zotero's annotation DOM, follows the remembered open/closed preference, and remains hidden while editing.

### Improved

- Reveal popup Markdown and its outline together only after layout settles, keep them visible through repeated Zotero position and child-list updates, and cap the initial hidden wait when Zotero's final position is delayed.
- Keep the compact popup outline label on one line and constrain the expanded panel to the available viewport height.

### 新增

- 浮动大纲现已支持包含至少两个标题的长页内标注弹窗。弹窗大纲位于 Zotero 标注 DOM 之外，沿用已记住的展开/收起偏好，并在编辑时保持隐藏。

### 改进

- 仅在布局稳定后同时显示弹窗 Markdown 与大纲；Zotero 后续反复更新位置或子节点时保持可见，并在最终定位延迟时限制首次隐藏等待时间。
- 弹窗大纲的小标签保持单行，展开面板高度限制在当前视口可用空间内。

## 0.9.0 - 2026-09-23

### Added

- Add safe optional color suffixes for highlighted Markdown, such as `==Risk=={.red}`, with yellow, red, orange, green, blue, purple, and gray presets.
- Add an off-by-default **Render page annotation popups as Markdown (Experimental)** setting. When enabled, popup comments use Markdown previews and the fast editor when Zotero exposes the required update capability; disabling it returns popup sizing, positioning, display, and editing fully to Zotero.

### Improved

- Show formulas in floating outline entries by cloning the already-rendered visible KaTeX DOM from their headings, without parsing the formulas again. Hover tooltips preserve the source TeX so complex formula structure remains unambiguous.
- Render Markdown comments reliably in page annotation popups, including when Zotero reuses popup DOM or replaces native popup content without changing the annotation ID. Native intermediate content and provisional positions stay hidden while Markdown renders; after Zotero's deferred measurement, the popup appears at its final native position without visible flicker or jumping. Popups use a stable wider viewport-aware width, and padded long previews scroll within a bounded area without entering editing.

### 新增

- 高亮 Markdown 新增安全的可选颜色后缀，例如 `==风险=={.red}`；支持黄色、红色、橙色、绿色、蓝色、紫色和灰色预设。
- 新增默认关闭的 **Render page annotation popups as Markdown (Experimental)** 设置。开启后，页内标注弹窗使用 Markdown 预览，并在 Zotero 提供所需更新能力时使用快速编辑器；关闭后，弹窗尺寸、定位、显示和编辑完全交还 Zotero。

### 改进

- 浮动大纲条目直接克隆标题中已经渲染的可见 KaTeX DOM 来显示公式，不再将公式降为纯文本，也不重复解析公式；鼠标悬停提示保留源 TeX，使复杂公式的结构保持明确。
- 页内标注弹窗稳定支持 Markdown 评论渲染，包括 Zotero 复用弹窗 DOM 或在注释 ID 不变时替换原生弹窗内容的情况。Markdown 渲染期间会屏蔽原生中间内容和临时位置；Zotero 延迟测量完成后，弹窗直接显示在最终原生位置，不再出现可见闪烁或跳动。弹窗使用更宽且受视口约束的稳定宽度，带内边距的长预览可纵向滚动且操作滚动条不会进入编辑。

## 0.8.1 - 2026-09-21

### Added

- Add a separate 80%–200% text size setting for the floating outline. Keep 100% at the previous size and widen the outline panel when enlarged, within the available reader space.
- Extend the Markdown preview font size choices from 150% up to 200%.
- Move the Markdown preview font size control into **Reader Annotations** beside its rendering options.
- Accept `t:` and `t：` as case-insensitive, line-leading shortcuts for automatic `todo` tagging and cleanup.

### 新增

- 浮动大纲新增独立的 80%–200% 文字大小设置；100% 保持原有大小，放大时在阅读器可用空间内相应加宽面板。
- Markdown 预览字号上限由 150% 提高到 200%。
- 将 Markdown 预览字号设置移入 **Reader Annotations** 分组，紧邻渲染选项。
- 自动 `todo` 标签及清理规则新增行首简写 `t:` 和 `t：`，不区分大小写。

### Fixed

- Keep math in floating outline titles concise by omitting KaTeX's duplicate accessibility and source text.

### 修复

- 浮动大纲的公式标题不再重复拼接 KaTeX 的辅助阅读文字与公式源码。

## 0.8.0 - 2026-09-19

### Added

- Optionally add a lowercase `todo` annotation tag when a saved comment contains a line-leading `todo:` or `todo：` directive in any letter case. The option is off by default.
- Add a separate, off-by-default cleanup option that removes the lowercase `todo` tag after a saved comment no longer contains a todo directive.
- Place the todo tag options in their own **Annotation Tags** settings group.

### 新增

- 可选功能：标注评论保存后若含行首 `todo:` 或 `todo：` 指令（不区分大小写），自动给标注添加小写 `todo` 标签；默认关闭。
- 新增独立的自动清理选项：评论保存后不再含待办指令时，移除该标注的小写 `todo` 标签；默认关闭。
- 将待办标签选项放入独立的 **Annotation Tags** 设置分组。

## 0.7.1 - 2026-09-17

### Fixed

- Preserve prose immediately following `$$...$$` display math, including multiline formulas and formulas in list items.
- Hide the floating outline when the annotation sidebar tab is not visible, including when a page annotation popup selects the corresponding hidden sidebar row.

### 修复

- 保留紧跟在 `$$...$$` 显示公式后的正文，包括多行公式和列表项中的公式。
- 当前侧栏不在“注释”标签页时隐藏浮动大纲，避免页内标注弹窗选中隐藏的侧栏标注后在左上角误显示大纲。

## 0.7.0 - 2026-09-10

### Added and improved

#### Floating outline

- Show a compact floating outline for the selected annotation when its rendered Markdown contains at least two headings. The outline stays fixed to the annotation-sidebar viewport, prefers the unobtrusive space to its right, falls back to the left when needed, follows heading hierarchy, highlights the current section, and scrolls only the annotation sidebar when a heading is chosen. It is enabled by default and can be disabled in the add-on settings.
- Remember the user's explicit outline open/closed choice across annotations, Readers, and Zotero restarts. Editing and annotations without an outline hide it temporarily without changing that preference.

#### Long annotation navigation

- Position selected annotations taller than the sidebar viewport near the top with a 2px inset, consistently when navigating forward or backward from the sidebar or document page.
- Use Zotero's native smooth selection scroll as the only scrolling action by adjusting the target's CSS scroll margins; short annotations retain native positioning.
- Preserve the visible sidebar position when leaving the fast editor with Escape. After the preview is restored, bring a completely offscreen annotation back with one smooth scroll to the same 2px inset.
- Cancel pending Escape recovery on new user input, another selection, editor re-entry, refresh, or shutdown. Ordinary blur does not pull the previous annotation back into view.

### 新增与改进

#### 浮动大纲

- 当前选中标注的 Markdown 预览包含至少两个标题时，显示紧凑的浮动大纲；大纲固定在标注侧栏视口，优先利用右侧空白、空间不足时回退到左侧，同时保留标题层级、高亮当前章节，点击标题时只滚动标注侧栏。该功能默认开启，也可在插件设置中关闭。
- 在不同标注、Reader 和 Zotero 重启后记住用户主动选择的大纲展开/收起状态；编辑或当前标注没有大纲时仅暂时隐藏，不改变该偏好。

#### 长标注导航

- 从侧栏或文档页面前后切换标注时，高于侧栏视口的单条选中标注会稳定定位到顶部，保留 2px 间距。
- 通过 CSS 滚动边距调整定位范围，由 Zotero 原生平滑滚动一次完成选择定位；短标注沿用原生定位。
- 按 Esc 退出快速编辑时保持可见的侧栏位置；预览恢复后，只有整条标注完全不可见时，才平滑滚动一次到相同的顶部 2px 位置。
- 新的用户操作、切换选中标注、重新编辑、刷新或关闭会取消待执行的 Esc 定位补救。普通失焦不会把上一条标注拉回视窗。

## 0.6.3 - 2026-09-02

### Changed

- Simplify the fast editor setting label and description to focus on reducing typing lag in documents with many annotations.

### Fixed

- Restore the fast editor's native right-click menu and keep cut, copy, and paste available without closing the editor.
- Keep the fast editor open while dragging the annotation sidebar scrollbar.
- Preserve the selected annotation and its expanded preview during sidebar scrolling.
- Keep caret placement working when clicking back into the fast editor after scrolling, without forced refocusing or sidebar jumps.
- Allow wide display equations to scroll horizontally without opening the comment editor or collapsing the preview.

### 调整

- 精简快速编辑器的设置名称和说明，突出减少批注较多的文档中的输入卡顿。

### 修复

- 恢复快速编辑器的原生右键菜单，使用剪切、复制和粘贴时保持编辑器打开。
- 拖动批注侧栏滚动条时保持快速编辑器打开。
- 侧栏滚动时保留批注选中状态及展开的预览。
- 滚动后点击快速编辑器可正常定位光标，避免强制重新聚焦和侧栏跳动。
- 支持超宽块级公式横向滚动，避免滚动时误入评论编辑或收起预览。

## 0.6.2 - 2026-08-26

### Fixed

- Preserve Weavero link colors in this plugin's rendered annotation previews, respect Weavero's `recolorAmLinks` setting, and retain Zotero's native link color as a fallback.

## 0.6.1 - 2026-08-23

### Fixed

- Keep newly saved fast-editor comments synchronized when Zotero refreshes the annotation DOM, so reopening an annotation immediately shows its source.
- Preserve the annotation's sidebar position after large pastes and reduce paste-related visual jumps.
- Restore native Ctrl/Cmd+A, Ctrl/Cmd+Z, and arrow-key behavior in fast comment editors, including annotations selected directly from the document page.
- Prevent rendered links from also opening the fast editor, including on repeated clicks.
- Preserve Weavero handling for supported `zotero://select`, `zotero://open`, `zotero://open-pdf`, and `zotero://note` links in rendered comments.

## 0.6.0 - 2026-08-20

### Added

- Add a fast annotation comment editor that bypasses Zotero's increasingly slow native editor in books with many sidebar tags.
- Enable the fast editor by default while retaining a preference that restores Zotero's native editor.
- Fall back automatically to Zotero's native editor when the Reader annotation update capability is unavailable.

### Changed

- Save fast-editor changes on blur or Escape, matching Zotero's native editing workflow without separate Save or Cancel controls.
- Grow the editor with its content and preserve the sidebar position of annotations that are already visible.
- Retain declared Zotero 9.0 compatibility while validating this release primarily on the latest Zotero 10 release.

### Fixed

- Preserve Backspace, Delete, and arrow-key behavior inside fast comment editors.
- Save and immediately render comments that were empty before editing.
- Avoid briefly showing Zotero's native editor before the fast editor takes over.
- Reduce sidebar scroll jumps when editing partially visible annotations in large books.

### Further reading

- User-facing rationale: [why the replacement editor can be faster](docs/en/user-guide.md#why-the-replacement-editor-can-be-faster).
- Developer details: [fast editor flow](docs/en/architecture.md#fast-editor-flow), [performance rationale and limits](docs/en/architecture.md#performance-rationale-and-limits), and the [implementation map](docs/en/architecture.md#fast-editor-implementation-map).
- Chinese documentation: [使用指南](docs/zh-CN/user-guide.md#为什么替代编辑器可以更快) and [架构与实现索引](docs/zh-CN/architecture.md#快速编辑器实现索引).

## 0.5.4 - 2026-08-19

### Fixed

- Upgrade DOMPurify to 3.4.13 to address GHSA-55q2-fjhq-7xh7.

## 0.5.3 - 2026-08-19

### Changed

- Declare compatibility with Zotero 10.0 while retaining Zotero 9.0 support.
- Migrate the source and verification workflow to TypeScript and pnpm without changing the add-on's intended behavior.

## 0.5.2 - 2026-07-20

### Fixed

- Continue cleaning active readers when a previously closed reader exposes an inaccessible DOM wrapper during plugin shutdown.
- Aggregate repeated best-effort shutdown cleanup failures instead of emitting one warning per failed cleanup step.
- Rotate the diagnostic log at 5 MiB and retain one backup so diagnostic storage remains bounded.

## 0.5.1 - 2026-07-20

### Fixed

- Remove rendered previews and restore Zotero's native annotation comments immediately when the plugin is disabled.
- Clean stale preview nodes left by older or interrupted plugin instances.

## 0.5.0 - 2026-07-19

### Added

- Automatically turn bare URLs in rendered annotation comments into clickable links.

### Fixed

- Open rendered links through Zotero on the first click without entering annotation editing.
- Keep links rendered when Zotero marks an outer annotation container as selected.

## 0.4.1 - 2026-07-19

### Changed

- Keep surrounding rendered annotation previews mounted while editing so leaving an editor no longer causes sidebar-wide DOM replacement and repainting.

### Fixed

- Preserve Zotero's native add-comment control for annotations whose comments are empty.

## 0.4.0 - 2026-07-16

### Added

- Added automatic, render-all, and viewport-near annotation rendering strategies in the preferences pane.
- Added bounded HTML and offscreen rendered-DOM caches with least-recently-used eviction.
- Added performance diagnostics for lazy rendering, cache usage, and editing lifecycle behavior.

### Changed

- Render up to four inexpensive annotations per idle period while keeping expensive annotations isolated to a single idle turn.
- Prioritize the currently selected annotation and pre-render small annotation sets automatically.
- Preserve rendered previews outside the viewport within a bounded budget and let the browser skip offscreen layout and paint work.
- Temporarily detach other rendered previews while an annotation editor has focus, then restore the same DOM nodes after editing.

### Fixed

- Render the sidebar annotation selected from a PDF page before its dormant editor receives focus.
- Avoid repeated Markdown and KaTeX work when scrolling away from and back to previously rendered annotations.

## 0.3.3 - 2026-06-15

### Changed

- Reduced Reader sidebar work for large annotation sets by lazily rendering annotation Markdown previews near the viewport.
- Paused annotation Markdown rendering while editing and resumed only the edited annotation after focus leaves.

### Fixed

- Avoided observing character data changes inside active annotation editors.
- Avoided treating Zotero native note editor DOM as reader annotation comments.
- Reduced repeated full-sidebar scans from annotation mutation events.

## 0.3.2 - 2026-06-10

### Changed

- Clarified the annotation paste preference label to distinguish annotation comments from other paste targets.

### Fixed

- Fixed copied LaTeX `\[...\]` display formulas failing to render when pasted without surrounding blank lines.
- Fixed double-escaped copied `\\[...\\]` display formula delimiters in the same adjacent-to-text case.

## 0.3.1 - 2026-06-08

### Fixed

- Reduced PDF scrolling stutter when LaTeX math rendering is enabled by ignoring unrelated Reader mutations.
- Avoided rerendering unchanged annotation comments during repeated Reader scans.

## 0.3.0 - 2026-06-08

### Added

- Added LaTeX math rendering for annotation Markdown previews.
- Added support for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]` math delimiters.
- Added a preference to enable or disable LaTeX math rendering.

### Changed

- Embedded KaTeX woff2 fonts in the generated preview CSS so math symbols render reliably in Zotero Reader.

## 0.2.0 - 2026-05-19

### Added

- Added a Zotero preferences pane for Markdown rendering options.
- Added preview font size control from 80% to 150%.
- Added plugin icon support in preferences, plugin manager, and README.
- Added basic styles for inline code and fenced code blocks.
- Added plain-text paste handling for annotation comments to preserve Markdown line breaks.

## 0.1.7 - 2026-05-18

### Added

- Initial release for Zotero 9.0.x.
- Render Zotero reader sidebar annotation comments as Markdown.
- Preserve original Markdown source text while editing.
- Preserve single line breaks as visible line breaks.
- Sanitize rendered output instead of trusting raw HTML.
