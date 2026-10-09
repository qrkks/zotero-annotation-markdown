# Reused popup preview and position regression — 2026-10-08

Validated using Zotero MCP in the isolated Zotero Dev profile with Zotero 10.0.6 / Gecko 140 and the existing seven-annotation regression fixture. No fixture comment or position was changed.

These runs used 100% comment font size and a collapsed floating outline. They did not cover expensive rendering in the large document at the user's 160% font setting. A subsequent test reproduced a separate visible positioning jump; see [the large-document follow-up](2026-10-08-large-popup-position.md). The XPI hash below identifies the earlier trial, not the final follow-up build.

The released 0.12.1 XPI reproduced stale content during three same-page annotation switches with no PDF scrolling. The new-ID popup was visible at 54–76 ms, but the correct preview first appeared at 120–138 ms. The visible height changed by 46.3 px. A simulated bottom-right anchor exposed a 173.1 px height change and an out-of-viewport long preview.

The fix waits for the current positioning lifecycle's render before counting stable frames. Native popup source child-list mutations render immediately, including text-only changes; an ID commit alone may still contain the previous comment. A reused popup requests native final-size measurement after rendering, with the Zotero 10 PDFView `_openAnnotationPopup()` fallback when `_repositionPopups()` is unavailable. The final viewport check precedes reveal. The bounded editor fallback removes any stale preview instead of exposing it.

The local trial XPI SHA-256 is:

`4fab4f195fde2f948286f65029d5f9a15f4f6ba3cbbfc7c354227f7a00a3e0b6`

All 15 measured runs retained `visibilityState: visible`. Each run recorded animation-frame geometry, annotation ID, preview content, opacity, and PDF scroll position for approximately 1.2 seconds.

| Cases | Runs | Old-preview frames after new ID appeared | Visible geometry changes | Hides after target first appeared |
| --- | ---: | ---: | ---: | ---: |
| Initial opening and three same-page switches | 4 | 0 | 0 | 0 |
| Long opening and long/basic switches | 3 | 0 | 0 | 0 |
| Real page-bottom basic/link switches | 3 | 0 | 0 | 0 |
| Formula initial/reopen and long reopen | 3 | 0 | 0 | 0 |
| Simulated bottom-right native-handler inputs | 2 | 0 | 0 | 0 |

Every final popup was within the Reader viewport. The simulated corner inputs exercise the native handler; the final-size remeasurement may return to the actual annotation anchor. First target appearance was sampled at 110–201 ms and already contained the correct preview. Switching includes a deliberate hidden interval before the new target first appears; the hide count above starts at that first appearance and excludes the previous annotation.

Four regression tests cover deferred native source updates, remeasurement before reveal, identical-source ID reuse, and the active-editor deadline fallback. Full validation passed 26 files / 403 tests, type checking, bilingual documentation checking, packaging, and whitespace checking. The published update manifest was restored after local packaging.

The original test-profile 0.11.1 XPI, selection, preferences, and sidebar state were restored after validation. Default-profile data was not modified. Raw before/after evidence is in `.tmp/popup-position-qa-2026-10-08/results.json` and `fixed-results.json`; the local trial is `output/zotero-annotation-markdown-0.12.1-popup-switch-fix.xpi`.
