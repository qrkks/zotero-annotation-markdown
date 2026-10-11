# 仅用于设置面板。Zotero 的设置文档由多个插件共享，标识符须保留插件前缀。
# 复选框和菜单项使用 .label；XUL 字段标签使用 .value。

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
    .label = 仅使用原生 MathML（实验性）
annotation-markdown-prefs-math-output-description = KaTeX HTML 控制公式外观，并包含用于无障碍访问的 MathML。原生 MathML 使用 Zotero 内置的公式排版，可降低渲染开销；间距和外观可能有所不同。
annotation-markdown-prefs-svg-enabled =
    .label = 渲染 SVG 代码块（实验性）
annotation-markdown-prefs-svg-description = 显示 svg 代码块中的静态图形，也支持未标注语言的代码块中的完整 SVG。默认关闭。支持基本形状、文本、局部箭头、渐变和小型内嵌 WOFF2 字体；不支持脚本、通用 CSS、外部资源及动画。原始源码仍可编辑。
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

annotation-markdown-prefs-tags = 批注标签
annotation-markdown-prefs-auto-todo-tag =
    .label = 为以 TODO: 或 T: 开头的行添加 todo 标签
annotation-markdown-prefs-auto-todo-description = 匹配行首的 todo:、todo：、t: 或 t：（不区分大小写），并添加小写 todo 标签。
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
annotation-markdown-prefs-native-row-description = 减少取消标签选择、恢复大量批注时的停顿。请在列表完整加载后、应用标签筛选前开启。默认关闭，目前支持 Zotero 10.0.3。不加速首次打开；不可用时回退到 Zotero 原生列表。
