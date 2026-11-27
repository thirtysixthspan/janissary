# Document why the two MCP notification kinds bypass focus suppression

**Complexity: 1/10** — 2 added comment lines, 1 production file, 3 requirements, no new tests or units (p=3.09)

## Goal

`EXPLICIT_EVENTS` in `src/notifications/index.ts` is keyed by the notification union so every event must be classified before it compiles, and its header promises that each event's reason for that classification is kept with its entry. The two newest entries, `mcp-failed` and `question-withdrawn`, are the only ones without that one-line rationale. Record beside each entry why it must stay visible even when its own tab is active, so a later contributor cannot quietly reverse the classification and drop the MCP startup-failure or question-withdrawal notice.

## Requirements

1. Every explicit event's reason for bypassing focus suppression is kept with its entry — "Each event's reason for that classification is kept with its entry."
2. The `mcp-failed` entry states that the local MCP server could not start and that the user must see it even when the originating tab is active — "`mcp-failed` reports that the local MCP server could not start, which the user must see even when the originating tab is active".
3. The `question-withdrawn` entry states that it reports the withdrawal of a pending question and must stay as visible as `question` — "`question-withdrawn` reports the withdrawal of a pending question and must stay as visible as the `question` event it follows".

## Design decisions

- Add exactly two source comments to `EXPLICIT_EVENTS` and nothing else: the fix is documentation at the point of classification, not a behavior change. The entry's Proposal asks to "add a one-line rationale comment beside each of the `mcp-failed` and `question-withdrawn` entries".
- Follow the neighbouring entries' pattern: one short `// …` line directly above the `true` assignment, in the same past-tense descriptive voice as the surrounding lines.
- Keep both events explicit. The scope guard is to "Keep both events explicit; leave alert defaults, notificationText cases, and the existing tests untouched. No behavior change."
- Leave `product/specs/notifications.md` alone: it already records both events' rationale and their focus-suppression behavior, so there is no user-visible change for a spec to capture.

## Preserved behavior

1. `mcp-failed` stays classified in `EXPLICIT_EVENTS`, firing without config and while its own tab is active — it must not be moved behind an ambient toggle or focus suppression; the table-driven `shouldNotify covers every notification event` case in `src/notifications/index.test.ts` pins this.
2. `question-withdrawn` stays classified in `EXPLICIT_EVENTS` on the same terms — it must not be moved behind an ambient toggle or focus suppression; the same table-driven `shouldNotify covers every notification event` case in `src/notifications/index.test.ts` pins this.
3. Both kinds keep a default desktop banner with a non-`none` cue — their alert defaults must not be removed or silenced; the every-explicit-event alert loop in `src/notifications/native.test.ts` pins this.
4. Both messages render unchanged (`MCP server failed to start: <reason>` and `Question from <tab> withdrawn`) — their `notificationText` cases must not be edited; the two rendering tests in `src/notifications/format.test.ts` pin this.

## Assumptions

1. The `EXPLICIT_EVENTS` header promises a reason for every entry — `src/notifications/index.ts:76` `// Each event's reason for that classification is kept with its entry.`.
2. Every neighbouring explicit entry carries a one-line rationale comment, e.g. `src/notifications/index.ts:139` `// Provider refreshes are deliberate actions whose outcomes remain visible while their tab is active.`.
3. The two newest entries currently have no such comment — `src/notifications/index.ts:141` `'mcp-failed': true,` and `src/notifications/index.ts:142` `'question-withdrawn': true,`.
4. The spec already states both events' rationale and active-tab visibility — `product/specs/notifications.md:169` "`mcp-failed` … is explicit, has no config toggle, and is recorded even when its tab is active." and `product/specs/notifications.md:165` "`question-withdrawn` … Like `question` it is explicit and has no config toggle, so it is recorded even while that tab is active."

## Existing functionality

1. The per-entry one-line rationale comment convention in `EXPLICIT_EVENTS` — `src/notifications/index.ts:79` `// A scheduled command delivered more than five seconds late.`.
2. The exhaustive explicit-event table that drives both classification and its table-driven coverage — `src/notifications/index.ts:78` `export const EXPLICIT_EVENTS: Record<ExplicitNotificationEvent, true> = {`.
3. The table-driven coverage test that already exercises every explicit event — `src/notifications/index.test.ts:34` `describe('shouldNotify covers every notification event', …)`.
4. The rendering tests that already pin both messages — `src/notifications/format.test.ts:90` `it('renders the MCP failure reason verbatim', …)` and `src/notifications/format.test.ts:95` `it('formats the withdrawn-question message', …)`.

## Implementation steps

1. In `src/notifications/index.ts`, add one `// …` rationale line directly above each of the `'mcp-failed': true,` and `'question-withdrawn': true,` entries in `EXPLICIT_EVENTS`. The `mcp-failed` line says the local MCP server could not start and the user must see it even while its tab is active; the `question-withdrawn` line says it reports a pending question being withdrawn and must remain as visible as `question`. Change only these two comment lines: do not edit the entries themselves, `NOTIFICATION_ALERT_DEFAULTS`, `notificationText`, any test, or any other file. The file stays well under the 200-line `max-lines` limit and gains no imports. Build and check with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface is added or changed. The change is two source comments beside a classification table; the feed, toast, and alert surfaces behave exactly as before.

## Tests

This plan changes no application behavior and adds no code — only two source comments — so no new tests are introduced. The existing coverage remains in place and must be left untouched: the table-driven `shouldNotify covers every notification event` in `src/notifications/index.test.ts`, the two rendering tests in `src/notifications/format.test.ts`, and the every-explicit-event alert loop in `src/notifications/native.test.ts`.

## Out of scope

- Moving either event behind a config toggle or the ambient focus rule.
- Editing `NOTIFICATION_ALERT_DEFAULTS` in `src/notifications/alert-defaults.ts` or any case in `notificationText` in `src/notifications/format.ts`.
- Adding, removing, or rewriting any test.
- Correcting the pull request title or description.
- Editing `documentation/user-documentation/` or `documentation/developer-documentation/`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Because the change is comment-only, prove it by reading rather than by exercising the app: open `src/notifications/index.ts` and confirm a single one-line `// …` rationale sits directly above each of `'mcp-failed': true,` and `'question-withdrawn': true,`, that both entries still read `true`, and that every neighbouring entry's comment is byte-for-byte unchanged. Then inspect `git diff` and confirm the only edited production file is `src/notifications/index.ts` and the only added lines are those two comments — with `src/notifications/alert-defaults.ts`, `src/notifications/format.ts`, and the test files absent from the diff. A failure is an altered classification, a changed alert or message case, a touched test, or either rationale line missing.
