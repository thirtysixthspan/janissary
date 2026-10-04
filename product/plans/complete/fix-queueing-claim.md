# Correct the queueing claim in the skill and the documentation page

**Complexity: 1/10** — two sentences of prose; no code and no test.

## Goal

The plan states accurately that a **messaged** command does not queue behind a busy worker, because `CaptureManager.runCommand` calls `executeCommand` and bypasses the gate in `dispatchOrRun`. The skill and the documentation page widened that into "a command sent to a busy worker does not queue behind what it is already doing", which is false for `send`: `deliverTo` routes an agent tab to `managers.command.dispatchTo`, which is the queued path.

An agent reading the skill concludes a handover to a busy worker has started, polls once, sees the previous dispatch, and either re-sends the task or gives up on a worker that is in fact running.

## Approach

Replace the sentence in both files with one that names the mechanism and the split:

- `msg … request state` is a messaged command, so it runs in the worker immediately rather than queueing — which is why a poll taken mid-turn shows the previous dispatch.
- `send` does queue behind whatever the worker is already doing, and returns as soon as it has handed the line over.

`product/specs/messaging.md` already scopes its wording to a messaged command and is correct, so it stays as it is.

## Tests

None. No behavior changes.

## Out of scope

- Changing either verb's queueing behavior. Both keep what `send` and `msg` do for a person.