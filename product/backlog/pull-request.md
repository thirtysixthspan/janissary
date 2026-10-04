<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the functionality gap that lets the delegation depth cap be bypassed through `msg`, making the bound this pull request adds advisory rather than enforced.

Existing Issue: The cap lives only in `runAgent` in `src/acp/delegation.ts`, but `runMsg` hands the same text to `managers.capture.run`, which resolves `agent` as a registered command and calls `ProfileManager.newAgent` → `newAgentOp` in `src/profile/new-agent.ts`, and that path contains no depth check, so a tab already at the cap can still open a worker with `msg <some-tab> request agent <name>`. Severity: 6/10

Existing Risk: 5/10 - The plan introduces the cap as the property that keeps a delegation tree finite, and a reader of the primer concludes it holds, so the bound fails exactly when a misbehaving agent looks for the cheapest way around it.

Proposal Risk: 2/10 - With `agent` outside the delegation allowlist the only route to a new tab is the capped tool path, so the bound becomes structural, and the residual is a human typing `agent` by hand, which is meant to be uncapped.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: make the delegation depth cap unreachable by bypassing it". The allowlist work in the entry above closes this incidentally, because `msg` would then refuse `agent` before dispatch: confirm that the two entries land together rather than shipping the cap fix alone, since the cap alone is not sufficient. Add a regression test in `src/acp/delegation.test.ts` that a tab at `MAX_AGENT_DEPTH` is refused by the `agent` verb and that no tab is created by the `msg` route either, by asserting `managers.profile.newAgent` was never called. Do not move the check into `newAgentOp`: that would cap a person typing `agent` by hand, which `product/plans/complete/delegate-to-agents.md` decision 19 deliberately excludes and `product/specs/agents.md` does not mention.


* Deliver the plan's missing test for the delegation depth refusal, which is the one behavior in this pull request no test exercises.

Existing Issue: The Tests section of the plan names "the depth refusal at the cap and its absence below it" among the cases for `src/acp/delegation.test.ts`, but that file covers only `isDelegationCommandLine`, `DELEGATION_PRIMER`, and `scanWorkerAnswer`, and no test anywhere calls `runDelegation`, so the cap check, the three dispatch branches, and the answer scan's wiring into the `msg` return value are all untested. Severity: 5/10

Existing Risk: 4/10 - The cap is the pull request's answer to unbounded delegation trees, and a change that removed or inverted the comparison would pass every test in the suite.

Proposal Risk: 1/10 - Behavior is pinned by direct tests of the cap and of each dispatch branch, so a regression names itself.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: cover the delegation depth cap and the runDelegation dispatch". Extend `src/acp/delegation.test.ts` with a `managers` stub carrying `tab.byLabel` returning a tab whose `agentDepth` is `MAX_AGENT_DEPTH` and one returning a lower value, and assert `runDelegation` refuses the first with the cap message and calls `managers.profile.newAgent` for the second, treating the tab's absent `agentDepth` as depth 0. Add one case per dispatch branch: a command matching `AGENT_COMMAND` reaches `profile.newAgent` with the command verbatim, one matching `SEND_COMMAND` reaches `resolveTarget` and `deliverTo`, and one reaching `runMsg` resolves through `managers.capture.run` with the worker's text passed to `scanWorkerAnswer` — mock `capture.run` to invoke its callback with a string containing `<system-reminder>` and assert the resolved promise begins with the `[harness: neutralized …]` line. Mirror the stub style already used in `src/acp/tool-table.test.ts` and `src/profile/new-agent.test.ts` so the file keeps one way of building a `Managers` value. The existing pure-function cases must keep passing untouched.


* Handle the case where the agent tool reports a refused worker launch to the agent as a success, so a delegating agent acts on a worker that was never opened.

Existing Issue: `runAgent` in `src/acp/delegation.ts` checks only the depth cap and the `modelError` usage case before calling `managers.profile.newAgent` and then unconditionally returns "Opening agent …", while the catalog refusal for an unknown model is raised later inside `newAgentOp` as a transcript line, so a reply ending `agent scout --model not/a-model` produces both a success-shaped tool result and the refusal line; the same return value also builds its follow-up hint from `parsed.name`, which is empty for a pool-name launch and yields the unusable `msg a new agent request state`. Severity: 4/10

Existing Risk: 4/10 - The delegating agent's next prompt is the success message, so it goes on to send the task to a tab that does not exist and spends several of its eight steps recovering from a refusal it was never told about.

Proposal Risk: 2/10 - The tool's result becomes a faithful account of what happened, and an agent that is refused twice learns to stop asking.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: make the agent tool's result reflect whether the worker actually opened". In `runAgent` in `src/acp/delegation.ts`, apply the same `isKnownModel('opencode', model)` check that `newAgentOp` in `src/profile/new-agent.ts` performs, using the same wording, and return that refusal instead of calling `profile.newAgent`; the launch-time check stays where it is, because it is what protects a person typing the command and what refuses before a clone starts. For the hint, branch on whether `parsed.name` is empty and omit the `msg … request state` sentence entirely for a pool-name launch rather than interpolating a placeholder, since the pool name is only chosen inside `newAgentOp`. The two checks now agree, and the depth refusal, the usage refusal, and the catalog refusal are all returned the same way as every other tool error. Cover both new branches in `src/acp/delegation.test.ts`, which the entry above is already extending.


* Avoid the duplication where sending to a tab that does not exist is reported twice, once in the transcript and once as the tool result.

Existing Issue: `runSend` in `src/acp/delegation.ts` passes `appendTo(managers, label)` as `resolveTarget`'s report callback, and `resolveTarget` in `src/commands/resolve-target.ts` appends `No tab named "<label>".` to the delegating tab before returning undefined, which `runSend` then follows with its own `Sent nothing to "<label>".` return value, so one failed send appears twice. Severity: 3/10

Existing Risk: 2/10 - Two lines saying nearly the same thing read as two separate problems and cost the delegating agent a step to interpret.

Proposal Risk: 1/10 - One line per outcome, which is what every other tool error already produces.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: report a failed send once instead of twice". In `runSend` in `src/acp/delegation.ts`, stop passing `appendTo(managers, label)` to `resolveTarget` and give it a callback that discards its text, keeping `resolveTarget` for its alias resolution and its `undefined` return, then return `No tab named "<label>".` as the tool result so the delegating agent reads the same wording a person would see. `deliverTo`'s own error return already comes back exactly once and must not change. Add a case in `src/acp/delegation.test.ts` asserting `managers.tab.append` was not called and the resolved value is the single refusal line.


* Correct the skill and the documentation page, which broaden the plan's accurate note about messaged commands into a false claim that `send` does not queue behind a busy worker.

Existing Issue: The plan states that "`msg … request` does not queue behind a busy worker, and that is inherited", which is true because `CaptureManager.runCommand` calls `executeCommand` and bypasses the gate in `dispatchOrRun`, but the skill's Watching a worker work section and the Delegating to agents page both widen it to "a command sent to a busy worker is not queued behind what it is already doing", and `send` does queue: `deliverTo` in `src/commands/send.ts` routes an agent tab to `managers.command.dispatchTo`, which is the queued path. Severity: 3/10

Existing Risk: 3/10 - An agent reading the skill concludes a handover to a busy worker has started, polls once, sees the previous dispatch, and either re-sends the task or gives up on a worker that is in fact running.

Proposal Risk: 1/10 - The description matches what each verb does, and the distinction between the two is stated once, in the place a reader reaches for it.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1536: correct the skill and documentation claim that send does not queue behind a busy worker". In `skills/delegate-to-agents/SKILL.md`, in the paragraph beginning "Each poll is one of this turn's eight tool steps", replace the sentence about a command not being queued with one that names the mechanism and the split: a messaged command — which is what `msg … request state` is — runs in the worker immediately rather than queueing, so a poll taken mid-turn shows the previous dispatch, while `send` does queue behind whatever the worker is already doing and returns as soon as it has handed the line over. Make the same correction in the equivalent paragraph of `documentation/user-documentation/advanced-agents/delegating-to-agents.md`. Leave `product/specs/messaging.md` as it is: its wording is already scoped to a messaged command and is correct. No behavior changes, so no test is affected.
