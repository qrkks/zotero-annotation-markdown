# Issue #2: closed-sidebar popup initialization

Validated on 2026-10-08 in the existing **Zotero Dev** profile, using Zotero
10.0.6 and the synthetic Annotation Markdown Regression Fixture. The default
profile was not modified.

Candidate XPI: version 0.12.0, SHA-256
`2665b910e03e6363d4500e3dd6b579280e1a9114aea2a02bc8e0716b97f0e445`.
The installed development-profile XPI matched this hash.

The native Reader toolbar button persisted the closed-sidebar state. Each
session closed and reopened the fixture PDF, and the sidebar remained closed
with zero mounted annotation rows. Native Reader page-selection and popup
handlers opened the real page annotation popup; no synthetic popup DOM was
inserted and no annotation comment was edited.

| Build and session | Plugin styles | Popup previews | Rendered formulas |
| --- | ---: | ---: | ---: |
| Original 0.11.1, new Reader | 0 | 0 | 0 |
| Candidate, first new Reader | 1 | 1 | 3 |
| Candidate, PDF closed and reopened again | 1 | 1 | 3 |

The original build displayed raw Markdown and formula source, reproducing the
reported initialization failure. In both candidate sessions the popup reached
its ready state with opacity 1. Its original native editor was hidden, and the
stored formula source was preserved. A Zotero screenshot was inspected and
confirmed the visible rendered heading and all three formulas.

Switching to the basic Markdown annotation in the second session rendered its
heading, bold text, and emphasis with one preview and zero sidebar rows.

After validation, the original 0.11.1 XPI was restored byte-for-byte. The original
rendering preferences and open sidebar state were restored, the candidate's
toolbar listener was gone, and the fixture still contained seven annotations.
