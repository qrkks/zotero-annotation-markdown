# 仅用于设置面板。Zotero 的设置文档由多个插件共享，标识符须保留插件前缀。
# 复选框和菜单项使用 .label；XUL 字段标签使用 .value。

annotation-markdown-prefs-general = 常规
annotation-markdown-prefs-settings-language =
    .value = 设置页语言
annotation-markdown-prefs-language-auto =
    .label = 跟随 Zotero（默认）
annotation-markdown-prefs-language-description = 立即切换本设置页的语言，不改变 Zotero 的界面语言。阅读器控件沿用原有的语言行为。

annotation-markdown-prefs-reader = 阅读器批注
annotation-markdown-prefs-enabled =
    .label = 将侧栏批注评论渲染为 Markdown
annotation-markdown-prefs-popup-enabled =
    .label = 将页面批注弹窗渲染为 Markdown
annotation-markdown-prefs-popup-description = 在页面批注弹窗中显示格式化的 Markdown 预览，与侧栏渲染独立控制。默认关闭。
annotation-markdown-prefs-math-enabled =
    .label = 渲染 LaTeX 数学公式
annotation-markdown-prefs-math-description = 启用侧栏或页面弹窗的 Markdown 渲染后，即可使用公式。两者均关闭时仍会保留公式设置。
annotation-markdown-prefs-math-output =
    .value = 公式渲染方式
annotation-markdown-prefs-math-html =
    .label = KaTeX HTML + MathML（默认）
annotation-markdown-prefs-math-native =
    .label = 仅使用原生 MathML
annotation-markdown-prefs-math-output-description = KaTeX HTML 控制公式外观，并包含用于无障碍访问的 MathML。原生 MathML 使用 Zotero 内置的公式排版，可降低渲染开销；间距和外观可能有所不同。
annotation-markdown-prefs-svg-enabled =
    .label = 渲染 SVG 图示（实验性）
annotation-markdown-prefs-mermaid-enabled =
    .label = 渲染 Mermaid 图表（实验性）
annotation-markdown-prefs-linked-image-preview-enabled =
    .label = 自动预览图片链接
annotation-markdown-prefs-linked-image-preview-description = 将独立成段的图片链接显示为图片，并保留原始链接。默认开启。关闭后恢复链接并停止对应的自动预览请求；不影响显式的 Markdown 图片语法。
annotation-markdown-prefs-mermaid-description = 使用 Pele 预览 mermaid 代码块。默认关闭，与 SVG 渲染独立。支持流程图、时序图、状态图、类图、实体关系图、饼图和思维导图。深浅主题均使用固定浅色图面。不支持的图表显示原始代码；源码仍可编辑。
annotation-markdown-prefs-svg-description = 显示 svg 代码块、未标注语言的代码块中的完整 SVG，以及独立占一行或多行的完整 SVG。SVG 前后不必留空行。默认关闭。支持基本形状、文本、局部箭头、渐变和小型内嵌 WOFF2 字体；不支持脚本、通用 CSS、外部资源及动画。原始源码仍可编辑。
annotation-markdown-prefs-font-size =
    .value = Markdown 预览字号
annotation-markdown-prefs-paste-as-plain-text =
    .label = 将剪贴板内容以纯文本粘贴到批注评论
annotation-markdown-prefs-paste-description = 粘贴 AI 工具的回答时建议开启。保留可编辑的 Markdown，避免导入富文本格式或隐藏的 HTML。
annotation-markdown-prefs-fast-editor =
    .label = 使用快速批注评论编辑器
annotation-markdown-prefs-fast-editor-description = 减少批注较多的文档中的输入卡顿。

annotation-markdown-prefs-outline = 悬浮大纲
annotation-markdown-prefs-outline-enabled =
    .label = 为包含多个标题的批注显示悬浮大纲
annotation-markdown-prefs-outline-font-size =
    .value = 大纲字号
annotation-markdown-prefs-outline-numbering =
    .label = 显示标题序号
annotation-markdown-prefs-outline-smart-numbering =
    .label = 智能避让已有序号
annotation-markdown-prefs-outline-smart-numbering-description = 标题已有明确序号时，其同级组及全部子孙标题不再补号。

annotation-markdown-prefs-tags = 批注标签
annotation-markdown-prefs-auto-todo-tag =
    .label = 自动为含 TODO: 或 T: 标记行的批注添加 todo 标签
annotation-markdown-prefs-auto-todo-description = 新建批注或修改评论并保存时，只要评论中有一行以 todo:、todo：、t: 或 t：开头，就自动给整条批注添加小写 todo 标签。允许行首缩进，不区分大小写；不会扫描历史批注。
annotation-markdown-prefs-auto-todo-cleanup =
    .label = 删除标记行时移除 todo 标签
annotation-markdown-prefs-auto-todo-cleanup-description = 可选，仅在自动添加标签开启时生效。编辑评论后，若已无标记行，则移除小写 todo 标签，即使该标签是手动添加的。不会扫描已有批注。

annotation-markdown-prefs-performance = 渲染性能
annotation-markdown-prefs-render-strategy =
    .value = 批注渲染策略
annotation-markdown-prefs-render-auto =
    .label = 自动（推荐）
annotation-markdown-prefs-render-eager =
    .label = 渲染全部批注
annotation-markdown-prefs-render-lazy =
    .label = 渲染可视区域附近的批注
annotation-markdown-prefs-native-row-lazy =
    .label = 加速超大批注列表清除标签筛选（实验性）
annotation-markdown-prefs-native-row-description = 减少取消标签选择、恢复大量批注时的停顿。请在列表完整加载后、应用标签筛选前开启。默认关闭，Reader 结构兼容时生效。不加速首次打开；不可用时回退到 Zotero 原生列表。
