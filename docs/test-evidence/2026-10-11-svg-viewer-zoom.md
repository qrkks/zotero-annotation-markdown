# SVG viewer zoom validation — 2026-10-11

v0.13.1 adds zoom buttons, a current percentage, a single Fit reset button, wheel zoom, and drag panning to the isolated larger-image viewer. Fit restores the original size when it fits, or shrinks an oversized diagram to show it completely. The frame grows or shrinks with the image, retaining space for the unscaled controls and stopping at the Reader edges. v0.13.0 keeps its original scrollable viewer. This change does not widen the supported SVG subset or modify saved annotations.

[Copyable samples and manual checklist](../examples/svg-samples.md) · [Automated zoom regressions](../../tests/svg-viewer-zoom.test.js) · [Rendering and Reader lifecycle regressions](../../tests/svg-rendering.test.js) · [Saved native measurements](2026-10-11-svg-viewer-zoom.json)

## Automated verification

`pnpm run verify` passes for the final source: 31 files / 587 tests, TypeScript, bilingual documentation and sample consistency, build and packaging. Sixteen zoom regressions cover the single Fit reset and percentage display, frame growth and shrinkage, Reader bounds, Fit after shrinking, pointer anchoring, wheel delta units, horizontal wheel motion, drag release/cancel and pointer identity, focus cycling, resize behavior, cleanup, and the lifetime of scroll-blocking Reader listeners.

Regressions reproduced the fixed-frame behavior before the change. Fit now uses the Reader's available space rather than the current frame or old scrollbars, so shrinking the frame cannot trap Fit in a smaller size or cause a resize feedback loop. The Reader's non-passive wheel listener is installed only while the modal is open, preserving ordinary asynchronous scrolling outside that modal.

Zoom ranges from 1% to 400%, with rendered dimensions capped at 8192 pixels per side. Images retain the same sanitized SVG data URL; there is no raster conversion or new dependency.

## Real Zotero checks

The local XPI was installed through MCP in the isolated development profile of Zotero 10.0.6 / Gecko 140 on Windows. The normal profile and published update manifest were preserved.

All six permanent SVG annotations on page 4 of the regression PDF passed image decoding, the single Fit reset, zoom in/out, repeated zoom to the upper bound, Fit after scrolling, wheel zoom, coupled frame resizing, focus cycling and Escape. Samples that exceeded the Reader bounds also passed native drag panning. A Jordan page popup additionally passed wheel zoom and panning, frame bounds, unscaled controls, Fit for an oversized diagram, Escape focus restoration and annotation selection retention. Sidebar and popup controls contain exactly Zoom out, Zoom in, Fit and Close; the percentage is a readout. Both runs used the final local package recorded in the JSON.

Gecko's `windowUtils.sendWheelEvent` and `sendMouseEvent` provided trusted, hit-tested wheel and drag events, including native pointer capture. Keyboard checks used DOM `KeyboardEvent` events and actual focus state. These are native-host automated tests; no new physical keyboard/mouse run or Zotero process restart is claimed.

- The Jordan image grew from 640 × 280 to 800 × 350 at 125%; its frame grew from 640 × 331 to 800 × 401. At 195%, the image was 1250 × 547 and the frame 1250 × 598, without scrollbars.
- At 400%, the Jordan popup frame stopped at 1878 × 925, within the Reader. The toolbar retained its original height and button font size. Tiny images keep a minimum frame size for the controls.
- Simulating a smaller Reader area through plugin-owned layout fitted Jordan to 518 × 227 in a 518 × 278 frame. Growing that area restored 100%; resizing after manual zoom preserved the chosen zoom. The user's actual Zotero window was not resized.
- When the image overflowed, trusted wheel zoom retained the pointer's image coordinate within one CSS pixel of rounding error.
- Wheel input over the toolbar or backdrop did not zoom the image or move the underlying PDF.
- Repeated zoom out stopped at 1% and disabled the unavailable control.
- Disabling SVG closed an open viewer while preserving stored annotation data.
- The original 13 annotations, including all seven Markdown/math/editor fixtures, retained their exact stored state. Selection, PDF scroll position and SVG/popup preferences were restored after testing.

## Initial local trial package

The package still identifies itself as 0.13.0 because this is a local development trial, not a release. Its exact digest and size are recorded in the JSON measurements. The trial XPI, raw MCP scripts, baseline and screenshot are retained locally in `output/svg-zoom-qa/`. Packaging's generated update hash was restored to the published v0.13.0 value.

Other users can run the same manual checks by copying the six public samples into note annotations on any PDF. The source fixtures remain unchanged.

## Release candidate 0.13.1

The final 0.13.1 package passes `pnpm run verify` (31 files / 587 tests), `pnpm audit --prod` (no known vulnerabilities), and `pnpm run release:verify v0.13.1`. Repeated packaging produces the same 1,144,708-byte XPI and SHA-256 `4473029190e5d85c100247bcbc4e3d6112afa0a11481d1044a0d88d587820cb1`.

That exact package was installed in the isolated development profile through MCP. All six sidebar samples and the Jordan page popup passed the same zoom, Fit, frame resizing, trusted wheel/drag, focus and source-preservation checks. The native harness waits for Zotero's selection-triggered PDF scrolling to settle before opening the viewer and recording its scroll-isolation baseline. All 13 annotations and the original selection, PDF scroll position and preferences were preserved. The release-candidate measurements are saved alongside the initial trial measurements in the JSON record.
