# Performance diagnostics

[简体中文](../zh-CN/performance-diagnostics.md)

The add-on includes an opt-in performance log for diagnosing slow reader scrolling, annotation rendering, and editing. It is intended for development and bug reports, not for routine use.

## Privacy warning

The diagnostic log can include annotation identifiers, DOM class names, and excerpts of annotation comments (up to 300 characters for a sampled annotation). Review and redact the file before sharing it publicly. Do not attach a complete log if it contains private research notes or document text.

## Enable diagnostics

1. Open Zotero **Settings → Advanced → Config Editor**.
2. Search for `extensions.annotationMarkdown.performanceDiagnostics`.
3. Set the preference to `true`.
4. Close and reopen the reader before capturing a clean reproduction.

Set the preference back to `false` after testing. The add-on observes preference changes, but reopening the reader gives each capture a clear lifecycle and avoids mixing old and new controller state.

Zotero documents the [Config Editor](https://www.zotero.org/support/preferences/advanced) and [hidden preference workflow](https://www.zotero.org/support/preferences/hidden_preferences) in its support pages.

## Find and reset the log

The log is named:

```text
annotation-markdown-debug.log
```

It is stored directly in the active Zotero profile directory, not in the Zotero data directory. Typical profile roots are:

```text
Windows: C:\Users\<username>\AppData\Roaming\Zotero\Zotero\Profiles\<randomstring>
macOS:   /Users/<username>/Library/Application Support/Zotero/Profiles/<randomstring>
Linux:   ~/.zotero/zotero/<randomstring>
```

See Zotero's [profile directory documentation](https://www.zotero.org/support/kb/profile_directory) if more than one profile exists.

The active log is automatically rotated when it reaches 5 MiB. The add-on keeps one backup named `annotation-markdown-debug.log.1`, so diagnostic storage stays bounded at approximately 10 MiB. For a clean capture:

1. Close Zotero.
2. Rename or delete `annotation-markdown-debug.log`.
3. Start Zotero and reproduce the problem once.
4. Close the affected reader so its final lifecycle entries are written.

Deleting both the active log and its `.1` backup is safe while Zotero is closed. They contain diagnostics only and are recreated when needed.

Some startup and lifecycle messages can appear even when performance diagnostics are disabled. Detailed `perf` and `edit` entries require the preference above.

## Capture a useful reproduction

Record each interaction separately when possible:

1. Open the PDF or EPUB and wait for the sidebar to settle.
2. Scroll the annotation sidebar from top to bottom.
3. Click a page highlight and wait for the sidebar to jump to its annotation.
4. Edit a long annotation and type continuously for several seconds, first with the faster replacement editor enabled and then with it disabled.
5. Collapse and expand a long annotation, then scroll away and back.
6. Close the reader.

Note the approximate wall-clock time of each action. That makes it much easier to match an observed pause to a log entry.

## Read the log

Each line starts with an ISO timestamp. The most useful entry families are:

| Entry | Meaning |
| --- | --- |
| `perf renderNow` | Synchronous DOM scan and render dispatch. `durationMs` does not include all later idle work in eager or lazy mode. |
| `perf lazyRender` | Adaptive idle-render batch plus cumulative rendering and cache statistics. |
| `edit pause` | Rendering observation was paused while an annotation comment editor, either the faster replacement or Zotero's native editor, was active. |
| `edit resume` | Editing ended and the add-on reconciled the affected annotations. |
| `edit paused mutations` | Mutation summary around the paused editing interval. It is diagnostic context, not a count of every keystroke. |

### Rendering fields

| Field | Interpretation |
| --- | --- |
| `mode` | `sync`, `eager`, or `lazy`, based on the selected rendering strategy and annotation count. |
| `nodes`, `handled`, `filtered` | Candidate comment nodes scanned, handled, or excluded. |
| `batchNodes` | An adaptive idle batch, currently between one and four annotations. |
| `totalNodes` | Cumulative annotations rendered during the current controller lifecycle. |
| `cachedNodes` | Nodes satisfied from the rendered-HTML cache. |
| `markdownMs` | Cumulative source normalization, Markdown/KaTeX conversion, and sanitization time. |
| `domMs` | Cumulative time applying rendered HTML or placeholders to the reader DOM. |
| `p50Ms`, `p95Ms`, `maxMs` | Per-annotation render-duration distribution. |
| `slowNodes` | Annotations whose measured render work took at least 16 ms. |
| `sourceChars` | Cumulative source characters processed. |
| `mountedPreviews` | Fully rendered annotation previews currently mounted in the DOM. |
| `placeholders` | Lightweight placeholders currently mounted instead of full previews. |
| `cacheEntries`, `cacheBytes` | Render-cache entries and an estimated cache size. |
| `offscreenEntries`, `offscreenBytes` | Cached offscreen entries and their estimated size. |

`cacheBytes` and `offscreenBytes` are accounting estimates derived from retained strings and fixed weights. They are useful for comparing runs, but they are **not** the Zotero process's actual memory consumption. Use the operating system or a profiler to measure real memory and leaks.

### Editing fields

| Field | Interpretation |
| --- | --- |
| `pausedForMs` | Time for which the add-on kept rendering observation paused during editing. |
| `commentNodes` | Annotation comment nodes present when editing began. |
| `renderedPreviews`, `placeholders` | Mounted plugin preview state at the edit boundary. |
| `batches`, `mutations` | Mutation-observer activity summarized around the paused interval. |
| `activeEditorMutations` | Mutations associated with the active annotation comment editor. |
| `pluginOwnedMutations` | Mutations associated with DOM owned by this add-on. |

## Interpret common patterns

- High `markdownMs` with comparatively low `domMs` points toward Markdown, math, or sanitization work.
- High `domMs`, especially with many `mountedPreviews`, points toward DOM insertion, style, or layout pressure.
- A growing `cacheEntries` count with stable estimated bytes is expected. Continual growth across closed readers or repeated clean reproductions deserves investigation with a real memory profiler.
- High `cachedNodes` with visible pauses means the HTML conversion cache is working, but DOM reconstruction or browser layout may still be expensive.
- If typing is slow with the faster replacement editor enabled, compare the same annotation after clearing **Use a faster editor instead of Zotero's native annotation comment editor**. A large difference isolates Zotero's native editor cost; similar behavior in both modes points toward retained DOM, layout, another extension, or the Reader itself. Disable the whole add-on only as a second comparison.
- A single slow `renderNow durationMs` in `lazy` or `eager` mode does not describe the total background render time; use the following `perf lazyRender` entries as well.

## Share a diagnostic report

Include:

- Zotero version, operating system, and add-on version;
- selected rendering strategy;
- whether the faster replacement editor was enabled, and the result with it disabled;
- approximate annotation count and whether some comments span multiple viewports;
- exact reproduction steps and approximate timestamps;
- the smallest relevant log segment;
- whether the problem also occurs with the add-on disabled.

Before sharing, redact annotation text excerpts, annotation keys or IDs, document titles, paths, and any other sensitive metadata. After capture, disable the preference and delete the log if it is no longer needed.
