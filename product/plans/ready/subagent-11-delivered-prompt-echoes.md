# Delivered ACP prompt echo projection
**Complexity: 6/10** — ~180 added production lines including marker extraction, 7 existing files, 32 scenarios (p=6.37)

## Goal

Project a delivered ACP prompt's caller-supplied echo and role through pending-name updates, then write that echo with the caller role's ordinary Thinking marker. Carry the echo through model fallback; ordinary typed prompt views keep neither field.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 11 of 23.

## Decisions and dependencies

Dependency: `product/plans/ready/subagent-10-record-receipt-markers.md` must land first. It owns the role/record receipt union, optional role-arm `echo` in both `src/plugins/shell/shared.ts` and `src/acp/response.ts`, its guard and receipt tests, and record-target marker support. This unit consumes that completed contract and does not edit either receipt definition or guard. Plan 10 creates no marker helper; the extraction below belongs to this unit.

Use one optional string field named `echo` on `PromptResultOptions`, `Attempt`, and `AcpPendingPrompt`. The pending prompt already has an `AcpRole` slot; do not add a second role there or confuse it with configured `roleName`. Echo presence explicitly opts into delivered projection. Neither JSON prompt contents nor the record's name identifies a delivered prompt. The caller supplies the exact line `<caller role> ← subagent:<canonical subagent role> <status>`, such as `tell ← subagent:research completed`; this unit preserves it without parsing or composing it.

Verify this unit through existing `AcpManager.promptResult` options and synthetic pending/background fixtures. It has no dependency on a delivery queue, launcher, or later session-delivery API.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

| Piece | Verified location and reuse |
| --- | --- |
| Metadata and fallback | `src/acp/prompt-state.ts:5,7`, `PromptResultOptions` and `AcpPendingPrompt`; `src/acp/ask-role.ts:87`, `Attempt`; `src/acp/manager.ts:95,110,145`, initial attempt assembly, new request assembly, and the fallback's spread of the same attempt. |
| Record name and pending projection | `src/acp/record-feed.ts:27`, `promptCoreRecord`, assigns the active attempt's record name; `src/tab/background-replies.ts:21`, `pendingAcpReplyNamesFor`, already filters out prompts without replyId or recordName. `src/tab/view.ts:70`, `pendingReplyNameFields`, includes the projection without rebuilding its members. |
| Shared wire contract | `src/protocol/tab.ts:33`, `PendingAcpReplyNameView`, already reaches the client through `src/protocol.ts:132` and `web/src/plugins/api.ts:295`, `onPendingAcpReplyName`. Import the shared type through `@shared/protocol` on the client; add no mirrored wire shape. |
| Existing subscription chain | `web/src/plugins/plugin-client-capabilities.ts:84`, the bound subscription; `web/src/plugins/pending-acp-reply-names.ts:4`, `subscribePendingAcpReplyNames`, forwards each full update on every snapshot; `web/src/plugins/shell/useBackgroundReplies.ts:19`, spreads the full update into `displayReply`. None needs a production edit. |
| Marker and echo flow | `web/src/plugins/shell/useShellReplyWriters.ts:76,93,108,161`, `begin`, `refreshPendingName`, `settle`, and `echoCommand`. Reuse plan 10's role target for delivered prompts and its record target for subagent receipts. |
| Placement and terminal lifetime | `web/src/plugins/shell/reply-placement.ts:13`, `ReplyPlacement`; `web/src/plugins/shell/write-shell-reply.ts:35,54`, `writeShellReply` and `writeShellEcho`; `web/src/plugins/shell/useShellTerminal.ts:199`, fresh marker state on attachment. Preserve their rendering, deferred callback, and lifetime rules. |

## Planned file scope

Edit seven existing production files: `src/protocol/tab.ts`, `src/acp/prompt-state.ts`, `src/acp/ask-role.ts`, `src/acp/manager.ts`, `src/tab/background-replies.ts`, `web/src/plugins/shell/useShellReplyWriters.ts`, and `web/src/plugins/shell/useShellTerminal.ts`. Add `web/src/plugins/shell/reply-markers.ts` for the cohesive marker-state extraction described below.

Extend `src/acp/plugin-session.test.ts`, `src/tab/background-replies.test.ts`, `src/tab/view.test.ts`, `web/src/plugins/background-replies.test.ts`, `web/src/plugins/shell/useBackgroundReplies.test.ts`, `web/src/plugins/shell/useShellReplyWriters.test.ts`, and `web/src/plugins/shell/ShellTab.test.tsx`. Update `product/specs/shell-tab.md` and `product/specs/acp.md`. No new test module or plugin API change is needed.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Add optional `echo` to the three internal types and carry it from options to the initial attempt and from every attempt to its pending request. Test definedness rather than truthiness so an explicitly supplied empty string is preserved, matching plan 10's receipt contract. Keep `replyId` unchanged across fallback; the existing spread in `settleAttempt` retains echo while the next request takes its own record name. No echo metadata is persisted on the role runtime or session after settlement.

2. Add optional `role` typed as the existing `AcpRole` and optional string `echo` to `PendingAcpReplyNameView`. In `pendingAcpReplyNamesFor`, retain the replyId/recordName gate and include both role and echo only when the pending request's echo is defined. Read the role from that request, not from its display name. A typed prompt remains exactly id/name, with neither extra key present; an echo without a replyId or without a recordName still projects nothing. Import these server wire types directly from `../protocol/tab.js`. `pendingReplyNameFields`, the client capability, and both subscription adapters already preserve the fields unchanged.

3. Extract the marker state, types, and cohesive helper group from `useShellReplyWriters.ts` into `reply-markers.ts`: `Entry`, plan 10's `MarkerTarget`, `Settlement`, `ReplyMarkers`, `Opening`, `Draw`, `createReplyMarkers`, `begin`, `clearPendingName`, `refreshPendingName`, `runningView`, `linkView`, `drawEcho`, `drawLink`, and `settle`. Keep internal helpers private; export only helpers/types consumed by the writer and `createReplyMarkers` used by the terminal. Move the pending-update type there and derive it from shared `PendingAcpReplyNameView` plus the local pending discriminator. Use shared `BackgroundReplyView` for settled shapes. The module has no React runtime dependency: `Opening` exposes current-label and open-connection callbacks, supplied by the hook's existing refs, so a later label/callback change is still observed when a marker is clicked. Keep hooks, terminal text writes, and `ShellReplyOutcome` in `useShellReplyWriters.ts`. Import marker helpers/types directly from `./reply-markers` in the writer; move `createReplyMarkers` imports in `useShellTerminal.ts` and `useShellReplyWriters.test.ts` to that same defining module. Leave the other `ShellReplyOutcome` importers unchanged; add no re-export from the old module.

4. In the writer's pending branch, refresh/cache the pending name as today. When both role and echo are defined, the id has no marker entry, and the shared settled-reply id set does not contain it, pass a role receipt with that id/name/role/echo and the exact echo text through the existing `echoCommand` path. Define that callback before `displayReply` and include it in the latter's dependencies. Do not call the background Markdown writer for a pending update. This uses the same `begin`, `writeShellEcho`, placement, and Thinking-decoration behavior as a typed prompt. If no terminal is attached, start no entry or write; a later replay may start it after attachment. A missing role or echo only refreshes/caches a name and never starts an echo.

5. Deduplicate pending echoes before calling `echoCommand`, because `begin` alone prevents a second marker but still permits a second text echo. Repeated snapshots for an existing entry only refresh its name; they never change its target or echo again, even when fallback changes the name or update metadata differs. An existing typed entry with the same id also stays one entry. A settled id ignores later pending updates, including an update that arrives after its background reply. Do not add pending ids to the settled-reply set; their later answer still has to render.

6. Settle delivered entries through the unchanged background-reply path. A live marker opens the caller role's current connection through its acpRef, following fallback; a settled marker opens the answering caller record, not the subagent's record. A recordless failure/refusal removes the marker. Preserve reply placement beneath the initial echo or beneath a repeated echo after intervening output, links on both echoes, late xterm callbacks, alternate-buffer behavior, and plan 10's record-receipt behavior. Marker entries stay terminal-local and are replaced on attachment; already settled ids retain the existing replay suppression. Update the Core ACP connections section in `product/specs/shell-tab.md:628` and the Answers, activity, and questions section in `product/specs/acp.md:63` with the supplied delivered echo, caller-role targeting, fallback, and ordinary typed-view distinction. Describe projection and rendering only, without claiming a queue or delivery producer exists in this unit.

7. Respect the measured ESLint budgets: protocol/tab.ts has 70 counted lines, prompt-state.ts 19, ask-role.ts 86, manager.ts 192, background-replies.ts 21, useShellReplyWriters.ts 152, and useShellTerminal.ts 192. Plan 10 budgets roughly 23 more writer lines and caps it below 185; this unit therefore performs the extraction unconditionally before adding delivered-pending behavior. Budget the extracted module around 140 counted lines and the remaining hook below 100. The terminal gains only a direct import, and the manager gains only two metadata-forwarding lines. Both remain below 200. Do not compact code, split shared definitions across client copies, or expand the manager with delivery orchestration.

## Tests

Cover the following test groups using existing fixtures; parameterize role/status spellings rather than requiring later delivery code:

1. In `src/tab/background-replies.test.ts`, a delivered pending request projects id/name/role/echo for each role, preserving the supplied text and choosing `prompt.role` even when `roleName` differs.
2. An explicit empty echo remains present in the internal request and pending view.
3. A typed request projects only id/name, with both role and echo keys absent.
4. A request without replyId projects nothing.
5. A request without recordName projects nothing; no runtime or no prompt also remains empty.
6. In `src/acp/plugin-session.test.ts:411`, extend the fallback pattern through a direct `promptResult` fixture with replyId/echo options. Observe both attempts' pending projection, a changed record/name after fallback, the same id/role/echo, and the final answering record. Retain ordinary dispatch's exact id/name pending view at line 568 and its unchanged receipt shape.
7. In `src/tab/view.test.ts:116`, extend `projects pending ACP record names separately from completed replies` to prove delivered fields survive `buildTabView` and do not become completed replies.
8. In `web/src/plugins/background-replies.test.ts:18`, pass extended pending views through the real bound subscription, retaining tab isolation and listener cleanup.
9. In `web/src/plugins/shell/useBackgroundReplies.test.ts:67`, assert full role/echo forwarding without entering the settled id set, then the later reply renders once and stale pending updates are ignored. Keep `useBackgroundReplies.ts` unchanged.
10. In `web/src/plugins/shell/useShellReplyWriters.test.ts:254`, an unseen delivered update writes the exact echo once with a Thinking marker whose running click opens the supplied caller role. Exercise both roles and started/completion echo spellings without parsing their text.
11. Duplicate pending snapshots write no second echo or marker.
12. A fallback/name-only refresh updates the tooltip/name while retaining the original role target and one echo, including with a delayed marker callback.
13. Pending updates for an existing typed entry only refresh that entry; they never echo a second line or retarget it.
14. A pending update missing role or echo caches the name without writing, then a complete update for that same id starts one echo using the latest name.
15. An update before terminal attachment creates no entry; replay after attachment writes one echo.
16. A background reply received before the pending update suppresses the late pending echo and marker through the shared seen ids.
17. A delivered reply settles in place under its echo and opens the answering caller record; a late xterm marker callback draws the settled link directly.
18. After intervening shell output, a delivered reply repeats the exact echo and both original and repeated markers link to its answering record.
19. A delivered reply without a record removes the marker; a late xterm callback draws nothing. Retain existing alternate-buffer, reattachment, current callback/label, and plan 10 record-target regressions through the extraction.
20. In `web/src/plugins/shell/ShellTab.test.tsx:1161`, extend the existing marker integration fixture with an `onPendingAcpReplyName` override in `renderTab`. Emit a synthetic pending update without submitting a command, check the rendered echo and `Open <caller connection name>` Thinking link while the bar remains usable, then emit its background reply and verify the settled caller-record click. Assert no command dispatch was needed.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Inject a `tell` pending-name update for a fresh reply id with `tell ← subagent:research completed`, then repeat it and change its record name. Confirm one echo, one Thinking marker with the refreshed caller name, and a working command bar. Add unrelated terminal output, inject the same id's reply with an answering caller record, and check both echo links open that record. Deliver the pending update again after settlement and confirm no new output. Repeat with a typed id/name-only view and confirm it starts no echo. Use existing fixtures; do not call a future delivery API.

## Out of scope

No delivery producer or queue, session-bound delivery policy, new push message or plugin capability, session reset behavior, subagent launcher, receipt/guard changes, or durable record naming/storage changes. Plan 10's optional role receipt echo is consumed as supplied.
