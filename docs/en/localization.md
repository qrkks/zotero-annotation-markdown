# Localization and translation contributions

[简体中文](../zh-CN/localization.md)

## Current scope

The settings pane uses native Fluent localization. **Settings page language** defaults to **Follow Zotero** and can override this page to **简体中文** (`zh-CN`) or **English** (`en-US`) immediately. The choice is stored in `extensions.annotationMarkdown.settingsLanguage`; it does not change Zotero’s locale or other panes. English is the fallback when a translation is unavailable.

This currently covers settings group headings, checkbox captions, dropdown choices, field labels, and help text. Reader controls such as the SVG viewer's **View larger**, **Fit**, and **Close** are outside this localization resource. Translating the settings file does not translate every plugin interface.

UI translations live under `addon/locale/`. Documentation translations live separately under `docs/en/` and `docs/zh-CN/`; contributing an interface language does not require translating the documentation.

## Files and Fluent syntax

Use the [English resource](../../addon/locale/en-US/annotation-markdown-preferences.ftl) as the reference for message IDs, attributes, and meaning. The [Simplified Chinese resource](../../addon/locale/zh-CN/annotation-markdown-preferences.ftl) is another complete example. The current pane uses 41 messages; the English file and [pane markup](../../addon/preferences.xhtml) define the set to keep in sync.

The filename is `annotation-markdown-preferences.ftl` in every locale directory. For example, a French translation would be stored at:

```text
addon/locale/fr-FR/annotation-markdown-preferences.ftl
```

Use the locale code for the corresponding Zotero interface language. Keep files in UTF-8. Zotero registers FTL files in plugin locale directories automatically. `src/preference-localization.ts` creates a native `Localization` instance with the selected locale and English fallback, then applies messages only within the plugin pane. Pane targets use `data-annotation-markdown-l10n-id`, so the shared document’s automatic translator cannot overwrite the local selection. The build copies the `addon/` directory, so adding a translation does not require another bootstrap registration or a build-script change.

Fluent distinguishes text content from element attributes. A short French example shows all three forms:

```ftl
annotation-markdown-prefs-reader = Annotations du lecteur
annotation-markdown-prefs-enabled =
    .label = Afficher les commentaires des annotations de la barre latérale en Markdown
annotation-markdown-prefs-math-output =
    .value = Rendu des formules
```

- Headings and descriptions use the message value after `=`.
- Checkbox and menu-item captions use an indented `.label` attribute.
- XUL field labels use an indented `.value` attribute.

Translate the displayed strings and keep message IDs and attribute names unchanged. In particular, a translated `.value` field label is different from a dropdown option's stored `value` in XHTML: stored values such as `htmlAndMathml`, `mathml`, `auto`, `eager`, and `lazy`, and all preference keys, must remain unchanged. Keep technical names and literal syntax such as Markdown, LaTeX, SVG, `todo`, `TODO:`, and `T:` recognizable. Preserve statements about defaults, experimental status, feature dependencies, compatibility, and limits.

For more syntax examples, see the [Fluent guide](https://projectfluent.org/fluent/guide/) and [Zotero plugin localization documentation](https://www.zotero.org/support/dev/zotero_7_for_developers#localization).

## Contribute a translation

1. Fork [the repository](https://github.com/qrkks/zotero-annotation-markdown) and work on a translation branch. For a wording correction, edit the existing locale file. For a new language, copy the entire English resource into the new locale directory and translate its displayed strings.
2. Provide all message IDs and attributes from the English file, including the help descriptions. English fallback keeps missing translations readable, but a complete file is the contribution target.
3. For a new language, extend locale coverage in `tests/preferences-pane.test.ts` and adapt its language-specific sample expectations. The current test matrix covers only `en-US` and `zh-CN`; an unchanged test run does not validate a new locale. If an existing translation's sample caption changes, update the corresponding expectation as well.
4. Run the focused tests, documentation check, and build from the repository root:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm exec vitest run tests/preferences-pane.test.ts
   pnpm run docs:check
   pnpm run build
   pnpm run package
   git diff --check
   ```

5. Install `dist/zotero-annotation-markdown.xpi` in a test Zotero profile. Use **Settings page language** to switch between Simplified Chinese and English without restarting Zotero. Also test **Follow Zotero** with the target language selected in Zotero’s general settings; restart if Zotero requests it. A newly contributed locale follows Zotero until it is deliberately added to the override choices. Check every group, dropdown, help description, and disabled control at a normal window size. Confirm long text wraps without clipping, options keep their stored choices, and English still displays correctly. Include screenshots and the tested Zotero version in the pull request.
6. Open a pull request stating the locale code, whether this is a new translation or a correction, and the checks performed. For a new language, update the supported-language descriptions in the READMEs and user guides. Keep the contribution focused on translation resources, coverage, and relevant documentation.

`pnpm run package` regenerates `updates.json` as well as the XPI. Inspect `git diff -- updates.json` and restore that generated change on a translation-only branch. Leave generated `dist/` files and release version/tag changes out of the translation PR; maintainers handle release metadata when publishing.

If you cannot run the development tools, [open an issue](https://github.com/qrkks/zotero-annotation-markdown/issues) with the locale code and an attached translated FTL file or a proposed wording correction. Maintainers can help with integration and native-Zotero verification.

## Maintain translations when adding settings

New settings text should use a namespaced `annotation-markdown-prefs-...` ID in the `data-annotation-markdown-l10n-id` attribute in `addon/preferences.xhtml`, with the appropriate Fluent value or attribute. Update the English source and every supported translation together, then run the locale coverage checks. Avoid introducing new hardcoded natural-language captions into the pane; language-neutral percentages can remain literal.

Follow the separate [documentation translation policy](../README.md) when changing documentation pages.
