# Independent sidebar and popup rendering — 2026-10-09

Follow-up: the user confirmed manual testing of this first trial worked. A subsequently reported formula-control dependency is addressed in the [v2 trial and verification](2026-10-09-math-controls-dependency.md); the package hash and automated counts below describe the original trial.

This local change makes the two rendering checkboxes peers. The first is explicitly labeled **Render sidebar annotation comments as Markdown**, and the popup control no longer inherits its disabled state or indentation. Either surface can render independently; font size, LaTeX, and math output remain shared.

## Scope validation

`tests/render-scopes.test.js` exercises the actual Reader controller and annotation adapter with mixed sidebar/popup DOM, not a replacement settings-only implementation.

| Sidebar | Popup | Expected and verified previews |
| --- | --- | --- |
| Off | Off | Neither surface |
| On | Off | Sidebar only |
| Off | On | Popup only |
| On | On | Both surfaces |

Further cases verify live controller refresh across all combinations, restoration of native sidebar content, removal/recreation of shared styles when both scopes are disabled/re-enabled, and observer discovery of a popup mounted after startup with sidebar rendering off. Existing popup lifecycle regressions remain in the full suite.

The preference-pane tests verify peer controls, popup accessibility with sidebar rendering off, retained checkbox choices, shared math output availability for popup-only rendering, and external preference synchronization. Settings tests verify that existing stored booleans are read unchanged and toggling one preference does not rewrite the other.

No preference keys or defaults changed. The existing `enabled` preference now controls sidebar rendering; the existing `popupEnabled` value independently controls popups. A saved popup choice of true is therefore effective even when the former general rendering checkbox is false. No migration rewrites either saved choice. Native sidebar row acceleration and sidebar render scheduling still depend on sidebar rendering.

## Checks and limits

`pnpm run verify` passed **27 files / 414 tests**, TypeScript checking, documentation checking (4 bilingual page pairs), build, and packaging. `git diff --check` passed. These are automated DOM/controller and preference-binding checks.

The isolated Zotero MCP endpoint was not connected during this change, so a new real-Gecko interaction/visual run has not been performed. Earlier native-host tests for the popup placement implementation remain historical evidence; they do not establish visual verification of the new settings layout.

The local trial package is `output/zotero-annotation-markdown-0.12.2-independent-rendering-test.xpi`, SHA-256 `3ed8fc67cc5f78b078060d101d7c509942185a75e679ba8ba3d4364bbd08c57c`. It retains manifest version 0.12.2 for manual testing and differs from the published 0.12.2 release. The public root update manifest is restored after trial packaging. Verification logs are saved locally at `.tmp/independent-rendering-qa-2026-10-09/verify.log`.
