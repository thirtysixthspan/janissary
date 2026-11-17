# Partial agent run outcomes
**Complexity: 6/10** — ~28 added production lines, 9 existing files, 8 requirements, 20 scenarios (p=5.97)

## Goal

Add `partial` to `AgentOutcome` and `Partial` to run view, record outcome, record-row status, connection status and guard lists. Map partial in both terminal status lock and finish paths; it must never fall through to Terminated. Accept Partial for agent records.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 4 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-3-record-naming.md`, which supplies validated `subagentRole` metadata and depends on the subagent spec created by plan 1. No executor, delivery or public command from a later unit is required.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

`AgentRun.setStatus` and `finish` at `src/agent/run.ts:101,167` already protect the first terminal outcome and share one cleanup promise. `AgentRecordFeed.finish` at `src/agent/record-feed.ts:30` owns record answer text and closure. `AcpRecordRow.status` at `src/acp-records/types.ts:58` and `ConnectionsTopicRecordFields.status` at `src/protocol/connections.ts:40` already derive from the record outcome type; `recordStatus` at `src/acp-records/model.ts:20` returns a stored outcome unchanged. `OPEN_STATUSES` at `src/plugins/connections-topic-rows.ts:38` makes every status except Open/Running/Idle closed. The connection tab's ended set at `web/src/plugins/connections/ConnectionTab.tsx:26` calls `recordUpdated`, which clears pending termination state in `web/src/plugins/connections/useConnectionsController.ts:42`; it does not control polling. The existing monitor consumes the same `AgentRunView` and has its own termination-disabled set at `web/src/plugins/agent-monitor/view.tsx:26`.

## Planned file scope

Edit `src/agent/run.ts`, `src/agent/types.ts`, `src/agent/record-feed.ts`, `src/acp-records/types.ts`, `src/acp-records/validation.ts`, `src/plugins/connections/shared.ts`, `web/src/plugins/connections/ConnectionTab.tsx`, `web/src/plugins/connections/connections.css`, `web/src/plugins/agent-monitor/view.tsx`; extend `src/agent/record-feed.test.ts`, `src/agent/manager.test.ts`, `src/acp-records/model.test.ts`, `src/acp-records/manager.test.ts`, `src/acp-records/validation.test.ts`, `src/plugins/connections/shared.test.ts`, `src/plugins/connections-topic-rows.test.ts`, `web/src/plugins/connections/ConnectionTab.test.tsx`, `web/src/plugins/connections/ConnectionList.test.tsx`, `web/src/plugins/connections/connections-style.test.ts`, `web/src/plugins/agent-monitor/view.test.tsx`; update `product/specs/acp-records.md`, `product/specs/connections-tab.md` and status vocabulary in `product/specs/subagent.md`.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add `partial` to `AgentOutcome`, `Partial` to `AgentRunView.status` and `AcpRecordOutcome`, and `Partial` to the import-free connections shared module's `ConnectionStatus` and `statuses` validator list. `AcpRecordRow.status`, protocol event/tab views and connections topic types inherit the value from their existing shared types; do not introduce mirrored unions or new runtime validators. Extend `isRecordOutcome` at `src/acp-records/validation.ts:29` to accept Partial for agent sources only, preserving core records' Closed-only rule and all previous outcomes. Keep record schema version 1 and connections payload schema version 2; old records remain valid without migration.

2. Map partial to Partial in both `AgentRun.setStatus`'s terminal lock and `AgentRun.finish`'s final view, and in `AgentRecordFeed.finish`'s record closure. Preserve the supplied answer verbatim, including an empty string; add no stopped-after suffix or invented failure text. Partial is terminal like completed: it owns the first outcome and cleanup promise, does not abort the run's controller as terminated does, and rejects later attempts to change its terminal status. A later finish, reentrant listener or cleanup error cannot replace its outcome or captured answer. The existing `settleAgentRun` and manager outcome-truthiness paths already cover it without production edits.

3. Capture whether the record belongs to a subagent from the validated constructor metadata supplied by plan 3, inside `AgentRecordFeed`; its constructor currently does not retain metadata after beginning the record. Use that captured fact for the terminated answer: `Subagent terminated.` for a subagent and `Agent terminated.` for an ordinary agent, regardless of a prior response. Preserve the existing failed/completed text rules. A termination before any prompt still leaves a terminal header with no fabricated block. Do not query records or read roles to rediscover the metadata.

4. Treat Partial as ended in `ConnectionTab`'s `recordUpdated` call so a terminal update clears pending termination. Existing `ConnectionTabMeta` at `web/src/plugins/connections/ConnectionTabMeta.tsx:27` offers Terminate only for Running agent records, so Partial needs no new control branch and keeps Focus tab while its owner exists. Add Partial to both the connections CSS closed-group spacing selector and muted row selector. Preserve server open/closed sorting and wide/docked spacing through tests; `OPEN_STATUSES` already supplies the correct ordering without a production edit.

5. Add Partial to the existing agent-monitor view's termination-disabled set because the shared `AgentRunView` now permits it. This is compatibility for a terminal shared projection, verified with a view fixture only; it adds no subagent monitor launch or binding. Other searched consumers use the shared view type or outcome truthiness and require no production edits. All nine production files remain below 200 counted lines; add the status branches without compacting existing code or extracting an otherwise unnecessary status framework.

## Tests

Extend the existing table cases in `src/agent/record-feed.test.ts:49` for partial with verbatim and empty answers, subagent versus ordinary-agent terminated wording, and termination before a prompt. Use that file's existing `AgentRun` fixture for first-outcome/reentrant finish, terminal-status lock and cleanup-error preservation; use `src/agent/manager.test.ts:90` for manager settlement and one cleanup after partial. No public subagent command is needed.

Extend record-model terminal precedence tests in `src/acp-records/model.test.ts:18` and the agent close/persistence fixtures in `src/acp-records/manager.test.ts:130`. Verify Partial agent acceptance, core rejection, unchanged existing outcomes, stored Partial reload without recovery to Terminated, and row/window status preservation. Add the same source/outcome cases to the focused validation tests created by plan 3. Extend connections shared guard tests for Partial rows and `src/plugins/connections-topic-rows.test.ts` for closed ordering after live/Running/Idle rows.

Add Partial to the terminal agent cases in `web/src/plugins/connections/ConnectionTab.test.tsx:237` and verify the ended notification clears pending termination, with no Terminate control and preserved Focus tab. Parameterize the existing closed-row cases in `ConnectionList.test.tsx` and the muted/spacing assertions in `connections-style.test.ts:136` so Partial is closed in both wide and docked layouts. Extend `web/src/plugins/agent-monitor/view.test.tsx:29` with a Partial fixture that displays the status and disables Terminate; it must not create a monitor for a subagent.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Create a manager-owned synthetic run with subagent metadata, an existing prompt and an exact answer, then finish it partial. Inspect its retained connection row and opened connection tab beside Running and Completed fixtures: Partial appears in the closed group with the existing muted treatment, its answer is unchanged and Terminate is absent. Use the existing monitor view fixture only to confirm its shared terminal-state compatibility. The public subagent command remains unwired.

## Out of scope

No turn-cap implementation, completion delivery or changes to ordinary agent execution's accepted success/failure semantics. Do not add an agent-monitor tab or launch path for subagents; the monitor edit only handles the widened shared status type.
