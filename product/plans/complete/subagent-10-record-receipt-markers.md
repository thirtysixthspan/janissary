# Shell markers for durable run receipts
**Complexity: 6/10** — ~50 added production lines, 4 existing files, 8 requirements, 26 scenarios (p=5.90)

## Goal

Widen both receipt contracts to the same union: a role receipt with optional echo metadata, and a record receipt with replyId, kind:'record', recordId and name. Guard both variants and render a durable record's running and settled shell markers through the existing connection path. Ordinary ask/tell receipts keep their current emitted wire shape.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 10 of 23.

## Decisions and dependencies

Dependency: `product/plans/ready/subagent-3-record-naming.md`, which supplies the durable subagent record's `subagent:<canonical role>` name. Verify this unit with synthetic receipts and background replies; it needs no launch command or later delivery API. This unit owns optional `echo` on the role arm in both receipt definitions and its guard/tests; plan 11 consumes that contract when it adds delivered-prompt projection.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

| Piece | Verified location and reuse |
| --- | --- |
| Receipt twins and guard | `src/plugins/shell/shared.ts:103,229`, `ShellAcpReceipt` and `isShellAcpReceipt`; `src/acp/response.ts:13`, `AcpDispatchReceipt`. The shared module remains import-free, and `src/plugins/shell/shared.test.ts:230` already pins bidirectional assignability. |
| Receipt handoff | `web/src/plugins/shell/useShellSubmit.ts:99`, `isShellAcpReceipt`, passes a validated receipt unchanged to `echoCommand` for both direct and queued dispatch. `web/src/plugins/shell/useShellTerminal.ts:68` already imports its receipt type. Neither needs a production edit. |
| Marker state and targeting | `web/src/plugins/shell/useShellReplyWriters.ts:22,42,76,108`, `Entry`, `runningView`, `begin`, and `settle`. `linkView` at line 55 already opens a durable record by id. |
| Placement, rendering and lifetime | `web/src/plugins/shell/reply-placement.ts:13`, `ReplyPlacement`; `web/src/plugins/shell/thinking-marker-decoration.ts:94`, `addThinkingMarker`; `web/src/plugins/shell/useShellTerminal.ts:199`, fresh `createReplyMarkers` on attachment. Reuse their behavior without a second renderer or persistent marker store. |
| Background projection | `src/tab/background-replies.ts:7,9`, `ACP_INPUT` and `backgroundRepliesFor`; `web/src/plugins/shell/useBackgroundReplies.ts:17` falls back to `monitor` when a reply has no line. |

## Planned file scope

Edit exactly four production files: `src/plugins/shell/shared.ts`, `src/acp/response.ts`, `web/src/plugins/shell/useShellReplyWriters.ts`, and `src/tab/background-replies.ts`. Extend `src/plugins/shell/shared.test.ts`, `src/acp/plugin-session.test.ts`, `web/src/plugins/shell/useShellReplyWriters.test.ts`, `web/src/plugins/shell/ShellTab.test.tsx`, and `src/tab/background-replies.test.ts`; update `product/specs/shell-tab.md`. Reuse the existing ask/tell command tests without changing their common-field receipt fixtures. Add no production or test module in this unit.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Widen `ShellAcpReceipt` in `src/plugins/shell/shared.ts` and `AcpDispatchReceipt` in `src/acp/response.ts` together. Their role arm has replyId, role, name, optional string `echo`, and no defined kind or recordId. Their record arm has replyId, kind:'record', recordId, name, and no defined role or echo. Keep the existing exported union names and the server's existing `AcpRole` type. `runAcpCommand` continues emitting only replyId, role and name; accepting optional echo here does not start delivered prompts or change typed echo text.

2. Extend the import-free `isShellAcpReceipt` guard to validate both arms. Preserve string-only validation of replyId/name, including existing empty-string acceptance, and allow unrelated extra fields as today. Require a string recordId on the record arm and allow absent or string echo on the role arm, including an empty echo string. Reject arrays/null, missing or mistyped required fields, unsupported kinds/roles, non-string echo, and mixtures of the two arms' reserved fields. Pin both union arms and role echo assignability in both directions in shared.test.ts; do not import the server contract into the runtime shared module or bump the shell payload schema for a dispatch result.

3. Replace `Entry.role` with a single private `MarkerTarget` union holding either the role slot or a durable record id. Narrow each receipt before reading its arm-specific fields in `begin`, and derive role-only helper types from that arm rather than indexing `ShellAcpReceipt['role']`. In `runningView`, a record target opens an ACP connection row with its recordId and no acpRef; it works without a shell label and never follows a role fallback or a later shell rename. The role target retains the current tab-label/acpRef path. Name refreshes change the label without changing either target. Keep settled targeting in the existing `linkView`/`backgroundRecord` flow.

4. Widen `ACP_INPUT` to recognize leading `subagent` with the existing optional slash, whitespace, case-insensitivity and word-boundary behavior. Preserve the exact input on both projected replies, including the existing boundary behavior before a hyphen; nested `monitor subagent` and longer words such as `subagents` keep no line. A started fixture uses a fresh background id with no record, so existing id-based settlement leaves the launch marker Thinking. A completion fixture uses the receipt id and the durable record/name, converting the original marker and adding the same link to a repeated echo. Do not add a special started state or settle by command text. Reply creation belongs to the later launcher unit; this unit tests its contract through fixtures.

5. Audit all receipt consumers for union-safe access. Narrow the helper role parameter in `web/src/plugins/shell/useShellReplyWriters.test.ts:73` and the role read in `src/acp/plugin-session.test.ts:406`; an assertion that the entire value is a receipt does not narrow its arm. `src/commands/ask.test.ts` and `src/commands/tell.test.ts` read only common fields and already assert the exact ordinary role-receipt shape. Other plugin-session receipt reads are common-field accesses. The imported receipt signatures in useShellSubmit/useShellTerminal remain valid without a new local type or cast.

6. Preserve one-cell-after-echo positioning, spinner, `see thought process`, `Open <connection name>` tooltip/accessibility, newest history, alternate-buffer hiding, and loss of decorations on reload/dock/undock. A refusal without a receipt draws no marker. Reuse existing id deduplication, early-reply and delayed-xterm-callback handling, terminal-local handles, pending-name refresh and shared seen-reply ids; the two-reply subagent fixture exercises these paths without changing their lifetime policy. Update the Core ACP connections section in `product/specs/shell-tab.md:628` with record targeting and started/completion placement; delivered-prompt echo rendering remains plan 11's spec change.

7. Respect the measured ESLint budgets: shared.ts has 158 counted lines, response.ts 87, background-replies.ts 21, and useShellReplyWriters.ts 152. Budget about 20, 7, 0 and 23 added production lines respectively, leaving all four below 200 without extraction. In particular, useShellTerminal.ts already has 192 counted lines and needs no changes. Keep the marker writer below 185 counted lines to leave room for the next unit's pending-echo work; do not create the formerly optional reply-markers.ts or move imports speculatively.

## Tests

In `src/plugins/shell/shared.test.ts:200`, cover legacy ask/tell arms, optional string/empty/absent role echo, valid record receipts, malformed base fields, missing/mistyped recordId, invalid kinds/roles, invalid echo, mixed reserved fields, unrelated extra fields, and legacy empty strings. Extend the existing bidirectional twin-assignability fixtures for both arms and role echo. In `src/acp/plugin-session.test.ts`, narrow before the live-role connection read and retain existing dispatch, rename, fallback and settled-record assertions. Existing ask/tell command tests continue pinning unchanged emitted receipts.

Extend `web/src/plugins/shell/useShellReplyWriters.test.ts` with a record receipt that opens the same durable id while running and settled, including no label and a renamed shell; fresh-id started then receipt-id completion; completion without a started reply; concurrent same-line/same-name runs settled independently; and original/repeated echo links. Reuse the existing early-reply, duplicate receipt/reply, no-record refusal, pending-name, delayed callback, alternate-buffer and terminal-reattachment regressions for the record arm where targeting matters. Keep existing role targeting and fallback behavior covered. In `web/src/plugins/shell/ShellTab.test.tsx:1161`, extend the actual dispatch/background-reply fixture with a record result, started and completion replies, rendered tooltip/accessibility and click targets; this verifies useShellSubmit's guard handoff and the existing renderer together, including a missing/malformed receipt drawing no marker.

In `src/tab/background-replies.test.ts`, cover exact subagent lines with slash/case/leading whitespace and the word boundary, rejection of nested/longer tokens, and both started-without-record and completion-with-record projections. Keep ordinary ask/tell and monitor projections unchanged. No launcher, public subagent command, or delivered pending-name API is needed to run these tests.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Drive the existing ShellTab fixture with a synthetic record receipt for `subagent --role research --task task.md`. Click Thinking, inject a fresh-id started reply with no record, confirm Thinking remains and the bar stays usable, then inject the receipt-id completion with that durable record. Click both resulting links and confirm each opens the same record at newest history. Repeat with the completion arriving before its receipt and confirm no marker appears. Reattach the terminal and confirm decorations are cleared and previously seen replies are not written again. Run the existing ask/tell receipt cases alongside this check.

## Out of scope

No launch command or reply production, delivery queue, pending-name role/echo projection, delivered echo rendering, new push/capability, record storage/naming changes, or additional UI surface. Optional role-receipt echo type/guard support is included here for plan 11; delivery behavior is not.
