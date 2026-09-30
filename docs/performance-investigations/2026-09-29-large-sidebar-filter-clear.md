# Large annotation-sidebar filter-clear investigation (2026-09-29)

## Status

Preserved diagnostic evidence plus an opt-in implementation spike. The comparison strongly attributes the dominant filter-clear stall to Zotero's native annotation-list update. A temporary row-containment experiment reduced the measured delay, but the remaining cost and compatibility risk do not justify shipping that CSS workaround. A later version-gated lazy-row implementation substantially reduced the tested filter-clear delay while preserving native fallback outside its narrow verified boundary.

This is a follow-up to [Large ebook annotation-sidebar startup investigation](2026-09-29-large-ebook-sidebar-startup.md).

## Question

When a tag filter is cleared and hundreds of annotations return to the Reader sidebar, is the long stall caused mainly by Annotation Markdown or by Zotero's native annotation list? Can CSS containment safely mitigate the host cost?

## Test setup

- Zotero 10.0.3 on Windows.
- Annotation Markdown 0.10.2 was installed in a dedicated development profile.
- The same copied stress-test item with 423 annotations was used throughout.
- One existing tag reduced the visible annotation list from 423 rows to 3. The tag name is intentionally excluded.
- Clearing the filter restored approximately 420 native annotation rows.
- Every condition was repeated five times in the same Reader lifecycle.
- Tests invoked the actual tag-selector button's click handler. Direct calls to the internal filter manager were rejected as a benchmark path because they did not preserve the React-owned selector state.
- The button handler returned before the expensive React commit. A microtask queued immediately after the click measured how long the Reader event loop remained unavailable; the row count was 423 when that microtask ran.

Codex was foreground during collection, so the Reader document reported `visibilityState: hidden`. The measurements isolate JavaScript and DOM commit blockage, but exclude foreground painting and do not validate the visible smooth-scroll animation. They are suitable for comparing the tested conditions, not for claiming an absolute user-visible latency.

## Baseline results

All values are elapsed time from clearing the filter until the queued microtask could run with 423 annotation rows present.

| Condition | Five runs | Mean | Median | Range |
| --- | --- | ---: | ---: | ---: |
| Add-on enabled, Markdown feature enabled | 3.621, 3.770, 3.096, 3.730, 3.303 s | 3.504 s | 3.621 s | 3.096–3.770 s |
| Add-on enabled, Markdown feature disabled | 3.121, 3.233, 3.522, 3.210, 3.859 s | 3.389 s | 3.233 s | 3.121–3.859 s |
| Add-on fully disabled | 2.899, 3.467, 3.473, 3.059, 3.787 s | 3.337 s | 3.467 s | 2.899–3.787 s |

The three ranges overlap substantially. Disabling only the Markdown feature was 52 ms slower on average than fully disabling the add-on. Keeping the feature enabled was 167 ms slower on average than fully disabling the add-on. Both differences are much smaller than the run-to-run spread.

The selector click itself returned in 0–7 ms. The multi-second delay occurred after the handler returned and before the next queued microtask, which places the dominant blockage in the scheduled React update and DOM commit rather than in the click handler.

## Host-source evidence

The installed Zotero 10.0.3 `resource/reader/reader.js` bundle supports this attribution:

- `AnnotationsView` builds `filteredAnnotations` from the complete annotation array.
- It traverses all annotations to derive tag, color, and author selector state.
- It traverses the filtered annotations again to mark active selector values.
- It maps every filtered annotation to an `Annotation` React element.
- `Annotation` is wrapped in `React.memo`, which helps unchanged mounted children but does not avoid mounting hundreds of rows that were removed by filtering.

Clearing the filter therefore shares the mass annotation-row construction path seen during Reader startup, without ebook parsing and other document-opening work.

## Temporary row-containment experiment

The add-on was fully disabled, and a removable style was injected only into the current Reader document:

```css
#annotations > .annotation:not(.selected):not(:focus-within) {
  content-visibility: auto;
  contain-intrinsic-size: auto none auto 111px;
}

#annotations > .annotation.selected,
#annotations > .annotation:focus-within {
  content-visibility: visible;
  contain-intrinsic-size: none;
}
```

The 111 px fallback was calibrated for this sample so the synthetic list height remained close to the native height. It is not a portable value for other libraries, font settings, or annotation distributions.

### Containment results

| Condition | Five runs | Mean | Median | Range | Change from matching baseline |
| --- | --- | ---: | ---: | ---: | ---: |
| Add-on fully disabled, temporary containment | 2.683, 2.582, 2.614, 2.704, 2.760 s | 2.669 s | 2.683 s | 2.582–2.760 s | 20.0% lower mean |
| Add-on enabled, temporary containment | 2.711, 2.968, 2.652, 2.583, 2.220 s | 2.627 s | 2.652 s | 2.220–2.968 s | 25.0% lower mean |

The experiment removed roughly 0.7–0.9 seconds from the measured event-loop blockage. It did not remove the remaining approximately 2.6 seconds, which is consistent with React traversal, component creation, and other host work that CSS cannot skip.

## Compatibility observations

- The native list height was approximately 49,778 px without containment and 49,917 px with the calibrated fallback, a difference of about 0.28%.
- After scrolling to the bottom and materializing real row sizes, the list height reached 50,053 px. The last row became visible and the adjustment remained below 1% of total height.
- A 15,624-character comment could be selected and fully expanded. Its row switched from `content-visibility: auto` to `visible` and removed the intrinsic-size fallback.
- Deselecting the long comment restored its collapsed row height and returned the total list height to approximately 49,900 px.
- With Annotation Markdown enabled, the plugin's selected-long-row marker and 2 px top scroll margin remained present. A non-animated `scrollIntoView()` aligned the row at the expected 2 px inset.
- Smooth scrolling could not be visually validated because the Reader was hidden while Codex was foreground. A foreground manual test would still be required before shipping any containment behavior.

These checks reduce, but do not eliminate, the risk of scroll-height drift, delayed materialization, selection jumps, editor focus bugs, or theme- and font-dependent fallback errors.

## Native row-mount substitution experiment (2026-09-30)

A second diagnostic experiment replaced the inner React component used for newly mounted native annotation rows while leaving Zotero's real filter state, selector, parent `AnnotationsView`, row keys, outer `.annotation` elements, and an approximately equivalent 111 px row height in place. The add-on's Markdown feature was disabled for the comparison.

The probe was installed through the live React fiber only after the list had been filtered to three rows. Clearing the filter therefore mounted 420 new rows through the selected probe component. Every condition used the real selector button and the same post-click microtask boundary as the earlier experiment.

The stress item contained 395 image annotations and 28 note annotations. The selected filter retained three image annotations, so clearing it added 392 image rows and 28 note rows.

| Newly mounted row component | Five runs | Mean | Median | Range | Full rows / shells after clear |
| --- | --- | ---: | ---: | ---: | ---: |
| Original native `Annotation` | 2.783, 2.831, 2.800, 2.625, 2.751 s | 2.758 s | 2.783 s | 2.625–2.831 s | 423 / 0 |
| Equal-height outer-row shell | 0.040, 0.053, 0.041, 0.034, 0.029 s | 0.039 s | 0.040 s | 0.029–0.053 s | 3 / 420 |
| Full image rows, note shells | 2.663, 3.165, 3.265, 3.342, 3.085 s | 3.104 s | 3.165 s | 2.663–3.342 s | 395 / 28 |
| Full note rows, image shells | 0.251, 0.292, 0.208, 0.203, 0.196 s | 0.230 s | 0.208 s | 0.196–0.292 s | 31 / 392 |

Replacing all 420 newly mounted native row bodies with shells reduced the measured blockage by 98.6%. The parent filter calculation, selector-state work, React reconciliation of the outer rows, insertion of 420 simple DOM nodes, and creation of the calibrated list height together took about 39 ms in this probe. The multi-second baseline therefore comes overwhelmingly from constructing and mounting each complete native `Annotation` subtree, not from the tag button or the parent array filtering alone.

Image rows dominate the aggregate cost in this sample because they are 93.4% of all annotations. The type split does not prove that image decoding is uniquely pathological: subtracting the all-shell mean gives a rough incremental cost of 7.8 ms per added full image row and 6.8 ms per added full note row. Those coarse per-row figures are similar and were collected sequentially, so the robust conclusion is full-row mount cost multiplied by row count, not an image-only defect.

The first substitution attempt created the shell function in Zotero's privileged chrome compartment. React rejected that cross-compartment function, the Reader error boundary cleared its UI, and the 189 ms observation from that failed run was discarded. The original component reference was restored before the Reader was reopened. The valid probe was recreated entirely inside the Reader page's own JavaScript compartment; it produced all results above without a React error.

## Lazy native-row materialization prototype (2026-09-30)

A third live probe kept the real parent list and row keys but mounted a lightweight outer row for offscreen annotations. `IntersectionObserver` used the native `#annotations` scroller with a 600 px vertical root margin. Rows materialized their complete original `Annotation` subtree when they approached the viewport or became selected. Materialization was one-way for the lifetime of that row; already visited rows were not dematerialized.

### Filter-clear performance

| Placeholder strategy | Runs | Mean | Median | Range | Change from 2.758 s native baseline |
| --- | --- | ---: | ---: | ---: | ---: |
| Fixed 111 px height, add-on feature disabled | 0.088, 0.132, 0.069, 0.097, 0.097 s | 0.097 s | 0.097 s | 0.069–0.132 s | 96.5% lower mean |
| Exact cached row height, add-on feature disabled | 0.053, 0.103, 0.077, 0.116, 0.082 s | 0.086 s | 0.082 s | 0.053–0.116 s | 96.9% lower mean |
| Exact cached height plus minimum-height reservation, add-on enabled | 0.146, 0.092, 0.109 s | 0.116 s | 0.109 s | 0.092–0.146 s | 95.8% lower mean |

Immediately after each clear, only the three rows retained by the previous filter were complete and the other 420 were placeholders. With the exact-height probe, 11–13 complete rows were mounted near the top after the observer settled; the remainder stayed lightweight. With Annotation Markdown enabled after a clean plugin reload, the sidebar settled at 11 complete rows, 412 placeholders, six plugin preview nodes, and the expected add-on style without a new React error.

### Height and navigation findings

The 423 measured native row heights ranged from 40.15 to 346.82 px, with a 108.90 px median and 110.67 px mean. That variation explains why one global 111 px estimate cannot preserve arbitrary navigation positions even though it preserves total height approximately.

- Fixed-height placeholders made a direct jump to an unmaterialized region visibly unstable. Nearby rows materialized in about 202 ms, but the tracked screen anchor moved approximately 762 px.
- Exact cached heights preserved the final native list height of 49,778 px, but image rows briefly collapsed while their image nodes loaded. The tracked anchor still moved 224 px even though the final total height recovered exactly.
- Applying the cached height as `min-height` to the newly materialized complete row prevented that transient collapse in the tested jump. The list height, `scrollTop`, and tracked screen anchor all finished with 0 px change; nearby placeholders became complete within 139 ms.
- Focusing a distant placeholder invoked Zotero's real selection callback. It became a selected complete row within the first 52 ms observation and remained at a stable screen position. The list grew 27 px because Zotero expanded the selected row, which is expected native behavior rather than placeholder drift.

### Scope of the result

The prototype demonstrates a viable mitigation for clearing a filter after the sidebar has already displayed the full list: capture each collapsed row's measured height, retain those heights while rows are filtered out, and lazily restore complete rows when they approach the viewport or become selected.

It does not yet solve first-open startup. A newly opened Reader has no same-lifecycle height cache before Zotero mounts all rows. Startup support would require a validated persistent height cache keyed by annotation and layout inputs, a reliable height model, or a deeper native patch that avoids constructing `SidebarPreview` while still reserving its correct geometry. A fixed global estimate is not acceptable for scrollbar jumps, annotation navigation, or programmatic selection.

The one-way strategy also amortizes rather than permanently removes row cost: scrolling through the entire sidebar eventually mounts every visited row. Dematerializing distant rows could bound DOM size, but should not be attempted until focus, editing, selection, drag-and-drop, height updates, and scroll anchoring have dedicated lifecycle tests.

## Opt-in implementation spike validation (2026-09-30)

The prototype was converted into a disabled-by-default preference guarded by an exact Zotero 10.0.3 version check and strict React/fiber shape validation. It only activates when a full same-lifecycle height cache already exists and a checked tag filter is being relaxed. Unsupported versions, missing APIs, unknown component shapes, insufficient caches, and layout-signature changes retain Zotero's native path.

The product path also differs from the earlier probe in several lifecycle details:

- Reader startup waits for the restored Reader document before creating DOM integrations.
- A transient `annotation-row` result during cold startup is retried for up to five seconds; structural incompatibility is not retried.
- The selected row is never replaced by a placeholder.
- Viewport-near rows are complete synchronously, while distant rows use exact cached heights and materialize through `IntersectionObserver`.
- Direct native focus on a placeholder materializes it and invokes Zotero's real selection callback.
- Disabling the preference restores the original memo component immediately and materializes remaining placeholders in small batches, avoiding a long synchronous shutdown stall.

### Final development-build checks

These timings are live acceptance checks rather than a new five-run benchmark. They used the same 423-annotation item and real tag-selector button.

| Check | Result |
| --- | --- |
| Cold start | Plugin style active; 423 original rows; zero placeholders; exact cache armed for all 423 rows |
| First measured filter clear | 280 ms; 423 rows restored; 11 complete rows and 412 placeholders |
| Settled repeat | 267 ms; 423 rows restored; 11 complete rows and 412 placeholders |
| Distant placeholder focus | Complete selected native row restored in 187 ms; native sidebar scrolled to the target |
| Disable preference | Preference setter returned in 122 ms; all 423 native rows were restored without a synchronous multi-second stall |
| Final cold restart | 423 original rows, zero placeholders, zero selected rows, `scrollTop` 0, exact cache armed for 423 rows |

The two final clear-filter observations are about 90% lower than the 2.758 s native substitution baseline, while still doing more work than the minimal diagnostic shell probe because viewport-near rows are mounted synchronously and the implementation carries focus, cleanup, and fallback behavior. The result does not change the first-open scope: Zotero still performs its native initial row construction before an exact height cache exists.

## Interpretation

### Foreground follow-up and cooperative materialization (2026-09-30)

The user reported approximately ten seconds of visible freezing, including in
the development window. The earlier hidden-document microtask measurements did
not measure this experience. A new foreground run with `visibilityState: visible`
measured the first animation-frame callback after the real tag-selector click:

| Path | Three first-frame observations |
| --- | --- |
| Existing lazy rows with synchronous viewport rows | 1,018, 1,223, 923 ms |
| Shared observer and cooperatively restored viewport rows | 218, 246, 221 ms |
| Installed follow-up build | 320, 245, 309 ms |

These callbacks are rendering opportunities, not proof that every image and
preview has finished painting. In the same foreground session a clear with no
height cache followed the full native-row path: its commit took 30,111 ms and
its first frame arrived at 30,597 ms. This single observation is not a repeated
native baseline, but confirms that the earlier sub-second numbers cannot be
generalized to cache-miss fallback or to all foreground work.

The follow-up implementation starts cached unselected viewport rows as exact
height shells too, shares one IntersectionObserver, deduplicates materialization,
and yields after at most two rows or eight milliseconds of work. A single native
row may exceed that budget because its synchronous React commit is not
preemptible. Selection still restores its native row immediately. The viewport
range is read once before React mutates the list, and reservation lookup no
longer scans all rows for every restored row.

An old-runtime cleanup also caused prolonged unresponsiveness while restoring
hundreds of rows and required restarting the development profile. Recovery now
starts asynchronously and uses the same small time-bounded commits; disabled
shells stay shells until explicitly restored by recovery or selection, so parent
updates cannot bypass the recovery queue. Height-cache requirements and version
gates remain in effect. This improves successful lazy activation and does not
claim to remove cache-miss native stalls.

The installed build also restored a distant shell as a selected complete native
row (639 ms at the delayed observation). Disabling through the real preference
returned in 91 ms; recovery progressed while the development API stayed
responsive and finished at 423 native rows, zero shells, and no remaining page
runtime. Total recovery still takes time because every native row must be
constructed. No new React error was observed. Automated verification passed
24 files / 375 tests, type checking, documentation checks, build, and packaging.

The baseline A/B comparison is the main result: clearing the tag filter remains slow when the add-on and all of its Reader DOM work are absent. The optimized add-on contributes little relative to the host-owned multi-second update.

The CSS experiment shows that layout-related containment can mitigate part of the cost. The component substitution explains why it could not remove the stall: `content-visibility` retains the complete React component and DOM subtree, while the equal-height shell avoids constructing that subtree. The improvement is too small to justify shipping the CSS workaround by itself, especially because the fallback size is workload-dependent and the remaining delay is still substantial.

The native `Annotation`/`SidebarPreview` mount boundary is therefore the correct intervention point. For filter clearing, exact cached heights plus minimum-height reservation made lazy one-way materialization both fast and stable in this sample. Further tuning of the tag-filter handler or parent array traversal is unlikely to address the dominant cost shown here.

## Decision

- Preserve commit `9623bbc`; it prevents the add-on from amplifying bulk sidebar work and makes the disabled-feature path close to native.
- Do not productize the temporary row-containment CSS from this experiment.
- Do not spend more time tuning Markdown rendering or MutationObserver batching for this specific stall without new evidence.
- Keep the implemented one-way lazy native-row path version-gated and opt-in while it receives manual use. Retain the exact same-lifecycle height-cache requirement, minimum-height reservation, strict host-shape checks, and immediate native fallback; do not broaden it to arbitrary startup, scroll, or selection paths from these results alone.
- Keep first-open startup out of the initial implementation claim. It needs a separate height-source design and clean-start measurements.
- Any replacement-list experiment must preserve dynamic row heights, tag filtering, selection, smooth scrolling, keyboard focus, editing, drag-and-drop, multi-selection, and Reader disable/re-enable behavior.

## Cleanup and final state

The temporary style, ad-hoc substituted React components, and benchmark globals were removed. The packaged development build now contains the opt-in implementation, enabled only in the dedicated development profile for continued testing. The tag filter and annotation selection were cleared, the sidebar returned to the top, and performance diagnostics remained disabled. The final cold-start check found 423 original annotation rows, zero placeholders, the exact 423-row cache armed, plugin previews active, and the expected add-on style. The default Zotero profile was not changed.

## Privacy

The item title, creators, tag name, library keys, annotation identifiers, annotation text, profile path, screenshots, and raw diagnostic output are intentionally excluded. Only aggregate counts, timings, lengths, and layout measurements are retained.
