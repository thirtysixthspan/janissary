# Deliver over-budget refusals after executed-command results

**Complexity: 2/10** — ~12 added production lines in one file, 4 behavioral requirements and 5 test scenarios (p=4.24); a local pending list and one flush helper, no new architecture.

## Goal

When one reply asks for more commands than the step cap allows, the commands that actually run have their results fed back before the refusals for the skipped ones. Today `launchBatch` pushes a refusal straight into the result queue at launch time while executed results are queued only when their promises settle, so an async result that finishes before delivery ends up behind its refusal. The fix keeps one serialized delivery path and the exact refusal wording.

## Approach

- Keep a `pendingRefusals` list beside the result queue in `runAcpToolLoop`. An over-budget command in `launchBatch` is recorded there instead of being pushed into `queue`; the existing `pendingCap = true` stays, so the capped terminal behavior and the early-answer guard are unchanged.
- Add a `flushRefusals()` helper: when `inFlight === 0`, append the pending refusals to `queue` in launch order and clear the list. Refusals then travel through the same `deliver` → `pump` path as executed results, ordered behind every result that has settled.
- Call `flushRefusals()` from `deliver` just before it pumps, so an asynchronous last settle flushes refusals before any follow-up is sent. Call it from `launchBatch` after `launching = false` as well, because a synchronous `runCommand` settles inside the launch loop before the refusals have been recorded.
- Ordering inside `deliver` is load-bearing: the result is pushed, then refusals are flushed, then `pump()` runs. Pumping first would let the queue drain to empty and finish as `capped` before the refusals were delivered.
- Leave `REFUSAL`, `followUp`, the `Output of` block, `CLOSING`, and the no-command `finish('answered')` guard exactly as they are. Keep using the configured `maxSteps` value; no config or wire change.

## Implementation steps

1. `src/acp/loop.ts` — declare `const pendingRefusals: Result[] = [];` with the other loop state.
2. `src/acp/loop.ts` — add `flushRefusals()` and call it from `deliver` (after pushing the result, before the `!launching` pump).
3. `src/acp/loop.ts` — in `launchBatch`, replace the over-budget `queue.push` with `pendingRefusals.push` and call `flushRefusals()` after `launching = false` and before `pump()`.
4. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/acp/loop.test.ts`: add one async test using `Promise.withResolvers` where a batch of two commands has `maxSteps: 1`, the in-budget command resolves only after the test opts in, and the second command is refused. Assert nothing is sent before the result resolves, then assert `sent[1]` carries `Output of \`notify one\`` with the result and no refusal text, `sent[2]` carries `Output of \`notify two\`:\nACP: step limit reached; command not run.`, and the run finishes `capped`.
- Keep the existing over-budget, parallel-completion, cap, and abort tests passing unchanged.
- Run `$janissary/scripts/run.mjs check-diff`.

## Spec and documentation

- No spec change: `product/specs/acp.md` and `product/specs/agent-command.md` already promise one follow-up per finished command in completion order and the verbatim over-budget refusal. This fix makes the code match that contract rather than changing it. No `help/` or user-documentation page describes the queueing order.
- No description correction: the pull request body already describes parallel batches and completion-order follow-ups.

## Out of scope

- Changing the refusal text, the `Output of` block, or the closing instructions.
- Changing `maxSteps`, `maxToolTurns`, the config reader, or the capped/answered terminal reasons.
- Touching the other two backlog entries or the pull request title.
- Adding a spec paragraph to restate behavior that is already documented.
