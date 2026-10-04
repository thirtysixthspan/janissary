<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the skill and the documentation page, which broaden the plan's accurate note about messaged commands into a false claim that `send` does not queue behind a busy worker.

Existing Issue: The plan states that "`msg … request` does not queue behind a busy worker, and that is inherited", which is true because `CaptureManager.runCommand` calls `executeCommand` and bypasses the gate in `dispatchOrRun`, but the skill's Watching a worker work section and the Delegating to agents page both widen it to "a command sent to a busy worker is not queued behind what it is already doing", and `send` does queue: `deliverTo` in `src/commands/send.ts` routes an agent tab to `managers.command.dispatchTo`, which is the queued path. Severity: 3/10

Existing Risk: 3/10 - An agent reading the skill concludes a handover to a busy worker has started, polls once, sees the previous dispatch, and either re-sends the task or gives up on a worker that is in fact running.

Proposal Risk: 1/10 - The description matches what each verb does, and the distinction between the two is stated once, in the place a reader reaches for it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: correct the skill and documentation claim that send does not queue behind a busy worker". In `skills/delegate-to-agents/SKILL.md`, in the paragraph beginning "Each poll is one of this turn's eight tool steps", replace the sentence about a command not being queued with one that names the mechanism and the split: a messaged command — which is what `msg … request state` is — runs in the worker immediately rather than queueing, so a poll taken mid-turn shows the previous dispatch, while `send` does queue behind whatever the worker is already doing and returns as soon as it has handed the line over. Make the same correction in the equivalent paragraph of `documentation/user-documentation/advanced-agents/delegating-to-agents.md`. Leave `product/specs/messaging.md` as it is: its wording is already scoped to a messaged command and is correct. No behavior changes, so no test is affected.
