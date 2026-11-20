# Deliver over-budget refusals before the terminal transition

**Complexity: 3/10** — ~6 production lines in one file, six behavioral requirements and six scenarios (p=4.39); a small control-flow correction in the loop engine, no new architecture.

## Goal

When a tool batch straddles the configured step cap and the agent answers before every follow-up is delivered, deliver each over-budget refusal exactly once and end the run as `capped` instead of `answered`. Keep the abort early-out, the idempotent finish, and the ordinary answered path intact.

## Approach

- In `launchBatch`, mark `pendingCap` at the same moment an over-budget refusal is queued. Today `pendingCap` is only set when a *later* batch is received entirely over budget, so a batch that straddles the cap and is followed by a final answer never records the cap at all.
- On a reply with no command, finish as `answered` only when there is no pending work: the result queue is empty, no commands are in flight, and no cap was hit. Otherwise let the existing `pump` keep draining queued follow-ups. Once the queue is empty with nothing in flight and a pending cap, `pump` already finishes as `capped`.
- Leave `finish` idempotent (the `done` guard and queue clear) and leave every abort early-out in `pump`, `turn`, `promptOnce`, and `settle` untouched. The loop's `maxSteps ?? 8` default and the production `maxToolSteps()` value are unchanged; tests pass an explicit cap and assert the cap value they configured.

## Implementation steps

1. `src/acp/loop.ts` — in `launchBatch`, set `pendingCap = true` in the over-budget branch that queues the refusal.
2. `src/acp/loop.ts` — in `promptOnce`'s `onEnd`, change the no-command branch so it calls `finish('answered')` only when `queue.length === 0 && inFlight === 0 && !pendingCap`; otherwise do nothing and let `pump` drain and finish capped.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/acp/loop.test.ts`: add a case with a scripted session whose first reply is a three-command batch and whose second (and later) reply is a final answer, with `maxSteps: 1`. Assert only the first command ran, that exactly two `ACP: step limit reached; command not run.` follow-ups are sent with the correct `Output of` labels, and that the last event is `['finished', 'capped', 1]`.
- Keep the existing over-budget (repeated batch), correction, abort, and cap tests passing unchanged.
- `src/remote/serve-acp-loop.test.ts`: verify the existing `acp-run-end` reason expectations (`answered` for final answers, `capped` for repeated-command cap runs) still hold; no edit expected.

## Spec and documentation

- No spec or documentation change expected. This corrects already-documented cap behavior (a run that hits the cap ends `capped` and the agent is told which commands were skipped). Check `product/specs/agent-command.md` and `product/specs/acp.md` for any genuine drift and report if found.

## Out of scope

- Changing the refusal text, the `Output of` follow-up format, or the configured cap/default.
- Queueing refusals for a batch received wholly over budget (the existing `pendingCap` path), or changing step accounting.
- Reordering when refusals are delivered relative to executed-command results.
- Any pull request description or title change.

## Verification

`$janissary/scripts/run.mjs check-diff`.
