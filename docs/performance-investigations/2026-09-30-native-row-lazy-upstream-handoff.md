# Native annotation row lazy rendering: upstream handoff

Prepared on 2026-09-30. This is a local discussion and reproduction package;
no upstream issue, comment, or pull request has been submitted from this work.

## Problem and scope

Clearing a tag that matches a few annotations causes hundreds of complete
native annotation rows to mount together. On a 423-annotation ebook, this
blocked input even with Annotation Markdown fully disabled. Row substitution
and foreground experiments support deferring complete row construction as a
useful intervention. They do not establish a universal speedup or isolate all
first-open document loading costs.

The add-on implementation is an opt-in, version-gated monkey patch of a private
React component. It is evidence for an upstream implementation, not an API
integration pattern that upstream should copy. Upstream can implement the
behavior in its own components without discovering fibers or mutating a memo
component from another application compartment.

Detailed evidence:

- [Filter-clear experiments and failures](2026-09-29-large-sidebar-filter-clear.md)
- [Separate first-open investigation](2026-09-29-large-ebook-sidebar-startup.md)
- [Current implementation](../../src/native-annotation-row-lazy.ts)
- [Focused regressions](../../tests/native-annotation-row-lazy.test.js)

## Source and revision anchors

| Local revision | Purpose |
| --- | --- |
| `9623bbc` | Reduce the add-on's disabled-feature and bulk sidebar overhead. |
| `f1d6cd6` | Preserve filter-clear native/add-on comparisons. |
| `cba272f` | Preserve lazy-row prototype, height and navigation experiments. |
| `2c08a57` | Add opt-in native-row lazy restoration. |
| `1841820` | Share the observer, defer viewport rows, bound restoration batches, and improve cleanup. |

The desktop measurements used Zotero 10.0.3 on Windows, React 18.3.1, and
Annotation Markdown 0.10.2 in a development profile. The sample had 395 image
and 28 note annotations. Item contents and identifiers remain private; there
is not yet a redistributable fixture, a recorded hardware specification, or a
saved native CPU profile attached to this package.

The installed `resource/reader/reader.js` inspection identified the
`AnnotationsView -> Annotation -> SidebarPreview` mount path. The public
[AnnotationsView source](https://github.com/zotero/reader/blob/364415fff763c69d99a39d2f053cc30f3c4a136d/src/common/components/sidebar/annotations-view.js)
is pinned to the upstream master revision checked on 2026-09-30. It also maps
the filtered list to annotation components. This source revision is a review
reference, not a claim that Zotero 10.0.3 embeds that exact commit.

The existing upstream [PR #156](https://github.com/zotero/reader/pull/156),
"Make annotations list lazy load", was open and unmerged when checked on
2026-09-30 (head `a869c6aa7eebbd6aec82029ce3ec1696a4c7e98e`). It proposes
deferring previews and discusses dynamic-height navigation. Compare this work
with that PR before opening a competing implementation. Its performance claims
are not measurements from our sample.

## Implementation map

1. `createNativeAnnotationRowLazyController` requires the opt-in preference and
   exact Zotero 10.0.3 version. It evaluates the runtime in the Reader page
   realm. Creating component functions in privileged chrome previously caused
   React to reject the cross-compartment function; that failed timing is excluded.
2. `findHook` checks React APIs and version, native row fiber shape, writable
   memo `type`, component source markers, and agreement between up to three
   rows. It retains the original function and changes only `memo.type`.
3. `captureRows` records measured collapsed heights and cumulative positions
   while the full list exists. The layout signature includes sidebar width,
   device pixel ratio, and body font properties. Selected rows are not cached
   as collapsed rows. It is a layout guard, not a persistent content cache.
4. A capture-phase tag click records heights before narrowing. Relaxing a
   checked tag activates only with at least 100 cached rows, at least ten
   potentially restored rows, and the same layout signature.
5. Cached unselected rows initially render exact-height native outer shells.
   Selected rows use the original component immediately. A shell receiving
   native focus materializes and calls the original selection callback.
6. One IntersectionObserver uses the native annotation scroller and a 600 px
   vertical margin. Near-viewport rows also enter its deduplicated work queue.
   Each task restores at most two rows, yielding when elapsed work reaches
   eight milliseconds. A single synchronous native commit may exceed that
   budget. This uses `flushSync` to account for each commit before yielding.
7. Newly materialized rows reserve their cached height with `min-height` to
   prevent transient image-loading collapse. Native selection releases that
   reservation so the selected row can expand.
8. Materialization is one-way: visiting every row eventually creates every
   subtree. No dematerialization or persistent height cache is implemented.
9. Disable restores the original memo function immediately, disconnects the
   shared observer, cancels pending materialization, and asynchronously restores
   remaining shells in small commits. Surviving wrappers do not use the disabled
   flag alone to bypass recovery. Cleanup removes reservations and page state.

Unknown versions or host shapes retain Zotero's native behavior. Missing or
invalid heights also retain full native construction, so severe stalls are
still possible on fallback. First-open acceleration is outside this patch's
scope because both the component-discovery entry point and exact heights
depend on already mounted native rows.

## Measurement ledger

| Experiment | Boundary and visibility | Observations | Meaning |
| --- | --- | --- | --- |
| Add-on fully disabled | Post-click microtask, hidden Reader, five runs | Mean 3.337 s | Native stall survives removing the add-on. |
| Native row substitution | Same hidden microtask boundary, five runs each | Full rows 2.758 s mean; equal-height shells 0.039 s mean | Complete subtree mounting dominates that sample. Shell-only probe is not a usable product. |
| Initial implementation | Hidden acceptance checks | 280 and 267 ms | Narrow development checks; not foreground latency. |
| Initial implementation, foreground | First animation-frame timestamp, three runs | 1,018 / 1,223 / 923 ms | Synchronous viewport rows still delay a rendering opportunity. |
| Cooperative prototype, foreground | Same frame timestamp boundary, three runs | 218 / 246 / 221 ms | Directional improvement in the tested successful activation. |
| Installed follow-up, foreground | Same frame timestamp boundary, three runs | 320 / 245 / 309 ms | Packaged behavior corroborates the prototype. |
| No-cache fallback, foreground | One run after hot installation; add-on enabled | Commit 30,111 ms; frame timestamp 30,597 ms | Severe fallback outlier; not a repeated add-on-disabled baseline. |

The initial hidden comparison narrowed 423 rows to three; the foreground
follow-up used another existing tag and narrowed to one. The installed
follow-up settled at nine complete rows and 414 shells. Conditions were
sequential rather than randomized; cache, thermal, and background-load effects
were not controlled. Do not compute one headline percentage across these
different boundaries and conditions.

Historical foreground observations subtracted the click start from the rAF
argument. That argument is a frame timestamp, not necessarily the time when
the callback executes. A frame timestamp can even precede a later microtask
measurement. Neither that timestamp nor callback arrival proves final paint,
image readiness, or complete sidebar stability. The snippet below measures
callback execution instead; it is new and has not generated the ledger above.

## Reproduction procedure

1. Use a development profile and a heavily annotated document. Record Zotero
   version, OS, hardware, annotation counts/types, sidebar width, font settings,
   add-on set, and build revision. Use a redistributable document for a public
   reproduction. Do not publish private attachment or annotation contents.
2. Display the complete annotation list, with no active tag filters or editor.
   Wait for the list to settle. Record whether the patch is active and has a
   full height cache; reopening a filtered Reader is a different condition.
3. Keep the Reader window foreground throughout each run. Settle after narrowing,
   then click the real tag selector to clear it. Do not call the internal filter
   manager directly: it bypasses React-owned selector state.
4. Compare add-on disabled, initial implementation, and cooperative implementation
   in clean Reader lifecycles. Alternate or randomize condition order and repeat
   at least five times. Treat no-cache fallback as a separate condition.
5. Record commit delay, first callback execution, subsequent maximum frame gap,
   row/shell counts, and height-cache state. Separately observe visible content
   readiness and capture a native CPU profile. Exclude any run losing foreground
   visibility instead of mixing it with foreground timings.
6. Restore the filter, selection, scroll position, and changed preferences after
   measurement. Closing and reopening the document is a first-open test, not a
   replacement for a filter-clear measurement.

The following optional one-run snippet belongs in the Reader page console or
must be evaluated inside that page realm. It does not install the monkey patch,
change preferences, or save annotations. Change `tagIndex` to an existing tag
that narrows the list. Run one condition at a time; keep the Reader foreground.
Do not paste directly into a privileged console and assume its `document` is
the Reader document. It logs aggregate counts only.

```javascript
(async () => {
  const tagIndex = 1;
  const settleMs = 1500;
  const observeMs = 2000;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const button = () => document.querySelectorAll("#selector .tags .tag")[tagIndex];
  const count = selector => document.querySelectorAll(selector).length;
  const assertVisible = () => {
    if (document.visibilityState !== "visible") throw new Error("Reader hidden; discard run");
  };
  assertVisible();
  if (!button() || count("#selector [aria-checked='true']")) {
    throw new Error("Choose an existing tag and clear active filters first");
  }
  if (document.activeElement?.closest(".annotation") &&
      document.activeElement.matches("input, textarea, [contenteditable='true']")) {
    throw new Error("Finish editing before measuring");
  }
  if (count("#annotations > .annotation.selected")) {
    throw new Error("Clear annotation selection before measuring");
  }
  const beforeRows = count("#annotations > .annotation");
  let lostVisibility = false;
  const onVisibility = () => { lostVisibility ||= document.visibilityState !== "visible"; };
  document.addEventListener("visibilitychange", onVisibility);
  button().click();
  try {
    await wait(settleMs);
    assertVisible();
    const narrowedRows = count("#annotations > .annotation");
    if (button()?.getAttribute("aria-checked") !== "true" || narrowedRows >= beforeRows) {
      throw new Error("Chosen tag did not narrow the list");
    }
    const start = performance.now();
    let previous = start;
    let firstCallbackMs = null;
    let maxFrameGapMs = 0;
    let frameCount = 0;
    const framesDone = new Promise(resolve => {
      const frame = () => {
        const now = performance.now();
        lostVisibility ||= document.visibilityState !== "visible";
        firstCallbackMs ??= now - start;
        maxFrameGapMs = Math.max(maxFrameGapMs, now - previous);
        previous = now;
        frameCount += 1;
        if (now - start < observeMs) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    button().click();
    await Promise.resolve();
    const commitMs = performance.now() - start;
    await framesDone;
    assertVisible();
    if (lostVisibility) throw new Error("Reader lost visibility; discard run");
    console.log(JSON.stringify({
      beforeRows, narrowedRows, commitMs, firstCallbackMs, maxFrameGapMs, frameCount,
      restoredRows: count("#annotations > .annotation"),
      shells: count("[data-annotation-markdown-native-row-shell]"),
      patch: window.__annotationMarkdownNativeRowLazyV1?.status() ?? null
    }));
  } finally {
    document.removeEventListener("visibilitychange", onVisibility);
    if (button()?.getAttribute("aria-checked") === "true") button().click();
  }
})();
```

The observation interval is not a hard execution timeout: a native stall can
delay callbacks beyond it. Results that finish quickly can still contain pending
preview or image work. Use a CPU profile and manual observation for that tail.

## Regression evidence and remaining gaps

Automated verification at the implementation stage passed 24 test files / 375
tests, type checking, documentation checks, build, and packaging. The focused
file contains five controller tests and one combined page-runtime test.
Controller tests cover disabled and unverified-version paths, lifecycle reuse,
installation failure, and transient-row retry. The mocked runtime covers exact
height shells, focus/selection callbacks, one shared observer, deduplicated
two-row batching, asynchronous stop, recovery rendering, and hot-reload shape.
These are not real React reconciliation or Gecko rendering tests.

Live checks recorded native selection of a distant shell, height reservation
preventing anchor drift in the prototype, and cleanup completing with zero
shells and no remaining runtime. The installed follow-up's preference setter
returned in 91 ms; restoring all rows still took additional time. The user also
reported improved experience after trying the build; this is qualitative
acceptance, not a benchmark.

Before a production upstream implementation, still validate:

- Keyboard navigation, shift/range selection, multi-selection and drag-and-drop.
- Editing/saving during materialization, rapid filter changes, and Reader close.
- Width/font/zoom changes, updated or deleted annotations, and height invalidation.
- Distant jumps, smooth scrolling, image-loading geometry and native scroll anchors.
- Screen-reader labeling of shells (the current shells reference labels whose
  native content is not mounted yet), other annotation types, PDF and EPUB.
- Foreground CPU/paint profiles, multiple documents, memory growth after visiting
  all rows, and memory recovery after close.

## Upstream discussion draft

Suggested title: **Clearing annotation filters blocks the Reader while many
complete sidebar rows mount**.

On Zotero 10.0.3 for Windows, clearing a tag filter in an ebook with 423
annotations caused a multi-second event-loop stall even with our add-on fully
disabled. Replacing only the newly mounted native row bodies with equal-height
shells reduced the hidden-document commit measurement from a 2.758 s mean to
0.039 s across five sequential runs per condition. This is diagnostic evidence,
not a product benchmark. A usable opt-in add-on prototype reserves measured
heights, keeps native selection, and restores complete rows near the viewport
in small tasks. Its installed cooperative version reached a foreground frame
timestamp in 245-320 ms across three runs, compared with 923-1,223 ms for our
earlier synchronous-viewport implementation. These foreground results use a
different tag, are not randomized, and do not measure final paint.

Would the row/preview construction path be a suitable place to implement this
natively, potentially building on PR #156? We can provide implementation and
regression references plus the height/scroll experiments. Our private React
memo/fiber monkey patch is only a proof of concept. It does not solve first-open
startup, depends on a same-lifecycle height cache, and still needs the regression
and profiling work listed above. A shareable sample remains to be prepared.
