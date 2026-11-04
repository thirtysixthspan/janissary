# Correct the editor connections window's record-opening spec sentence

## Complexity

1/10 — one spec sentence in one paragraph; no code, tests, or other specs change.

## Goal

`product/specs/connection.md`'s editor connections window paragraph says "Any other row in that window, including a running agent row, carries no close control there: pressing it opens its record tab". That claims every non-persona row opens a record tab, but only a row with a durable record or the tab's own live ACP reference can. Narrow the sentence so it describes the running agent row, which really does open its record tab, without claiming monitor, browser, terminal, or SQLite rows do.

## Approach

`StatusPanels.rowCanOpen` returns true only when the row has a `recordId` or a tab-scoped `acpRef`. `useEditorConnections.openRow` sends `openConnectionRecord` for a record id, and for a tab-scoped reference only when its label is the editor tab's own; everything else returns without sending. A monitor row has a monitor-scoped reference, browser, terminal, and SQLite rows have neither a record nor a reference, so they stay non-openable. Persona rows stay closeable through `canCloseRow`, and a running agent row carries a `recordId` but no close control.

In the editor paragraph of `product/specs/connection.md`, replace the broad sentence with a narrower one that says a running agent row carries no close control and pressing it opens its record tab, where the run's **Terminate** remains its control, while monitor rows remain snapshot-only and browser, terminal, and SQLite rows cannot be opened. Leave the paragraph's earlier persona-close rule and its closing persona lifecycle sentence unchanged, and leave the preceding paragraph's durable-record, tab-scoped ACP, and monitor/editor-persona rules untouched.

## Implementation

1. Edit the one sentence in `product/specs/connection.md`.
2. Run `./scripts/run.mjs check-diff`.

## Tests

None — no code changed. `web/src/shared/status-windows/StatusPanels.test.tsx` and `web/src/editor/useEditorConnections.test.ts` already pin the behavior the spec now describes.

## Spec

`product/specs/connection.md` — editor connections window paragraph corrected to distinguish the openable running agent row from snapshot-only monitor rows and non-openable browser, terminal, and SQLite rows.

## Docs

None needed: `documentation/user-documentation/command-bar/connections.md` already says monitor and editor-persona rows do not open a record tab, and that a running agent row has no × there.

## Out of scope

- Any change to `StatusPanels`, `useEditorConnections`, or their tests; the behavior is already correct.
- `product/specs/connections-tab.md`, `acp-records.md`, or any other spec.
- The pull request's title and body.
