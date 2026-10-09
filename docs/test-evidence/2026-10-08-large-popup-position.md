# Large-document popup position follow-up — 2026-10-08

The earlier seven-annotation test missed a visible position jump. The same earlier trial XPI was confirmed installed in both the daily and isolated development profiles. The daily profile used 160% comment font size and an expanded floating outline; the initial test had used 100% and a collapsed outline.

## Reproduction

Zotero MCP tested the existing copied stress document in the isolated development profile on Zotero 10.0.6 / Gecko 140. It has 423 annotations: 395 image annotations and 28 notes. Library content was not edited. The large-document tests used 160% comment font size, an expanded outline, popup Markdown enabled, and fast editing enabled.

Mouse-down and pointer-up events were dispatched at existing annotation hit targets in the actual PDF page. They exercised Zotero's selection, delayed focus, popup component, and positioning handlers. Frame sampling recorded geometry, visibility, annotation ID, rendered preview signatures, and PDF scroll position. This validates those native UI paths using synthesized events; it is not a recording of physical mouse input.

A 15,624-character comment with 253 rendered math elements reproduced a visible jump. The popup appeared at 1,574 ms, then moved approximately 292.4 px horizontally and -317.5 px vertically at 1,750 ms, with no PDF scrolling. The initial visible bottom edge was outside the Reader viewport. An empty image annotation also appeared at 113.0 px high and later shrank to 71.3 px as Zotero focused its native editor and the fast textarea took over.

## Change

- First mounts request native final-size measurement after rendering, as reused popups already did.
- A completed render receives one fresh bounded settling deadline. A mount timeout that became overdue during expensive synchronous formula rendering cannot prematurely end that interval.
- Before reveal, placement is calculated from the active native annotation anchor and final popup dimensions using Zotero ViewPopup's placement branches and viewport padding. This makes a later React position commit land at the same coordinates. Unsupported private Reader shapes retain the existing viewport-clamp fallback.
- The view and popup occupy separate primary/secondary layers, so anchor selection matches the pane instead of requiring the view container to contain the popup.
- Empty page-origin popups wait for Zotero's scheduled native focus and the fast editor's sizing/focus callback, then remeasure and pass the quiet-frame gate. The existing bounded fallback remains available if the handoff does not complete.

## Final foreground validation

All eight large-document runs retained `visibilityState: visible`. No final run had a visible geometry change or a hide after first target appearance. Every final popup was within the Reader viewport. Rendered preview signatures matched independently opened previews; the comment-level source cache marker is deliberately not used as proof of current popup content because it can retain an earlier source during native component reuse.

| Case | First target appearance | Visible geometry changes |
| --- | ---: | ---: |
| Longest comment, add-on renderer cache reset | 2,618 ms | 0 |
| Longest comment, cache reset with concurrent CPU work | 3,826 ms | 0 |
| Empty annotation initial opening | 466 ms | 0 |
| Ordinary formula comment initial opening | 488 ms | 0 |
| Same-page longer-to-shorter click | 453 ms | 0 |
| Same-page shorter-to-longer click | 460 ms | 0 |
| 7,488-character / 172-math-element comment | 1,329 ms | 0 |
| Empty annotation reopening | 429 ms | 0 |

Cache-reset runs reloaded the add-on; the PDF and application were already open. The busy-host run overlapped the automated test suite. These observations are approximate and do not establish a performance benchmark. Formula-heavy first renders still block the main thread and delay appearance; this change addresses visible repositioning rather than conversion throughput.

Four additional foreground runs on the seven-annotation fixture at 100% font size covered initial opening, both directions of a same-page switch, and formulas. All four had zero visible geometry changes, zero hides after target appearance, and an in-viewport final popup.

Automated validation passed 26 files / 407 tests, TypeScript checking, documentation checking, packaging, and whitespace checking. Focused regressions include late-render deadlines, first-mount measurement, delayed React placement with a separate view layer, and empty-editor handoff.

The final local XPI SHA-256 is `ce5cc9dd8b142e75452d1ecde52a9acfc937706ac15161b87c80df550a7bcc9c`, at `output/zotero-annotation-markdown-0.12.1-large-popup-fix.xpi`. The published update manifest was restored after local packaging. Raw local evidence is in `.tmp/popup-position-qa-2026-10-08/large-before-results.json`, `large-final-results.json`, and `small-final-results.json`; titles, keys, annotation content, and screenshots are excluded from this report.

All 423 copied annotations and the seven fixture annotations retained their original comments and positions. The development profile's original XPI, preferences, selection, and sidebar state were restored. The daily profile was inspected read-only and remained on the earlier trial at the time of this test.

Follow-up: the final-trial hash was subsequently confirmed installed in the daily profile. The three-height latency measurements and complete archive are indexed in the [0.12.2 evidence summary](2026-10-09-popup-release-summary.md).
