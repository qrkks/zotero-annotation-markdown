# Formula controls depend on Markdown rendering — 2026-10-09

After the user confirmed the first independent-rendering trial worked in manual testing, they reported that the formula checkbox remained interactive when both Markdown rendering scopes were off. The agreed behavior is to treat formulas as a feature of Markdown previews, with sidebar and popup rendering remaining independent peers.

## Settings behavior

| Rendering scopes | Stored formula choice | Formula checkbox | Output picker |
| --- | --- | --- | --- |
| Both off | Either | Disabled; saved choice retained | Disabled; saved mode retained |
| Sidebar only | Off / On | Enabled | Disabled / Enabled |
| Popup only | Off / On | Enabled | Disabled / Enabled |
| Both on | Off / On | Enabled | Disabled / Enabled |

Enabling either rendering scope restores the formula checkbox. The output picker additionally requires the saved formula choice to be on. Scope changes do not write the formula-enable or output-mode preferences. Command and external preference synchronization events update both controls. The pane explains the dependency beside the formula checkbox.

## Validation

- Nine new preference regressions failed before the change and passed afterward: all eight scope/formula combinations at initialization, and disable/re-enable transitions retaining both on and off choices and the output mode.
- The focused preference/scope suite passed 2 files / 22 tests.
- `pnpm run verify` passed 27 files / 423 tests, TypeScript, documentation (4 bilingual page pairs), build, and package. `git diff --check` passed.
- The v2 trial XPI has 49 files. Compared with the first manually accepted trial, only `preferences.js` and `preferences.xhtml` differ; the packaged script includes the formula-checkbox gate. The Reader runtime is unchanged.

The new dependency was checked through automated preference/controller tests and package comparison. It has not yet received a new instrumented native-host visual run. The user's earlier manual confirmation applies to the first trial's independent rendering controls.

## Local package and records

Trial: `output/zotero-annotation-markdown-0.12.2-independent-rendering-test-v2.xpi`, 1,134,508 bytes, SHA-256:

`39c66a2c2caeca8d66160e7418f428b531b24e8277e81288c3201edbefbc24df`

The manifest remains 0.12.2 for local manual testing. The original trial and published release remain separately identifiable. The root public update manifest was restored after packaging.

Local records in `.tmp/independent-rendering-qa-2026-10-09/`: `math-dependency-before.log`, `math-dependency-focused.log`, `math-dependency-verify.log`, and `math-dependency-package.json`. Earlier scope validation is in the [independent-rendering report](2026-10-09-independent-rendering.md).
