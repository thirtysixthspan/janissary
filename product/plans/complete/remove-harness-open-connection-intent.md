# Remove the unused harness open-connection intent

Issue: `web/src/harness/harness-tab-intents.ts` exposes an `onOpenConnection` member on `AgentTabIntents` and returns it from `harnessTabIntents`, but no harness component consumes it. `HarnessTabLayer` calls the exported `openConnectionRow` helper directly, so the intent is a tested dead path and a second copy of the record-id and tab-ACP routing.

Complexity: 2/10

## Goal

Leave exactly one harness path from a status-panel row to the record RPC: the exported `openConnectionRow` helper that `HarnessTabLayer` already calls. The `AgentTabIntents` contract no longer carries a member no production code uses, and the unit tests still cover the helper's record-id, tab-ACP, and monitor/editor/other-tab behavior directly.

## Approach

- `web/src/harness/harness-tab-intents.ts`: remove `onOpenConnection` from the `AgentTabIntents` type and from the object returned by `harnessTabIntents`. Keep `openConnectionRow` exported unchanged, including its comments and routing.
- `web/src/harness/harness-tab-intents.test.ts`: import `openConnectionRow` alongside `harnessTabIntents`, and rewrite the two tests that invoke `intents.onOpenConnection` to call `openConnectionRow(client, 'agent2', row)` directly. Keep the same expected RPC payloads for the record-id row and the tab-scoped ACP row, and keep the snapshot-only `it.each` cases for monitor, editor, and another tab.
- No changes to `HarnessTabLayer.tsx`, `StatusPanels`, `HarnessTab.tsx`, or the editor path. The helper's signature and behavior stay identical.

## Implementation steps

1. Delete the `onOpenConnection` member from `AgentTabIntents`.
2. Delete the `onOpenConnection` entry from the returned intent object; leave `openConnectionRow` untouched.
3. Update the tests to exercise `openConnectionRow` directly for the record-id, tab-ACP, and non-openable scope cases.
4. Run the focused harness suites, then `$janissary/scripts/run.mjs check-diff`.

## Tests

- `web/src/harness/harness-tab-intents.test.ts`: record-id row sends `openConnectionRecord` with `{ tab, recordId }`; a tab-scoped ACP reference for this tab sends `openConnectionRecord` with `{ tab, acpRef }`; monitor, editor, and another tab's ACP references send nothing.
- Existing intent tests for the metadata actions, collapse, ACP transcript, caller-supplied transcript method, and the no-send-before-invocation contract continue to pass unchanged.

## Out of scope

- `HarnessTabLayer`'s `onOpenRow` wiring, `StatusPanels`, `HarnessTab`, and the editor path.
- Any spec or user-documentation change: the visible behavior is unchanged, and no documented surface changes.

## Specs / docs

None needed — the fix removes an unused internal contract member, with no user-visible behavior or documented flag/command change.
