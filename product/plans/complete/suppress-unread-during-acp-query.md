# Suppress the unread badge while an ACP query is outstanding on a tab

**Complexity: 3/10** — ~6 added lines in one production file, 6 requirements and 6 test scenarios, all in the single existing unread-eligibility gate (p=4.39).

## Goal

The unread badge should not appear on a tab while that tab holds an ACP query which has not yet resolved with a response. The feature text is: "the unread flag should not appear on a tab which an acp query is not yet resolved with a response." A tab waiting on an in-flight `ask`, `tell`, or other role prompt shows its busy dot while the agent works; streaming ACP output and tool-step entries currently also raise the unread badge, so a hidden tab reads as "needs attention" before the response it is waiting for has arrived. The badge should only appear once the query settles and its response lands.

## Requirements

1. "the unread flag should not appear on a tab which an acp query is not yet resolved with a response." While a tab holds an outstanding ACP prompt, every attempt to raise its unread badge is refused and `hasUnread` stays false.
2. The suppression applies to a prompt on any ACP role (`ask`, `tell`, or a custom role), not only the default role.
3. Once the outstanding prompt settles, new content raises the badge again on the next eligible delivery — including the ACP response entry, which is written after settlement.
4. A tab with no outstanding prompt still raises the badge on new content exactly as before.
5. The existing eligibility rules still hold: the active tab, the other pane's visible selection, and docked tabs are never badged.
6. The badge's clearing behavior (dwell, harness going back to work, other-pane reveal) is unchanged.

## Design decisions

- Put the check in `isUnreadEligible` in `src/tab/transcript/events.ts`, the single definition of whether a tab may be badged. `markUnreadTab` already routes through it, so transcript appends (including ACP output), harness busy transitions, and plugin `setUnread` all inherit the rule with one edit. The harness idle-escalation check calls the same function, so it cannot escalate a badge this rule refuses.
- Define "outstanding ACP query" as a `prompt` present on any entry in `tab.runtime.acpRoles`. That is the exact in-flight record `AcpManager.attempt` installs before the tool loop writes output (`src/acp/manager.ts:140`) and that `settleAcpPrompt` deletes once the query resolves (`src/acp/response.ts:91`). It is a positive signal for "not yet resolved with a response", so no new tab state is introduced.
- Read the existing runtime record directly over `Object.values(tab.runtime?.acpRoles ?? {})`; `AcpRoleRuntime` is already reachable through `TabRuntime`'s type, so no new import is needed.
- Do not proactively clear a badge that was raised before a query began. The common case is that the tab is active when the query is sent (so it carries no badge) and receives ACP output only after the user has switched away; the rule therefore acts at raise time. This keeps the change to one gate and leaves dwell/clear choreography untouched.

## Preserved behavior

1. An ordinary inactive tab still gets the unread badge when new content arrives, pinned by `src/tab/transcript/events.test.ts` ("marks a background tab unread").
2. The active tab, the other pane's visible selection, and docked tabs are still never badged, pinned by `src/tab/transcript/events.test.ts` ("leaves the active, secondary, and docked tabs alone").
3. Clearing a badged tab still flips the flag and announces `unread-cleared` once, pinned by `src/tab/transcript/events.test.ts` ("clears a badged tab and announces it once").
4. A command's new entry and its completion still mark an inactive tab unread, pinned by `src/controller.test.ts` ("append to a non-active tab sets hasUnread") and "finishRunning to a non-active tab sets hasUnread".

## Assumptions

1. `AcpManager.attempt` installs `acpRoleRuntime(runtime, role).prompt = request` before the tool loop writes any ACP output (`src/acp/manager.ts:140`).
2. `settleAcpPrompt` deletes `state.prompt` before the final background reply is appended (`src/acp/response.ts:91`), so the response entry is delivered with no outstanding prompt and badges normally.
3. `isUnreadEligible` is the single eligibility gate, called by `markUnreadTab` (`src/tab/transcript/events.ts:98`) and by the harness idle escalation (`src/harness/idle-notification.ts:77`).
4. Core ACP sessions are per tab and per role, so `runtime.acpRoles` is the complete set of queries a tab could be waiting on (`src/acp/role-state.ts:6`).

## Existing functionality

1. `isUnreadEligible` and `markUnreadTab` in `src/tab/transcript/events.ts` are the single badge-raising gate the fix extends.
2. `acpRoleRuntime` in `src/acp/role-state.ts` exposes the per-role runtime record that holds the in-flight prompt.
3. `AcpPendingPrompt` in `src/acp/prompt-state.ts` is the in-flight query record whose presence marks a query unresolved.
4. `makeTab` from `src/tab/index.ts` builds the tab fixtures used by the existing `src/tab/transcript/events.test.ts` suite.

## Implementation steps

1. In `src/tab/transcript/events.ts`, extend `isUnreadEligible` so that, in addition to its current dock/active/secondary checks, it returns false when the tab has any ACP role holding a `prompt` — check `tab.runtime?.acpRoles` for a role whose `prompt` is set. Keep the function pure and the existing checks intact; add a short comment explaining that a tab waiting on an unanswered ACP query must not badge until it resolves. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Leave `markUnreadTab`, `TabTranscriptState`, and every caller unchanged — they already route through `isUnreadEligible`, so transcript ACP output, harness transitions, and plugin `setUnread` inherit the rule without further edits. Verify with `$janissary/scripts/run.mjs check-diff` that no existing test regresses.
3. Update the behavior spec `product/specs/tabs.md` in the Unread badge section so the marking rule states that a tab holding an unresolved ACP query is not eligible for the badge until its response settles. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Update `documentation/user-documentation/getting-started/tabs.md`, whose unread-badge bullet states that new content marks a hidden tab: add that ACP output does not mark while the query is still awaiting a response, and that the flag appears when the response settles. No `help/` page describes this eligibility detail, so none changes. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The unread flag icon in the tab strip is unchanged; only the condition under which it is shown changes.
2. While a tab has an outstanding ACP query, a hidden tab shows only its busy dot, not the flag; once the query settles and its response is written, the flag appears as before.
3. The launcher's unread tier reads the same `hasUnread` flag, so during an outstanding query the tab is not placed in that tier; no launcher code changes.
4. No key binding, CSS, or component changes.

## Tests

1. In `src/tab/transcript/events.test.ts`, add a case under `describe('isUnreadEligible')` that a tab whose `runtime.acpRoles.<role>.prompt` is set is not eligible, and that a tab with an empty/completed ACP role record stays eligible (Requirement 1, 4).
2. Add a case under `describe('markUnreadTab')` that a background tab with an outstanding ACP prompt is not badged and the call returns false (Requirement 1), and that removing the prompt lets a subsequent call badge it (Requirement 3).
3. Add a case that a prompt under the `tell` role (or a custom role) also suppresses the badge, so the check is not limited to `ask` (Requirement 2).
4. Add a case that a tab carrying only persisted ACP record ids (`runtime.acpRecordIds`) with no outstanding prompt still badges, so "resolved" queries are not mistaken for in-flight ones (Requirement 4).
5. The existing `markUnreadTab`/`isUnreadEligible`/`clearUnreadTab` cases stay passing unchanged (Requirements 5, 6).

## Out of scope

- No change to ACP prompt scheduling, settlement, busy tracking, or the busy-dot blink.
- No change to the unread dwell, harness idle escalation timing, or other-pane reveal clearing.
- No new wire/protocol field or client rendering change; `hasUnread` keeps its meaning and shape.
- No proactive clearing of an already-raised badge when a query begins.
- No `help/` changes: no command, flag, key binding, or command page describes this eligibility detail. The one user-documentation page that states the badge-marking rule is updated in place; no new documentation is created.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Manual check against the running app:

1. Focus a tab and run an `ask` (or `tell`) prompt whose turn streams output and tool steps for several seconds. Switch to another tab while the query is still running and watch the first tab in the strip: it should show its busy dot but no unread flag during streaming and tool steps. When the final answer settles and its background reply is written, the unread flag should appear. A failure looks like the flag appearing while the agent is still working, before any response has arrived.
2. Repeat with the target tab visible/active throughout and confirm no badge is raised, matching the existing active-tab rule.
