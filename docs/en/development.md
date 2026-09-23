# Development and release

[简体中文](../zh-CN/development.md)

## Local development

```powershell
pnpm install
pnpm test
pnpm run typecheck
pnpm run build
pnpm run package
```

The packaged add-on is generated at:

```text
dist/zotero-annotation-markdown.xpi
```

Install it through Zotero's plugin manager for real-reader validation.

## Verification

Run the complete local verification pipeline before a release:

```powershell
pnpm run verify
```

This runs the automated tests and TypeScript checks, builds the add-on, and packages the XPI. All modules under `src/` use strict TypeScript; JavaScript under `addon/` remains where Zotero executes files directly, and `scripts/*.mjs` remains Node tooling. See the [architecture and file map](architecture.md) for ownership and runtime boundaries. Core rendering, settings, DOM adaptation, reader lifecycle, and packaging have automated coverage, but the Zotero reader sidebar still requires real-Zotero checks.

## Real-Zotero release smoke test

Install the exact final XPI and record its SHA-256 before tagging a release. On the latest supported Zotero version, use a document with many annotations and verify:

1. An existing comment saves after clicking elsewhere and after pressing Escape.
2. A previously empty comment saves and immediately returns to rendered Markdown.
3. Backspace, Delete, and arrow keys edit text without acting on the annotation row.
4. Editing a partially visible annotation does not unexpectedly move it outside the sidebar viewport.
5. Clearing **Use the fast annotation comment editor** restores Zotero's native editor; enabling it again restores the faster editor.
6. Closing and reopening the Reader, and disabling and re-enabling the add-on, leave no duplicate editors or stale preview state.
7. Select earlier and later annotations from both the sidebar and document page, including an initially offscreen long comment. An annotation taller than the viewport settles near the top with a 2px inset in one native smooth scroll. Check short annotations, multiple selection, and a resized sidebar as well.
8. Scroll a selected long annotation out of view and back manually: selection and expansion persist, and no delayed correction pulls the viewport back. Repeated selection changes leave the sidebar and toolbar intact.
9. Press Escape while editing the middle or end of a long comment. After preview restoration, any visible part keeps the current position; a completely offscreen annotation receives only one smooth recovery to the 2px inset, subject to scroll limits. Clicking elsewhere must not pull the old annotation back.
10. Before Escape recovery executes, scroll, select another annotation, reopen editing, or disable the add-on. Recovery must be cancelled, temporary scroll styles restored, and a failed save must keep the editor and draft available.
11. Select a rendered comment with two or more Markdown headings. The compact outline appears as a fixed Reader-level portal without changing annotation height. Scroll the selected row fully out of view: the outline remains at the sidebar viewport. One heading, multiple selection, popups, and native notes do not receive it.
12. With experimental popup rendering disabled, open several page annotation popups and verify that their size, position, visibility, and editor remain fully native. Enable **Render page annotation popups as Markdown (Experimental)**, then open several popups in sequence, including reopening the same annotation, annotations near each viewport edge, and a long Markdown comment. Each popup should remain hidden through Zotero's deferred final-size measurement, then appear once at its final native position without exposing intermediate content, fading, or jumping. A post-render host position normally reveals on the next stable paint; later geometry changes must fall back to stabilization. Width should remain stable and shrink in a narrow Reader window; reused popup DOM—including same-ID host child replacement—should rerender the current source. The preview should have visible inner spacing and a usable vertical scrollbar. Dragging, clicking, and releasing that scrollbar must keep the preview open. With the fast-editor preference enabled, clicking regular content should open one textarea at the preview height; typing must not update the native editor, and blur or Escape must save once and restore the Markdown preview. Disable the fast-editor preference to verify the native popup editor fallback. Toggle experimental popup rendering off while the Reader remains open and verify that no ready marker, preview, sizing rule, or popup editor replacement remains. Closing a focused popup without blur must save a changed draft once and must not stop later popups from rendering. Reopening leaves no duplicate preview or fast textarea.
13. Open the outline, switch between eligible annotations and Reader tabs, and restart Zotero. The next outline remains open. Disable and re-enable the outline in add-on settings while the Reader remains open: the portal disappears and returns without overwriting its closed/open choice. Close it and repeat; temporary editing or a heading-free annotation must not overwrite that choice either.
14. Activate several outline entries with pointer and keyboard input. Only the annotation sidebar scrolls, the current heading highlight follows, and the action never opens the comment editor or clears selection. At a wide Reader width it opens to the right outside the scrollbar; at a narrow width it falls back left without covering the scrollbar. Check both light and dark themes.

This release line prioritizes real-host validation on the latest Zotero 10 version. Zotero 9 compatibility remains declared on a best-effort basis: missing fast-editor update capability must leave the native editor in control, and users can also disable the replacement editor manually.

## Release checklist

1. Start from a clean checkout or worktree, then update the version in `package.json`, `addon/manifest.json`, and `tests/version.test.js`. Update `pnpm-lock.yaml` when dependencies change.
2. Update `CHANGELOG.md` and both languages of any affected documentation.
3. Run `pnpm run verify`, `pnpm audit --prod`, `pnpm run release:verify v<version>`, and `git diff --check`.
4. Complete the real-Zotero smoke test against the exact XPI produced by that checkout.
5. Commit the version files, affected documentation, and generated `updates.json`. Confirm `git diff --exit-code -- updates.json`, then push the release commit and wait for the normal CI workflow to pass.
6. Create an annotated `v<version>` tag on that commit and push the tag. The tag-triggered `Release` workflow repeats all verification, creates the GitHub Release, uploads the XPI, and verifies the published asset digest.

Do not run `gh release create` manually during the normal release path. A manually dispatched dry run validates the current checkout without publishing:

```powershell
gh workflow run release.yml -f tag=v<version>
```

If the tag-triggered workflow fails, it leaves the tag without creating a GitHub Release. Do not upload an asset manually. Fix the cause on `main`, then either remove the failed unpublished tag after confirming no Release exists or use a new patch version.

The update manifest is served from:

```text
https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json
```

For detailed marketplace procedures, use the repository's Zotero plugin release workflow.
