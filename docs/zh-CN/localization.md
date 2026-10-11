# 本地化与翻译贡献

[English](../en/localization.md)

## 当前支持范围

从 v0.14.0 起，设置页通过 Zotero 原生 Fluent 本地化系统，跟随 Zotero 的界面语言显示。目前包含英文（`en-US`）和简体中文（`zh-CN`），没有对应翻译时回退到英文。插件没有单独的语言选择器。

当前覆盖设置页的分组标题、复选框标签、下拉菜单、字段标签及说明文字。SVG 查看器中的 **View larger**、**Fit**、**Close** 等阅读器控件不在这份本地化资源的范围内；翻译设置文件不意味着插件的所有界面都已翻译。

界面翻译位于 `addon/locale/`。文档翻译单独位于 `docs/en/` 和 `docs/zh-CN/`；贡献一种界面语言不要求同时翻译整套文档。

## 文件位置与 Fluent 语法

请以[英文资源](../../addon/locale/en-US/annotation-markdown-preferences.ftl)为消息标识符、属性及含义的基准，[简体中文资源](../../addon/locale/zh-CN/annotation-markdown-preferences.ftl)也是完整示例。当前面板使用 32 条消息；需要保持同步的消息集合由英文文件和[设置页结构](../../addon/preferences.xhtml)定义。

每个语言目录中的文件名都使用 `annotation-markdown-preferences.ftl`。例如，法语翻译应放在：

```text
addon/locale/fr-FR/annotation-markdown-preferences.ftl
```

目录名称应使用对应 Zotero 界面语言的语言代码，文件采用 UTF-8 编码。Zotero 会自动注册插件语言目录中的 FTL 文件，设置页通过已有的 `<linkset>` 加载这份资源。构建时会复制整个 `addon/` 目录，因此新增翻译不需要另写 bootstrap 注册逻辑，也无需修改构建脚本。

Fluent 区分元素的正文与属性。下面的法语片段展示了三种写法：

```ftl
annotation-markdown-prefs-reader = Annotations du lecteur
annotation-markdown-prefs-enabled =
    .label = Afficher les commentaires des annotations de la barre latérale en Markdown
annotation-markdown-prefs-math-output =
    .value = Rendu des formules
```

- 标题和说明文字使用 `=` 后的消息正文。
- 复选框及菜单项的标签使用缩进的 `.label` 属性。
- XUL 字段标签使用缩进的 `.value` 属性。

只翻译显示文字，保留消息标识符和属性名。尤其要区分字段标签的 `.value` 翻译和 XHTML 中下拉选项保存的 `value`：`htmlAndMathml`、`mathml`、`auto`、`eager`、`lazy` 等保存值以及所有设置键都不能改名。Markdown、LaTeX、SVG 等技术名称，以及 `todo`、`TODO:`、`T:` 等实际语法应保持可辨认。默认状态、实验性标记、功能依赖、兼容性和限制的含义也应完整保留。

更多语法示例见 [Fluent 指南](https://projectfluent.org/fluent/guide/)和 [Zotero 插件本地化文档](https://www.zotero.org/support/dev/zotero_7_for_developers#localization)。

## 如何贡献翻译

1. Fork [项目仓库](https://github.com/qrkks/zotero-annotation-markdown)，在翻译分支中工作。修正文案时编辑现有语言文件；新增语言时，将完整英文资源复制到新语言目录，再翻译其中的显示文字。
2. 提供英文文件中的全部消息标识符和属性，包括说明文字。英文回退可以让缺少翻译的部分保持可读，但贡献的目标应是一份完整翻译。
3. 新增语言时，在 `tests/preferences-pane.test.js` 中补充该语言的测试覆盖，并调整与语言相关的样例期望值。当前测试矩阵只覆盖 `en-US` 和 `zh-CN`；直接运行原有测试不会校验新语言。修改已有翻译的样例标签时，也应同步更新对应断言。
4. 在仓库根目录运行针对性测试、文档检查及构建：

   ```powershell
   pnpm install --frozen-lockfile
   pnpm exec vitest run tests/preferences-pane.test.js
   pnpm run docs:check
   pnpm run build
   pnpm run package
   git diff --check
   ```

5. 在用于测试的 Zotero 配置中安装 `dist/zotero-annotation-markdown.xpi`。在 Zotero 常规设置中选择目标界面语言；如果 Zotero 提示需要重启，重启后重新打开插件设置。以正常窗口尺寸检查所有分组、下拉选项、说明和禁用控件，确认长文本换行后没有截断，选项仍保留已保存的选择，英文显示也仍然正常。在拉取请求中提供截图和测试使用的 Zotero 版本。
6. 提交拉取请求，说明语言代码、属于新增翻译还是文案修正，以及完成了哪些检查。新增语言时，同步更新 README 和使用指南中的支持语言说明。改动集中在翻译资源、测试覆盖和相关文档。

`pnpm run package` 除了生成 XPI，还会重新生成 `updates.json`。在仅贡献翻译的分支中，检查 `git diff -- updates.json`，并恢复这项生成的变更。翻译拉取请求不应包含生成的 `dist/` 文件或发布版本、标签的改动；维护者在发布时处理这些元数据。

如果无法运行开发工具，也可以[提交 issue](https://github.com/qrkks/zotero-annotation-markdown/issues)，注明语言代码并附上翻译后的 FTL 文件，或提出具体文案修正。维护者可以协助接入和真实 Zotero 验证。

## 新增设置时如何维护翻译

新的设置文案应在 `addon/preferences.xhtml` 中使用带 `annotation-markdown-prefs-...` 前缀的标识符，并采用对应的 Fluent 正文或属性。同步更新英文基准和所有受支持语言，再运行语言覆盖检查。避免在设置页加入新的固定自然语言标签；百分比等不依赖语言的内容可以保留原样。

修改文档页面时，另请遵循[文档翻译规则](../README.md)。
