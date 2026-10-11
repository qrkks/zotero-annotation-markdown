# Settings pane localization verification

Date: 2026-10-11 (Asia/Shanghai)

## Scope

- Settings-pane text uses Zotero's native Fluent system and the namespaced resource `annotation-markdown-preferences.ftl`.
- English (`en-US`) and Simplified Chinese (`zh-CN`) each provide all 32 message IDs. Percentages remain language-neutral.
- Preference keys, stored option values, defaults, and preference event handlers are unchanged. Reader UI localization is outside this change.

## Automated checks

- `pnpm install --frozen-lockfile --offline`: passed with the pinned test-only `@fluent/bundle` dependency.
- `pnpm test`: 31 files, 589 tests passed.
- `pnpm run typecheck`, `pnpm run docs:check`, `pnpm run build`: passed.
- Localization tests parse both FTL resources using Fluent, check full message coverage and the correct XUL `.label` / `.value` attributes, and verify preference bindings, dropdown values, percentages, and group order.
- The local trial XPI contains 51 files. Both packaged locale resources match their source files byte-for-byte, and the packaged pane includes its localization link.

## Native Zotero checks

- Host: development-profile Zotero 10.0.6, Firefox 140, Windows. Data directory: `C:\Users\dell\Zotero-Dev-Data`.
- Installed the local trial XPI into this development profile and opened the plugin settings pane.
- Zotero automatically loaded all 32 Chinese strings under the existing Simplified Chinese interface language.
- Inspected screenshots at the normal 816 × 649 settings-window size, including the Reader, Outline, Tags, and Performance groups. Captions, dropdowns, and wrapped descriptions displayed without overlap or clipping.
- Used the native `L10nRegistry` to load English, formatted all 32 strings, and temporarily displayed them in the same pane for screenshot inspection. Restored the Chinese pane afterwards; control bindings, values, and checked states were preserved.
- A native bundle requested with `fr-FR` followed by `en-US` returned English heading and checkbox text for this resource, confirming English fallback for an untranslated locale.
- No application language preference was changed. The trial is local; this check does not publish a release or update the release manifest.

## v0.14.0 release gate

- The user tested the trial successfully before requesting a new release.
- Version sources and the exact version test target `0.14.0`; `pnpm run verify` passed all 31 test files / 589 tests, typecheck, documentation checks, build, and packaging.
- `pnpm audit --prod`: no known vulnerabilities.
- `pnpm run release:verify v0.14.0`: passed. Local XPI size: 1,147,187 bytes.
- Repackaging identical build inputs produced the same SHA-256: `0f035e5115fb1c83b34149f442f87c8febebc1fd88bb10fa999091b41296f7bf`.
- Both update manifests identify v0.14.0 and carry that XPI hash. Publication is handled by the existing tag-triggered release workflow; public artifacts must be checked after it completes.
