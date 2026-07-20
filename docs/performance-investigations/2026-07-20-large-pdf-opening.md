# Large PDF opening performance investigation (2026-07-20)

## Status

Exploratory evidence only. This investigation does not justify a rendering architecture change by itself.

## Question

Does Annotation Markdown cause the intermittent period of UI unresponsiveness observed while opening a large PDF with many annotations?

## Test setup

- Zotero 9.0.6 on Windows.
- The same large, heavily annotated PDF was used for every run.
- Each run captured 45 seconds after opening the PDF.
- The annotation sidebar was not scrolled. One light sidebar interaction was performed after opening.
- `Render near the viewport` was selected for plugin-enabled runs.
- Plugin diagnostics were enabled for the two plugin-enabled runs.
- Process-level sampling covered all Zotero processes. CPU can exceed 100% because it is summed across cores and processes.
- Windows `Responding` is a coarse signal. Short UI stalls may not set it to false.

The runs were sequential rather than randomized. The first run was a cold open and later runs may have benefited from operating-system or PDF caches, so a fourth plugin-disabled run was added as a warm-cache comparison.

## Results

| Run | Plugin | Math | Average total CPU | Peak interval CPU | Approx. not responding | Peak working set |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 1 | Disabled | N/A | 158.7% | 322.3% | 2.8 s | 3032.5 MB |
| 2 | Enabled | Disabled | 132.0% | 351.0% | 0 s | 4194.0 MB |
| 3 | Enabled | Enabled | 126.5% | 433.2% | 0 s | 3425.5 MB |
| 4 | Disabled | N/A | 139.1% | 343.3% | 21.24 s | 2759.8 MB |

The fourth run was verified to occur after the add-on shutdown completed. The diagnostic log received no entries during that run.

### Plugin rendering diagnostics

Both plugin-enabled runs rendered the same six near-viewport annotations and processed 10,166 source characters.

| Metric | Math disabled | Math enabled |
| --- | ---: | ---: |
| Markdown/KaTeX time | 150 ms | 523 ms |
| DOM time | 18 ms | 23 ms |
| P50 per annotation | 25 ms | 103 ms |
| P95 per annotation | 50 ms | 137 ms |
| Maximum per annotation | 50 ms | 137 ms |
| Annotations at or above 16 ms | 4 of 6 | 6 of 6 |

Enabling math increased synchronous conversion and sanitization time by about 3.5 times while DOM time changed little. This is enough to create perceptible short UI stalls, but it did not produce a Windows `Not Responding` state in this capture.

## Interpretation

The severe and intermittent unresponsive period cannot be attributed to Annotation Markdown from these runs. It occurred in both plugin-disabled runs, including the longest observed stall, and did not occur in either plugin-enabled run.

The experiment does show a narrower plugin cost: math-enabled rendering creates longer synchronous main-thread tasks than plain Markdown rendering. That cost is real, but it is not evidence that the add-on caused the observed multi-second opening stall.

Process CPU and working-set peaks are not suitable for attributing the stall to one component. Zotero's PDF loading, native annotation sidebar, other enabled extensions, cache state, and test order remain confounding factors.

## Decision

Do not implement speculative performance changes from this result.

Keep the current lazy near-viewport strategy. Reconsider optimization only after a repeatable plugin-on versus plugin-off regression is demonstrated and plugin render timestamps or a profiler correlate that regression with plugin work.

A decision-grade follow-up should:

1. Randomize and repeat cold and warm opens for every condition.
2. Compare the native annotation sidebar closed versus open.
3. Repeat in Zotero Troubleshooting Mode or with other Reader extensions disabled.
4. Test a restored viewport containing a known long math annotation.
5. Capture a main-thread profile if the stall is reproducible.

If plugin work is then implicated, optimize Markdown/KaTeX conversion before DOM insertion. Moving synchronous conversion off the UI thread would be a larger change and should require stronger evidence than the current capture.

## Privacy

The document title, library keys, annotation identifiers, annotation text, profile path, and raw diagnostic log are intentionally excluded.
