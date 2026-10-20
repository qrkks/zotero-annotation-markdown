# Experimental Mermaid preview verification — 2026-10-20

- Dependency: Pele 1.7.0, pinned exactly; register flowchart, sequence, state, class, entity relationship, pie and mindmap only.
- Preference: `extensions.annotationMarkdown.mermaidEnabled`, false by default, independent of raw SVG support. English and Simplified Chinese controls and documentation are included.
- Boundary: render synchronously into an isolated SVG data image through the existing validator and purifier; no Pele DOM mounting or host stylesheet injection. Resolve generated style variables and flatten presentation styles in the dedicated adapter. Links, remote image resources and callbacks are disabled. Use a fixed light image background in either host theme.

## Automated checks

`pnpm run verify` passed: 45 test files, 1,181 tests, TypeScript checking, documentation checking, build and XPI packaging.

Focused coverage includes all seven diagram types, Chinese labels, explicit node styling, accessibility metadata, literal math-looking labels beside Markdown math, disabled defaults, strict boolean preferences, invalid syntax, unsupported diagram types, source/edge limits, escaped errors, remote resources, source preservation and no-DOM fallback. Sidebar/popup lifecycle tests cover viewer opening, settings changes with regular and tiny caches, mounted-preview invalidation, image-load fallback, fast source editing and cleanup. Preference observers refresh open controllers and unregister on shutdown. Existing raw SVG tests pass unchanged.

## Browser checks

Playwright with installed Chrome, using the production renderer, adapter, controller and stylesheet in a synthetic Reader fixture:

- Seven valid diagrams decoded successfully; one deliberately invalid block displayed escaped source fallback.
- Chinese long labels and all seven types were inspected at 350 px and 280 px column widths. Light and dark host styles retain the same readable, self-contained light image.
- The larger-image viewer opened; its image decoded; the zoom control changed from 100% to 125%; Escape closed it.
- Source editing showed the original Markdown and Mermaid exactly and hid the preview.
- After editing/focus recovery settled, disabling the preference removed all seven diagram images; re-enabling restored seven images and eight total previews without duplicates.
- All stored fixture sources stayed unchanged; controller shutdown removed every preview and restored source DOM.
- Local screenshots are in ignored `output/playwright/mermaid/`. The only browser console error was the fixture server's missing favicon.

## Local package and limits

The local XPI contains the new default preference, matching adapter source, Pele's MIT notice and upstream package snapshot. The generated package hash was checked against `dist/updates.json`; the repository's published `updates.json` was then restored unchanged. No version bump, release or live installation was performed.

Zotero's development bridge was unavailable at `127.0.0.1:6101`; native Zotero/Gecko integration remains unverified. The local Playwright Firefox browser was also unavailable. Browser fixture checks establish Chrome image decoding and interaction behavior, not complete Zotero host compatibility or performance gains.

## Follow-up: centered previews and source labels

The diagram image and its **View larger** button are centered independently. Small images keep their generated/authored width; large images keep the existing proportional shrink-to-fit behavior. No centering is applied to prose, errors, warnings or source fallback.

Valid Mermaid previews carry a preview-only source class. Sidebar headers, page markers and outline badges use `MERMAID`; authored SVG continues to use `SVG`, and mixed types use combinations such as `SVG · MERMAID` or `IMG · SVG · MERMAID`. Counts and localized hints distinguish the source kinds without counting Mermaid again as SVG. PDF/EPUB candidate detection recognizes backtick and tilde Mermaid fences, and page markers reserve room for the longer labels.

The updated `pnpm run verify` passed 46 test files and 1,193 tests, followed by type checking, documentation checking, build and packaging. Added tests cover separate/mixed source counts, invalid and hidden previews, sidebar preference changes, PDF page discovery and label sizing, and nearest-heading outline labels.

In the Chrome fixture with 316 px available image width, natural widths of 80, 122, 168 and 216 px remained unchanged; larger diagrams shrank to 316 px. Every image had zero horizontal center error; buttons differed by less than 0.01 px. All seven images decoded and their sidebar headers displayed `MERMAID`. Error text retained `text-align: start`. Local screenshots are saved as `output/playwright/mermaid/centered-light.png` and `centered-dark.png`.

## Follow-up: keep only the image centered

After visual feedback, retain centered images and restore **View larger** to its original left alignment with the annotation text. The latest layout supersedes the centered-button layout above; button appearance, image sizes and source labels are otherwise unchanged.

The 109 Mermaid/SVG rendering and viewer regression tests passed, along with documentation checking and package generation. In the Chrome fixture, all seven images decoded, image center error was 0 px, and button left-edge error relative to the figure was 0 px. Small images kept their natural width and large images still shrank proportionally. Error text remained left aligned. Local screenshot: `output/playwright/mermaid/image-centered-button-left.png`.

## Follow-up: separate source distribution

The earlier package layout above is superseded. Project and dependency snapshots now go into the companion `zotero-annotation-markdown-source.zip`, distributed alongside the XPI. The XPI retains runtime files, project and third-party license notices, and `SOURCE.txt` with the exact companion archive name, SHA-256 and rebuilding instructions. The source snapshot also includes `pnpm-workspace.yaml` to preserve the cross-platform dependency path configuration.

- XPI: 1,337,649 bytes (1.276 MiB), SHA-256 `9a16fd46d92058b9a957d2346229072737f4db9f387cce996e0cd959f5d2f796`.
- Source ZIP: 4,293,837 bytes (4.095 MiB), SHA-256 `2a8489ee9889bdee72da8748bd1ed5347b58ea29b4f5a0ef5ad9d37f56226ab9`.
- Full verification: 47 test files, 1,196 tests; TypeScript, bilingual documentation checking, build and packaging passed. Production dependency audit reported no known vulnerabilities.
- Local `release:verify v0.15.4` passed for both artifacts; this did not publish a release. Repackaging unchanged inputs reproduced both archives byte for byte. Inspection confirmed 56 runtime entries with no embedded `source/`, 1,201 source entries, matching current renderer/build source and lockfile, and retained Pele MIT notices and license.
- Release automation now uploads both artifacts and checks both published digests. No workflow dispatch, commit, tag, push, release or live installation was performed. The repository's published `updates.json` was restored after local packaging.

## v0.16.0 release preparation

After the release request, synchronize the package, manifest and version test to 0.16.0 and retain the newly generated release update manifest. The final versioned build passed `pnpm run verify` (47 files / 1,196 tests, type checking, documentation checking, build and packaging), `pnpm audit --prod` and `pnpm run release:verify v0.16.0`. Repackaging identical inputs reproduced both archives byte for byte.

- XPI: 1,337,653 bytes, SHA-256 `77769a6d3387b763413ab4031ccbef140c8ce328d2726906d2965a6fb372a950`.
- Source ZIP: 4,293,838 bytes, SHA-256 `6924550138e8c983a8b4ba976495dbb2804923b446cb84a34437803264eaeb66`.
- The Zotero bridge remained unavailable at `127.0.0.1:6101` during release preparation. The browser checks above and automated regressions remain the available integration evidence; this run does not claim a new native-host smoke test. Mermaid stays experimental and off by default.
