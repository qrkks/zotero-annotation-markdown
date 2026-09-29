# Large annotation-sidebar filter-clear investigation (2026-09-29)

## Status

Preserved diagnostic evidence. The comparison strongly attributes the dominant filter-clear stall to Zotero's native annotation-list update. A temporary row-containment experiment reduced the measured delay, but the remaining cost and compatibility risk do not justify shipping that CSS workaround from this investigation alone.

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

## Interpretation

The baseline A/B comparison is the main result: clearing the tag filter remains slow when the add-on and all of its Reader DOM work are absent. The optimized add-on contributes little relative to the host-owned multi-second update.

The CSS experiment shows that layout and painting-related containment can mitigate part of the cost. The improvement is too small to justify taking ownership of Zotero's native rows without stronger compatibility evidence, especially because the fallback size is workload-dependent and the remaining delay is still substantial.

## Decision

- Preserve commit `9623bbc`; it prevents the add-on from amplifying bulk sidebar work and makes the disabled-feature path close to native.
- Do not productize the temporary row-containment CSS from this experiment.
- Do not spend more time tuning Markdown rendering or MutationObserver batching for this specific stall without new evidence.
- Treat a host patch, carefully scoped monkey patch, or partial replacement of the native annotation list as a separate engineering spike. The fast-editor precedent shows that replacing one narrow native interaction path can be viable when ownership, fallback, persistence, and cleanup boundaries are explicit.
- Any replacement-list experiment must preserve dynamic row heights, tag filtering, selection, smooth scrolling, keyboard focus, editing, drag-and-drop, multi-selection, and Reader disable/re-enable behavior.

## Cleanup and final state

The temporary style and all benchmark globals were removed. The add-on and its Markdown feature were re-enabled, the tag filter and annotation selection were cleared, the sidebar returned to the top, performance diagnostics remained disabled, and no repository source was changed by the runtime experiment.

## Privacy

The item title, creators, tag name, library keys, annotation identifiers, annotation text, profile path, screenshots, and raw diagnostic output are intentionally excluded. Only aggregate counts, timings, lengths, and layout measurements are retained.
