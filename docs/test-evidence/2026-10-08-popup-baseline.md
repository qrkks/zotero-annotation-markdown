# Popup position and visibility check — 2026-10-08

Tested the exact 0.12.1 release XPI in the isolated Zotero Dev profile on Zotero 10.0.6 / Gecko 140. The installed SHA-256 was `03277ed8da505d733eeb14d10e0aa0b77805da2ed83dcac38db9926f903c3b79`.

Zotero MCP invoked the native page annotation selection and popup handlers. No synthetic popup DOM was inserted. The Reader remained visible throughout the measured runs. Each run sampled geometry, opacity, annotation ID, preview content, and PDF scroll position on animation frames for approximately 1.2 seconds.

Fresh and repeated openings were stable once PDF navigation had settled, including basic Markdown, formulas, long comments with an outline, and simulated anchors at all four corners. The initial smooth-navigation measurements included small native scroll-following corrections and are not evidence of a popup initialization defect.

**A reproducible defect remains when switching annotations without closing the popup.** The native popup DOM is reused: its source ID changes, but it becomes ready while the previous rendered preview is still visible. The preview subsequently changes while opacity is already 1.

Three same-page switches were measured without any PDF navigation or scroll change:

| Switch | New-ID popup first visible | Correct preview first sampled | Visible height change |
| --- | ---: | ---: | ---: |
| Basic → links | 61 ms | 138 ms | −46.3 px |
| Links → basic | 76 ms | 135 ms | +46.3 px |
| Basic → links, repeated | 54 ms | 120 ms | −46.3 px |

At a simulated bottom-right native popup anchor, switching between long and basic comments changed the visible height by 173.1 px. Switching from basic to long retained the position calculated for the short preview, leaving part of the final long popup below the viewport. These corner anchors were explicit native-handler inputs, not real annotation locations.

Thus the ordinary fresh-open position flash was not reproduced in the settled-page runs, but continuous switching still exposes old content and a visible size jump. Unit regressions alone do not cover this host DOM reuse timing: the existing targeted suite passed 2 files / 89 tests.

All seven fixture annotations retained their comments and positions. The original 0.11.1 test-profile XPI and preference/sidebar state were restored after measurement. The default user profile and production source were not modified.

Raw frame evidence is in `results.json`. The probe is in `probe.js`; the persisted summary's stale-content counts were recomputed from the actual heading text when writing the report.
