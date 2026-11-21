# Unify the ACP tool loop's coordination state and step-cap handling

**Complexity: 5/10** — ~90 added lines across 3 production files (loop.ts state-machine rewrite, drive-loop.ts metadata, types.ts result shape), 8 behavioral requirements, 9 test scenarios (p=5.58).

## Goal

Make an over-budget command produce the same refusal line and the same `ranCommand` event regardless of which cap path detects it, by coordinating the loop through one explicit state and routing both cap sites through one helper, and remove the push/shift ordering coupling that pairs command metadata with results.

## Approach

In `src/acp/loop.ts`, replace the five overlapping coordination flags (`done`, `busy`, `launching`, `pendingCap`, `inFlight`) with one state object holding a phase, the in-flight count, and the capped flag, plus the existing result queue, so a transition is made in one place per event instead of several independent flag checks. Add one `skipOverBudget(commands, feedback)` helper that calls `h.ranCommand` for every skipped command with the existing `REFUSAL` text and, for commands skipped inside a launched batch, queues a refusal result for the agent; route both the `step >= maxSteps` branch in `launchBatch` and the `step >= maxSteps` check in `promptOnce`'s `onEnd` through it, so an over-budget command is reported identically whichever path reaches it first. In `src/acp/drive-loop.ts`, stop pairing metadata by push/shift order on the shared `completed` array: record each command's gate metadata in a per-command ledger at launch and have the `ranCommand` handler take it for that command, removing the cross-command ordering assumption the parallel batch relies on without changing `runCommand`'s string-returning contract that downstream callers depend on. Keep every emitted string and event payload byte-for-byte identical.

## Implementation steps

1. In `src/acp/loop.ts`, define the discriminated state (for example `idle`, `awaiting`, `capping`, `done`, with the in-flight count and pending-cap flag carried where needed) and replace the five flags with transitions through it. Keep `step`, the result queue, and the pending-refusals queue as they are. Rewrite `finish`, `pump`, `flushRefusals`, `deliver`, `launchBatch`, `turn`, `promptOnce`, and `settle` so each reads and advances the single state rather than testing independent flags; preserve the cold-start retry, abort handling, completion-ordered follow-ups, and the "answered" versus "capped" finish reason.
2. Add `skipOverBudget(commands, feedback)` in `src/acp/loop.ts`: for each skipped command, call `h.ranCommand(command, REFUSAL)` and, when `feedback` is true, push a refusal `Result` carrying `REFUSAL` and the command's label into the pending-refusals queue. Replace the inline per-command refusal in `launchBatch` (feedback true) and the bare `pendingCap = true` in `promptOnce`'s `onEnd` (feedback false, so a capped run still finishes) with calls to this helper, so every skipped command gets a `ranCommand` event on either path and a refusal line inside a batch.
3. In `src/acp/drive-loop.ts`, replace the shared `completed` array and its `rememberOnSettle`/push/shift pairing with a per-command metadata ledger: `gatedRunner` records each command's `workspace`/`refused` at launch, and the `ranCommand` handler takes that command's entry and forwards it to the host events, defaulting to `workspace: false`. Keep `runCommand` returning a string so the many downstream callers that invoke it directly are unchanged. Keep `startCommand` and the gate's refusal wording unchanged.
4. Confirm every emitted prompt, transcript line, refusal sentence, and event payload stays byte-for-byte identical; the only count change is that a command skipped after the cap is reached now produces one additional `ranCommand` event, which updates the cap assertions in `src/acp/drive-loop.test.ts` and `src/remote/serve-acp-loop.test.ts`.

## Tests

Keep the three pinned step-cap cases in `src/acp/loop.test.ts` unchanged ("stops at the step cap", "runs only the commands that fit and refuses the rest of an over-budget batch", "delivers every over-budget refusal before finishing capped"), along with the async over-budget, early-answer, parallel-batch, and abort cases. Add one case in `src/acp/loop.test.ts` covering both cap paths: a batch whose second command overflows the cap, followed by a further batch after the cap, asserting a refusal line containing `REFUSAL` for the in-batch command and a `ranCommand` event carrying `REFUSAL` for both skipped commands. Update the step counts in `src/acp/drive-loop.test.ts` and `src/remote/serve-acp-loop.test.ts` by one for the newly-reported post-cap command; keep `src/acp/plugin-session.test.ts` green through the metadata change.

## Out of scope

- Changing the refusal text, the closing/correction prompt text, the step-cap default, or the `answered`/`capped` finish reasons.
- Changing how commands are extracted, gated, or executed, or the tab/workspace confinement rules.
- Altering the remote-ACP session path (`src/remote/acp-session.ts`), which does not use this loop.
