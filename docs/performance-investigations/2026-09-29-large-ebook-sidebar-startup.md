# Large ebook annotation-sidebar startup investigation (2026-09-29)

## Status

Actionable manual evidence for reducing add-on lifecycle overhead. The measurements are approximate and are not a general Zotero benchmark.

## Question

When a heavily annotated ebook is opened, how much startup delay comes from Zotero itself, from loading Annotation Markdown, and from the add-on's annotation-sidebar features?

## Test setup

- Zotero 10.0.3 on Windows.
- Annotation Markdown 0.10.2 was installed in a dedicated development profile.
- The same copied ebook item with 423 annotations was used for every comparison.
- The source library was not modified during the investigation.
- Timing covered opening the item until the Reader and annotation sidebar reached a stable usable state.
- Clean lifecycle runs closed and reopened the Reader between conditions. A rapid reopen that overlapped previous work was treated as contaminated and excluded.
- The conditions compared a fully disabled add-on, the pre-optimization build, and the optimized build later committed as `9623bbc`.

The runs were manual, sequential, and few in number. Operating-system caches, Zotero caches, Reader state restoration, and background host work were not controlled, so ranges are reported instead of false precision.

## Procedure

For each condition:

1. Apply the target add-on build and feature state.
2. Close the Reader so the next measurement starts a new Reader lifecycle.
3. Open the same 423-annotation ebook.
4. Observe the elapsed time until the Reader and annotation sidebar settle.
5. Confirm the expected preview, style, and observer state in the live Reader.
6. Discard runs affected by an overlapping rapid reopen or other visible lifecycle contamination.

The disabled-feature comparison matters separately from the fully disabled add-on: a disabled feature should not retain most of the cost of its observers, styles, or bulk annotation scanning.

## Results

| Condition | Observed open-to-stable time | Notes |
| --- | ---: | --- |
| Add-on fully disabled | 2.45–2.60 s | Native baseline for these runs. |
| Pre-optimization build, Reader feature disabled | About 3.71 s | Loading the add-on still carried measurable Reader lifecycle overhead. |
| Optimized build, Reader feature disabled | About 2.67 s | Returned close to the native baseline. |
| Pre-optimization build, feature enabled | 4.91–5.76 s | Clean Reader lifecycle runs. |
| Optimized build, feature enabled | 3.84–4.81 s | Clean Reader lifecycle runs. |

One optimized-build measurement of about 9.7 seconds followed a rapid reopen and was excluded because work from the previous lifecycle was still in flight. It is retained here as a reminder that the manual harness needs clean lifecycle boundaries, not as evidence of a regression.

The final live-state check found the feature enabled, the outline enabled, diagnostics disabled, 423 annotation rows, three mounted previews, and the expected add-on style present. No add-on error was observed; the console contained only host deprecation warnings.

## Interpretation

The pre-optimization disabled-feature result showed that the add-on was doing meaningful Reader setup work even when its visible annotation rendering feature was off. After the change, the disabled-feature timing was close to the fully disabled baseline, which is the clearest result in this investigation.

With the feature enabled, the optimized build also improved the clean-run range, but the remaining spread is large enough that these values should be treated as directional. The measurements do not isolate every source of enabled-mode cost, and they do not show that Annotation Markdown causes all long opens.

The native baseline itself still took roughly 2.5 seconds, and this ebook had previously shown intermittent long stalls with the add-on disabled. Zotero's Reader, native annotation sidebar, ebook parsing, cache state, and other host work therefore remain plausible contributors to severe outliers.

## Implemented change

Commit `9623bbc` reduces work on large annotation-sidebars by:

- avoiding Reader observers and the Reader style while the feature is disabled;
- supporting cleanup and later re-enablement without restarting Zotero;
- coalescing sidebar annotation additions behind an 80 ms quiet window before scanning once;
- ignoring bulk insertion of unselected annotation rows in outline tracking;
- ignoring newly inserted unselected annotation rows in selected-scroll-target tracking; and
- preserving synchronous handling for page annotation popups.

## Automated verification

`pnpm run verify` passed before the commit:

- 23 test files;
- 366 tests;
- TypeScript type checking;
- bilingual documentation checks;
- production build; and
- XPI packaging.

Focused regressions cover disabled startup, disable/re-enable cleanup, bulk unselected-row insertion, selected-row handling, and synchronous popup insertion.

## Decision

Keep the optimization. It removes a repeatable disabled-feature penalty and reduces the observed enabled-mode startup range without changing annotation storage or popup timing semantics.

Use this ebook as a repeatable stress sample for future Reader lifecycle changes, but do not turn the current ranges into a fixed performance gate. A decision-grade benchmark would need randomized repeated runs, explicit cold-versus-warm cache handling, and automated start/end markers from the same lifecycle.

## Privacy

The ebook title, creator, library keys, annotation identifiers, annotation text, profile path, screenshots, and raw diagnostic output are intentionally excluded. Only the annotation count and aggregate timing observations are retained.
