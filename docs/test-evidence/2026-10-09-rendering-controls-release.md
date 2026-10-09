# Rendering controls patch release 0.12.3 — 2026-10-09

This patch integrates the existing rendering controls: sidebar and page-popup Markdown rendering are independent peers, while formulas depend on at least one Markdown rendering scope being enabled. Disabling both scopes disables the formula controls without changing their saved choice or output mode.

## Evidence

- [Independent rendering trial](2026-10-09-independent-rendering.md): four scope combinations, live changes, popup discovery, and preserved preferences. The user manually confirmed this first trial worked.
- [Formula dependency trial](2026-10-09-math-controls-dependency.md): eight scope/formula combinations and saved-choice restoration, including external preference synchronization. Nine regressions failed before the fix and passed afterward.
- [Earlier popup placement validation](2026-10-09-popup-release-validation.md): historical native-host popup evidence from 0.12.2, including the large-annotation document.

The formula dependency has automated preference/controller and package validation. It has not received a new instrumented native-host visual run. Earlier popup measurements and the user's first-trial confirmation apply to the specific versions described in their reports.

## Release validation

- `pnpm run verify`: 27 test files / 423 tests, TypeScript, documentation (4 bilingual page pairs), build, and package passed.
- `pnpm audit --prod`: no known vulnerabilities.
- `pnpm run release:verify v0.12.3`: package, add-on manifest, changelog, tag name, and both update manifests agree.
- Repeated packaging produced the same SHA-256. `git diff --check` passed.
- The final XPI contains 49 files. Exactly 48 match the v2 trial byte for byte; the only changed file is `manifest.json`, whose only content change is version 0.12.2 → 0.12.3.

Final XPI: `zotero-annotation-markdown.xpi`, 1,134,508 bytes, SHA-256:

`62e349e9af8a440f6efee77e73bee5d4d8048ae918977fbbee4c22d406362530`

## Saved records

The public reports above are committed with the release. Raw logs, both trial packages, and the final package are preserved locally in `output/test-evidence-0.12.3/` and `output/zotero-annotation-markdown-0.12.3-test-evidence.zip`. Publication receipts, CI logs, the downloaded release asset, and a file-by-file SHA-256 inventory are added to that archive after publication. It is not an additional public release asset.

The earlier 0.12.2 archive remains separate and contains the raw native-host popup results. The tagged GitHub workflow runs the same release gates and verifies the published asset against its digest and a fresh download; the local publication receipt additionally checks the public update manifest and tag/main alignment.
