# Reconcile the connections spec's editor-row close-control claim

**Complexity: 1/10** — one prose paragraph in one spec file, 7 acceptance requirements, no production code and no added tests (p=3.04).

## Goal

`product/specs/connection.md`'s editor-tab paragraph says a persona query's core connection is closed through "that core row's ordinary control," implying the editor tab's connections window offers a close control. The delivered editor window is read-only: `web/src/editor/EditorConnectionsPanel.tsx` passes no `onCloseRow` or `canCloseRow` to `StatusPanels`, and `ConnectionRow` renders a close control only when `onCloseRow` is supplied. A reader following the spec looks for a control that does not exist. The goal is to correct that one paragraph so it names the command path and the other surfaces that do offer a close control, and explains that the editor window is deliberately read-only, without touching code, tests, or the pull-request description.

## Requirements

1. The editor-tab paragraph states that the editor tab's connections window is read-only and renders no close control on any row. From the entry's Proposal: "state that the editor tab's connections window is read-only: it renders no close control for any row".
2. The paragraph cites the removal of `onCloseRow` and `canCloseRow` from `web/src/editor/EditorConnectionsPanel.tsx` and `web/src/editor/useEditorConnections.ts` as the reason. From the entry's Proposal: "because onCloseRow and canCloseRow were removed from web/src/editor/EditorConnectionsPanel.tsx and web/src/editor/useEditorConnections.ts".
3. The paragraph states a persona query's core session is closed through `connections close acp:<role>:<provider/model>`. From the entry's Proposal: "State that a persona query's core session is closed through the `connections close acp:<role>:<provider/model>` command".
4. The paragraph states the alternative close path is the close control a core row has on surfaces that render one, such as the connections tab, rather than a control in the editor's own window. From the entry's Proposal: "or through the close control a core row has on surfaces that render one such as the connections tab, rather than through a control in the editor's own window".
5. The paragraph keeps the statement that no `<persona> (acp)` row is produced. From the entry's Proposal: "Keep the surrounding statements that no `<persona> (acp)` row is produced".
6. The paragraph keeps the statement that there is no persona-specific close control. From the entry's Proposal: "and there is no persona-specific close control".
7. Only that paragraph of `product/specs/connection.md` changes; code, tests, help pages, other specs, and the pull-request description stay untouched, and no new test is added. From the entry's Proposal: "edit ONLY the editor-tab paragraph beginning 'An editor tab carries the same connections button and window'" and "Leave code, tests, and the pull request description untouched. No new test needed for prose."

## Design decisions

- Change only the one editor-tab paragraph in `product/specs/connection.md`; this is a prose reconciliation, so no source, test, help page, or documentation-tree file is edited.
- Replace the "closed through that core row's ordinary control" claim with the command path and the on-other-surfaces close control, and explain the editor window is read-only because the two callbacks were removed.
- Verify the read-only claim before editing: `web/src/shared/status-windows/StatusPanels.tsx:44` computes `closeRow` only when `onCloseRow` is supplied, and `web/src/editor/EditorConnectionsPanel.tsx:12-20` supplies no `onCloseRow` or `canCloseRow`.
- Verify the "other surface" claim: `product/specs/connections-tab.md:21` describes a row close control on the connections tab, so naming it as a surface that renders a core-row close control is accurate.
- Keep every other sentence of the paragraph, including the running-agent row, monitor rows, browser/terminal/SQLite rows, and the persona notification wording.
- Leave the pull-request description byte-for-byte as the author wrote it; it was already corrected for this same issue.
- Leave the pull request open; never merge, close, or replace it.

## Preserved behavior

None found. The change edits functional-spec prose only; no application behavior is touched.

## Assumptions

1. Pull request 2185 is OPEN with head branch `feat/ai-personas-role-acp-pipeline` — `gh pr view 2185 --json number,state,headRefName,url` returned `"state":"OPEN"`.
2. `product/specs/connection.md:67` is the editor-tab paragraph named by the entry and contains the stale "that core row's ordinary control" claim.
3. `web/src/shared/status-windows/StatusPanels.tsx:44` — `const closeRow = onCloseRow !== undefined && (canCloseRow === undefined || canCloseRow(row)) ? onCloseRow : undefined;` — proves no close control renders without `onCloseRow`.
4. `web/src/editor/EditorConnectionsPanel.tsx:12-20` passes `onOpenAcpTranscript` and `onOpenRow` but no `onCloseRow`/`canCloseRow`, and `web/src/editor/useEditorConnections.ts:10-36` exports no close callbacks.
5. `product/specs/connections-tab.md:21` — "An open ACP row's control closes its session" — confirms the connections tab renders a close control for a core row.
6. The entry is recorded in `./product/backlog/pull-request.md` as the lead bullet, one other entry remains and must be preserved byte-for-byte, and the complexity-7 cutoff is overridden for this entry.

## Existing functionality

1. `StatusPanels`/`ConnectionRow` close-control gating at `web/src/shared/status-windows/StatusPanels.tsx:44,71` provides the mechanism the spec claim is reconciled with.
2. The editor panel's callback-less `StatusPanels` invocation at `web/src/editor/EditorConnectionsPanel.tsx:12-20` and the editor hook at `web/src/editor/useEditorConnections.ts:10-36` are the files named by the entry.
3. The connections tab's row close control documented at `product/specs/connections-tab.md:21` is the "other surface" the corrected sentence names.
4. The backlog entry's `Proposal` in `./product/backlog/pull-request.md` supplies the authorized wording and proof anchors.
5. `$janissary/scripts/run.mjs check-diff` is the available diff-scoped verification command.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then rated, then ready, then complete) with its complexity line; no application code is involved. Run `$janissary/scripts/run.mjs check-diff` after recording it.
2. Edit only the editor-tab paragraph in `product/specs/connection.md`: replace "a persona query's connection is closed through that core row's ordinary control, the same as running `connections close acp:<role>:<provider/model>`, which resolves that role from the roles file" with wording that states the window is read-only because `onCloseRow` and `canCloseRow` were removed from the two editor files, and that the core session is closed through `connections close acp:<role>:<provider/model>` or the close control a core row has on surfaces that render one such as the connections tab, not through a control in the editor's own window. Keep the no-`<persona> (acp)`-row and no-persona-specific-close-control statements and every other sentence of the paragraph. Run `$janissary/scripts/run.mjs check-diff` after the edit.
3. Remove the resolved entry whole from `./product/backlog/pull-request.md`, from its lead `*` bullet through its `Proposal` paragraph and separating blank lines, leaving the remaining entry byte-for-byte unchanged and not restoring the comment-and-heading skeleton. Run `$janissary/scripts/run.mjs check-diff` after the edit.
4. Commit the plan and backlog change to the recorded head branch with `$janissary/scripts/run.mjs pr-commit` and push with `git push`, then confirm the pull request is still OPEN and its `headRefOid` matches `git rev-parse HEAD`.

## UI design

None. This is a functional-spec prose correction; it changes no command, flag, key binding, or user interface.

## Tests

No new tests. The fix changes only prose in `product/specs/connection.md`, adds no code, and changes no application behavior, so there is nothing to test. The existing close-control tests in `web/src/shared/status-windows/StatusPanels.test.tsx` are left untouched and must keep passing.

## Out of scope

- Editing any source file, test, help page, or the `documentation/user-documentation/` and `documentation/developer-documentation/` trees.
- Editing any other paragraph in `product/specs/connection.md` or any other product spec.
- Changing the pull request title or description; the description was already corrected for this same issue and must stay byte-for-byte as the author wrote it.
- Restoring the backlog skeleton — one entry remains after this one is removed.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` after each editing step — expected to exit 0 with no lint, typecheck, or test regression, since only markdown changed.

Then, concrete read-based checks: re-read the editor-tab paragraph in `product/specs/connection.md` and confirm it states the editor connections window is read-only with no close control on any row because `onCloseRow` and `canCloseRow` were removed from the two editor files, names `connections close acp:<role>:<provider/model>` and a core row's close control on surfaces that render one such as the connections tab as the close paths, and still says no `<persona> (acp)` row and no persona-specific close control exist. Confirm the stale "that core row's ordinary control" wording is gone from that paragraph and that every other sentence of the paragraph and every other spec file is unchanged. Read `web/src/shared/status-windows/StatusPanels.tsx:44` and `web/src/editor/EditorConnectionsPanel.tsx:12-20` and confirm the prose matches the code. Read `./product/backlog/pull-request.md` and confirm the resolved entry is gone while the remaining one is byte-for-byte intact. Finally `gh pr view 2185 --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
