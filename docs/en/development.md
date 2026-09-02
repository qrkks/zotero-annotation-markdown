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
