# Settings-page language verification — 2026-10-21

## Behavior and scope

The settings pane now offers **Follow Zotero (default)**, **简体中文** and **English**. The selection applies immediately and is stored in `extensions.annotationMarkdown.settingsLanguage`. It affects only this settings pane; Reader controls keep their existing language behavior.

The pane uses native Fluent `Localization` with an explicit locale list and English fallback. Its private `data-annotation-markdown-l10n-id` targets prevent the shared preferences document from overwriting an override. Translation updates change captions, not stored control values. A revision guard discards earlier asynchronous results after another selection.

API reference: [Mozilla Localization constructor and custom locales](https://github.com/mozilla/gecko-dev/blob/master/dom/webidl/Localization.webidl), [Zotero Fluent resource registration](https://www.zotero.org/support/dev/zotero_7_for_developers#localization).

## Automated checks

`pnpm run verify` passed with 48 test files / 1,216 tests, strict TypeScript checks for source/scripts/tests, five bilingual documentation page pairs, build and packaging.

The preference-pane suite contains 28 tests. New cases verify immediate Chinese/English switching, restoring Follow Zotero, saved overrides and invalid-value fallback, preservation of another plugin's text and the shared document language, preservation of existing control values, and rapid changes whose translations complete out of order. Existing locale coverage validates all 41 message targets in both locales, XUL captions, control types, preference keys and dropdown values.

## Native Dev check

In Zotero Dev 10.0.6 / Gecko 140, the actual pane markup was parsed with Zotero's XUL fragment parser and attached to an isolated 640 px panel in the main chrome document. The compiled preference script ran with a private native Fluent registry pointing to the current English and Chinese resource files, and an in-memory preference host.

Verified:

- Follow Zotero initially selected Chinese for the test host locale.
- Selecting English changed the heading to “General”, the checkbox caption to “Render sidebar annotation comments as Markdown”, and the selected dropdown caption to “English”.
- Selecting Chinese changed them to “常规”, “将侧栏批注评论渲染为 Markdown” and “简体中文”.
- Restoring Follow Zotero displayed “跟随 Zotero（默认）”.
- All 41 Fluent targets were populated.
- The shared document's locale and the existing `mathml` control value were preserved.
- Only the language preference was written, with the sequence `en-US`, `zh-CN`, `auto`.

The isolated panel and style were removed afterward. The check did not install the plugin or write actual Zotero preferences; persistence calls and their global preference keys are covered by the automated tests. No production profile was modified.

## Local test artifact

- File: `dist/zotero-annotation-markdown-settings-language.xpi`
- Version: 0.16.1, unreleased local test build.
- Includes the preceding linked-image viewer changes.
- Size: 1,340,432 bytes (1.28 MiB).
- SHA-256: `4595f14a3bab3895fb64756ea5b4ccd5541f1a5a822be16a4f54046c5e22c9c2`

The artifact hash matches the distribution update manifest. The repository's published `updates.json` was restored after packaging. Validation did not push, tag or publish a release.
