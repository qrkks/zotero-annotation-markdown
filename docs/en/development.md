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

This runs the automated tests and TypeScript checks, builds the add-on, and packages the XPI. New source modules should use TypeScript; existing JavaScript modules can be migrated incrementally. Core rendering, settings, DOM adaptation, reader lifecycle, and packaging have automated coverage, but the Zotero reader sidebar still requires real-Zotero checks.

## Release checklist

1. Update the version in `package.json`, `pnpm-lock.yaml`, and `addon/manifest.json`.
2. Update `CHANGELOG.md` and both languages of any affected documentation.
3. Run `pnpm run verify`.
4. Create a GitHub release named `v<version>` and upload `dist/zotero-annotation-markdown.xpi`.
5. Commit and push the generated `updates.json` so Zotero can discover the release.

The update manifest is served from:

```text
https://raw.githubusercontent.com/qrkks/zotero-annotation-markdown/main/updates.json
```

For detailed release and marketplace procedures, use the repository's Zotero plugin release workflow.
