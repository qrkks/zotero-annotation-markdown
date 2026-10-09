# Popup regression evidence for 0.12.2

Archived on 2026-10-09 from measurements taken on 2026-10-08. This index preserves the baseline failures, earlier trial limitations, final verification, and opening-latency investigation. The release fixes visible content/position changes; it does not claim faster formula conversion or an upper-screen latency fix.

## Complete record inventory

The [per-run metrics](2026-10-09-popup-run-metrics.json) contain all **85 persisted runs**, with case labels, frame counts, first appearance, visible geometry changes, visibility validity, and viewport checks where measured. Dataset hashes identify the exact original raw files.

| Stage | Runs | Scope and interpretation |
| --- | ---: | --- |
| Released 0.12.1 baseline | 28 | Seven-annotation fixture; exploratory navigation, reopenings, controlled switches, and simulated corners. Includes old-preview failures and one run without an observed popup. |
| First trial on small fixture | 15 | 100% comment font size and collapsed outline; passed these cases but missed the later large-document defect. |
| First trial on large document | 17 | Exploratory settings, native page clicks, then 160% font size and expanded outline. Reproduced the longest-comment position jump and empty-editor height change. Includes one run without a visible target in the sampling window. |
| Final trial on large document | 8 | 423 annotations, 160% font size, expanded outline; long formulas, renderer-cache reset, concurrent CPU work, switches, and empty editing. |
| Final trial on small fixture | 4 | 100% font size; initial opening, both same-page switching directions, and formulas. |
| Final trial at three screen heights | 13 | One warmup, nine balanced same-comment height trials, and three shorter-comment controls; 160% font size and expanded outline. |

The [initial native-host report](2026-10-08-popup-baseline.md), [first small-fixture fix report](2026-10-08-popup-switch.md), and [large-document follow-up](2026-10-08-large-popup-position.md) retain the detailed reproduction and earlier trial hashes. All historical trial packages still report version 0.12.1; their hashes distinguish them from the published 0.12.1 release.

## Final visible behavior

All **25 final-trial runs** (8 large, 4 small, 13 height trials) recorded a visible Reader, an observed target popup, **zero visible geometry changes**, **zero hides after the target first appeared**, and a final popup inside the viewport. All 423 copied-document annotations and seven fixture annotations retained their comments and positions.

The longest comment contained 15,624 characters and 253 rendered math elements. In the earlier trial it first appeared at 1,574 ms, then moved about +292.4 px horizontally and -317.5 px vertically at 1,750 ms without PDF scrolling. The final trial first appeared at 2,618 ms after resetting the add-on renderer cache, and at 3,826 ms with concurrent CPU work; both remained stationary once visible. The 7,488-character / 172-math-element comment first appeared at 1,329 ms without a visible move. Empty popups remained stable across the native-focus/fast-editor handoff.

## Opening latency at different heights

The same 1,328-character comment with 14 rendered math elements was moved by settled PDF scrolling to an anchor near the top, middle, and bottom of the viewport. Each height was tested three times in changing order; the warmup is excluded from the following statistics.

| Clicked annotation height | First appearance, median | Observed range |
| --- | ---: | ---: |
| Top | 394 ms | 378–407 ms |
| Middle | 404 ms | 319–721 ms |
| Bottom | 415 ms | 403–603 ms |

The shorter, 236-character / 3-math-element comment appeared at 372 ms, 764 ms, and 405 ms respectively. These small samples did not reproduce a systematic upper-anchor slowdown. Slow middle-height runs recorded animation-frame sampling gaps of about 309 ms and 391 ms while still hidden. The gate waits for the current content and consecutive stable layout frames, so delayed frame delivery extends the hidden interval. The measurements do not identify the work responsible for each scheduling gap or resolve every subjective latency report.

## Method and limitations

- Windows, Zotero 10.0.6 / Gecko 140, isolated Zotero Dev profile. The large copied sample has 395 image annotations and 28 notes.
- MCP exercised Zotero's real selection/popup handlers; later large-document and height trials dispatched synthesized mouse-down/pointer-up at existing PDF annotation hit targets. This is native-host DOM/geometry evidence, not a recording of physical mouse input.
- Frame sampling tracked geometry, opacity, annotation identity, preview signatures, and PDF scroll position. Simulated corner cases are labeled explicitly; native remeasurement can return those popups to their real annotation anchor.
- Exploratory navigation can include legitimate native scroll-following movement. Controlled same-page cases and large-document position-jump reproduction held PDF scroll position fixed.
- The earliest seven large-document runs compared a source-cache attribute with the comment baseline. That attribute can retain an earlier source during component reuse; its mismatch counts are preserved separately and are **not** treated as stale-preview evidence. Later runs compare rendered-preview signatures. A null metric means it was not measured or lacked an independent comparison; it is not a passing result.
- Renderer-cache reset did not restart Zotero or clear the PDF/application cache. First-appearance timings are observations, not a performance benchmark.
- The final native-host trial XPI SHA-256 is `ce5cc9dd8b142e75452d1ecde52a9acfc937706ac15161b87c80df550a7bcc9c`. [Release validation](2026-10-09-popup-release-validation.md) records the exact runtime comparison and automated checks for 0.12.2.
- Original development XPI, preferences, selected fixture, and sidebar state were restored after testing. The daily profile was read-only during diagnosis; its installed final-trial hash was verified on 2026-10-08.

## Local raw archive

`output/test-evidence-0.12.2/` contains all six full frame datasets, their comment/position baselines, the original probe and report, restoration metadata, original XPIs, and both trial packages. `manifest.json` records original-file byte sizes and SHA-256 values. The compressed local copy is `output/zotero-annotation-markdown-0.12.2-test-evidence-private.zip`.

The raw copied-library comments and annotation identifiers remain in this local archive. The public metrics and reports omit those values. Git preserves the public evidence with the release source; the private archive is not a GitHub release asset.
