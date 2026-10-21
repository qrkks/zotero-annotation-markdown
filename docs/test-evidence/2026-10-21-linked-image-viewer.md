# Linked-image viewer verification — 2026-10-21

## Change

Loaded raster image-link previews open in the existing larger-image viewer. The viewer uses the loaded image data and intrinsic bitmap dimensions, independently of the SVG and Mermaid preferences. Caption links continue to open the original URL. Ordinary Markdown images and failed-image fallback retain their existing behavior.

## Automated checks

`pnpm run verify` passed:

- 48 test files / 1,211 tests.
- Strict TypeScript checks for application source, scripts and tests.
- Documentation checks for five bilingual page pairs.
- Build and XPI packaging.

`tests/linked-image-viewer.test.ts` adds 12 cases across sidebar and popup fixtures, covering cached-image opening with SVG/Mermaid disabled; zoom and Fit; large-image size limits; keyboard opening; Escape and focus restoration; caption routing; ordinary scrolling and right-click behavior; source editing; failed saves; refresh and shutdown cleanup; failed or unsuitable image data; and recovery when the final iframe document replaces the initial document without a load notification.

## Native Dev check

The actual renderer, sidebar adapter, controller and styles were bundled into an isolated DOM fixture in Zotero Dev 10.0.6 / Gecko 140. The fixture used a decoded 1,200 × 800 PNG supplied through the host image-loader interface.

Verified in Gecko:

- The final viewer document displayed the decoded bitmap.
- Zoom, Fit, pointer panning and wheel zoom worked.
- Keyboard opening, Escape closure and focus restoration worked.
- Repeated opening reused one image-loader result with SVG and Mermaid disabled.
- Ordinary preview wheel events remained available for scrolling.
- Caption clicks routed once to the original URL.
- Source editing received the original Markdown, and shutdown restored it and removed previews and overlays.

The fixture was removed after verification. No library items or annotations were created, and no plugin was installed into the production profile. This check exercised native Gecko DOM behavior in an isolated fixture; persistence through a real Reader annotation was not tested. Editor-save failure, refresh and reopening behavior are covered by the automated controller fixtures.

## Local test artifact

- File: `dist/zotero-annotation-markdown-linked-image-viewer.xpi`
- Version: 0.16.1, unreleased local test build.
- Size: 1,339,382 bytes (1.28 MiB).
- SHA-256: `fb84df6aae55cc1fa56b80759db94a1bc7c5e439f85ef66a2ca6c41665235c8f`

The artifact hash matched the generated distribution update manifest at packaging time. This artifact was superseded by the combined [settings-language test build](2026-10-21-settings-language.md). The repository's published `updates.json` was restored after packaging. Validation did not push, tag or publish a release.
