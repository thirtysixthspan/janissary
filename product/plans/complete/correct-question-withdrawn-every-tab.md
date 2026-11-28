# docs(notifications): correct the spec's question-withdrawn entry to cover every tab

**Complexity: 1/10** — no production lines or files, 5 requirements, no test scenarios (p=2.84)

## Goal

The `question-withdrawn` entry in `product/specs/notifications.md` opens by saying the line appears when "a question asked by an agent in a background tab is withdrawn before it is answered". The executor doesn't check which tab is active. It records the withdrawal for any MCP question whose caller abandons it, and the same entry later says the line is recorded even while that tab is active. So the entry states two rules that disagree. A later change that followed the first one could add a background-only check and quietly drop withdrawal notices for the tab the user is watching. This plan rewrites the opening sentence so it says what the code does: the line is recorded when the caller of a pending MCP question, local or relayed from a remote harness, abandons it before it's answered, on whichever tab it was asked.

## Requirements

1. The entry's first sentence no longer limits the event to a background tab, per the issue "says it only covers questions on background tabs".
2. The first sentence says the line is recorded when the caller of a pending MCP question abandons it before it is answered, per the proposal "say it is recorded when the caller of a pending MCP question ... abandons it before it is answered".
3. The first sentence covers a question relayed from a remote harness as well as a local one, per the proposal "local or relayed from a remote harness".
4. The first sentence says this holds on whichever tab the question was asked, per the proposal "on whichever tab it was asked".
5. The rest of the entry stays verbatim, per the proposal "keep the rest of the entry, including the answered-or-cancelled exception, the no-toggle rule and the `warning` cue, unchanged".

## Design decisions

- Only `product/specs/notifications.md` changes. The executor, the notification classification and the tests already behave the way the corrected sentence describes (Assumptions 1, 2 and 3), and the proposal says "No code or test changes".
- The sentence's cross-reference moves from [[agent-questions]] to [[mcp-server]]. The withdrawal rules live in the mcp-server spec's Cancellation and withdrawal section, while the agent-questions spec only mentions withdrawal in passing (Assumption 4). The reference is part of the sentence being rewritten, so this stays inside the proposal's scope.
- The sentence names the abandoning caller rather than listing the ways it abandons (a cancellation, a closed connection, a grace window that ran out). The mcp-server spec owns that list, and repeating it here would give the two specs another chance to drift.

## Preserved behavior

1. A local MCP question whose signal aborts before an answer records exactly one `question-withdrawn` notification for the asking tab. The spec correction must not change the executor, so the abort must not stop recording the line or record it twice. Pinned by `withdraws an aborted question, shows the next queued question, and records one notification` in `src/mcp/executor.test.ts`.
2. An abort that arrives after the question was answered records nothing. The correction must not change that, so a late abort must not record a withdrawal. Pinned by `does not notify when the signal aborts after the question was answered` in `src/mcp/executor.test.ts`.
3. A relayed question cancelled by the far side before it's answered records the same `question-withdrawn` line. The correction must not change the relay, so the cancel must not skip the notification. Pinned by `withdraws an unanswered question on cancel and shows the next queued one` in `src/remote/mcp-relay.test.ts`.

## Assumptions

1. The executor records the withdrawal from its abort handler with no check on the active tab: `src/mcp/executor.ts:20` "`notify(managers, 'question-withdrawn', label);`".
2. The event is explicit, so focus suppression never drops it: `src/notifications/index.ts:144` "`'question-withdrawn': true,`" in `EXPLICIT_EVENTS`, consulted at `src/notifications/index.ts:165` "`if (!isAmbient(event)) return EXPLICIT_EVENTS[event];`".
3. A relayed question goes through the same executor, and a far-side cancel aborts it: `src/remote/mcp-relay.ts:26` "`const execute = createLocalExecutor(managers);`" and `src/remote/mcp-relay.ts:58` "`pending.get(frame.call)?.controller?.abort();`".
4. The mcp-server spec owns the withdrawal rules: `product/specs/mcp-server.md:28` "`### Cancellation and withdrawal`".

## Existing functionality

1. The sentence being corrected: `product/specs/notifications.md:165` "a question asked by an agent in a background tab is withdrawn before".

## Implementation steps

1. In the event list of `product/specs/notifications.md`, replace the `question-withdrawn` entry's first sentence, "a question asked by an agent in a background tab is withdrawn before it is answered (see [[agent-questions]]).", with one saying the line is recorded when the caller of a pending MCP question, local or relayed from a remote harness, abandons it before it is answered, on whichever tab it was asked (see [[mcp-server]]). Leave every later sentence of the entry as it is. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Promote this plan to `product/plans/complete/` and remove the resolved entry from `product/backlog/pull-request.md`, leaving the other entries unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is to a spec file only, and no user-visible surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named under Preserved behavior already pin the behavior the corrected sentence describes.

## Out of scope

- Any change to `createLocalExecutor`, `createMcpRelay`, `EXPLICIT_EVENTS` or the alert defaults.
- The `question` entry above it, which describes ACP agent questions and their own focus rule.
- `product/specs/mcp-server.md` and `product/specs/remote-server.md`, whose withdrawal descriptions already hold for any tab.
- The other entries in `product/backlog/pull-request.md`.
- `documentation/user-documentation/` and `documentation/developer-documentation/`.
- The PR description and title.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the `question-withdrawn` entry in `product/specs/notifications.md` against `createLocalExecutor` in `src/mcp/executor.ts` and the `'question-withdrawn'` entry in `EXPLICIT_EVENTS` in `src/notifications/index.ts`. The first sentence should say the line is recorded when the caller of a pending MCP question, local or relayed, abandons it before it's answered, on whichever tab it was asked, and point at [[mcp-server]]. The remaining sentences, from "The line reads `Question from <tab> withdrawn`" through "the `warning` cue", should match the previous text word for word. Finding "background tab" still in the entry, or any change to the answered-or-cancelled, no-toggle or `warning` sentences, means the correction was wrong.
