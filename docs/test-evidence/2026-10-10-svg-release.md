# Static SVG release 0.13.0 — 2026-10-10

Version 0.13.0 includes optional static SVG previews for SVG code fences and complete SVG documents in unlabeled fences. The feature remains experimental and off by default. Enable **Render SVG code blocks (Experimental)** in Annotation Markdown settings.

[Release](https://github.com/qrkks/zotero-annotation-markdown/releases/tag/v0.13.0) · [Copyable samples](../examples/svg-samples.md) · [Saved release checks](2026-10-10-svg-release.json) · [Initial compatibility and interaction validation](2026-10-10-svg-mvp.md)

## Final local gates

- `pnpm run verify`: 30 files / 571 tests, TypeScript, documentation (4 bilingual page pairs and sample consistency), build and packaging passed.
- `pnpm audit --prod`: no known vulnerabilities found.
- `pnpm run release:verify v0.13.0`: package version, add-on version, changelog, tag name and both update manifests match the packaged XPI.
- `git diff --check`: passed.

The final XPI contains 49 files. Exactly 48 match the previously tested SVG/font trial byte for byte. The only changed file is `manifest.json`, and its only content change is version 0.12.3 → 0.13.0. The packaged SVG preference still defaults to false.

## Final native-host smoke test

The exact final XPI was installed in the isolated development profile of Zotero 10.0.6 / Gecko 140 on Windows. All five issue examples and the Chinese Jordan diagram decoded successfully. Their six annotations remained saved and undeleted. The original seven Markdown/math/editor fixtures and the page-popup preference remained unchanged.

The final larger-image viewer decoded the embedded-font sample. Escape closed it, restored opener focus and retained annotation selection. These checks use MCP APIs and untrusted DOM events. The earlier trial also covers font use, source preservation, edit/save/Reader reopen, rejection cases, sidebar and popup viewer paths, and keyboard isolation. The maintainer reported no problems during manual testing of that byte-equivalent trial; the final instrumented smoke test does not claim a Zotero process restart or a new physical-input run.

## Artifact

`zotero-annotation-markdown.xpi`, 1,143,094 bytes, SHA-256:

`4e9c063bd3bea7b37ba08c3c49a971ce2a0f91955f64585852f104c77303f802`

The committed JSON records the local release checks and native smoke results. Detailed package comparisons, raw native results and a copy of this XPI are preserved locally in `output/release-0.13.0/`. Publication follows the repository's tag-triggered workflow, which repeats the verification gates and checks the uploaded digest and downloaded asset against the built XPI.
