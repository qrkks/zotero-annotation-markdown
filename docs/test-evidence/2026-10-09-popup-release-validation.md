# 0.12.2 release validation — 2026-10-09

## Local checks

| Check | Result |
| --- | --- |
| `pnpm run verify` | Passed: 26 test files / 407 tests, TypeScript, documentation (4 bilingual page pairs), build, and package. |
| `pnpm audit --prod` | No known vulnerabilities found. |
| `pnpm run release:verify v0.12.2` | Package/manifest version, changelog, update URL, root/dist update manifests, and XPI hash match. |
| `git diff --check` | Passed. |

The generated release asset is `zotero-annotation-markdown.xpi`, **1,134,250 bytes**, SHA-256:

`4d646946d13e2eaa637efc6a9b4a7ebcaeb0ab4aed896dd4f873b337f6bd499e`

## Exact native-test package comparison

The final native-host trial package SHA-256 was `ce5cc9dd8b142e75452d1ecde52a9acfc937706ac15161b87c80df550a7bcc9c`. Comparing every decompressed ZIP entry with the 0.12.2 release package found:

- Both packages contain 49 files.
- 48 files are byte-identical, including `plugin.js`, CSS, bootstrap, and other runtime assets.
- The only changed file is `manifest.json`; its only changed field is `version`, from `0.12.1` to `0.12.2`.

The version-bumped XPI was not subjected to a new native-host interaction run. Its runtime is identical to the package used for the [25 final native-host trials](2026-10-09-popup-release-summary.md), so these trials validate the shipped popup implementation. The earlier trial hashes are retained to distinguish these local packages from the historical public 0.12.1 release.

## Publication verification

The existing tag-triggered Release workflow repeats source checks, the production dependency audit, release metadata checks, and an unchanged-generated-manifest check before publishing. It then compares the GitHub asset digest and downloaded asset with the built XPI. Publication is additionally checked against the public raw `updates.json` and a separately downloaded release asset.

The local raw archive retains the verification/audit logs, runtime-comparison JSON, and final publication receipt. Public native-test metrics and limitations are indexed in the [complete test record](2026-10-09-popup-release-summary.md).
