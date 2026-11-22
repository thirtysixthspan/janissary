<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the canonical plan's misquoted evidence for the new plan-PR task.

Existing Issue: The amended plan quotes `open-plan-pull-request.md` as "A plan-first pull request is opened by ... the dedicated plan task" in Assumption 16 and as "The PR body is a short plan summary, not a full description" in Existing functionality 10, but neither snippet appears in that file, whose text reads "The body is a short plan summary, not a full description". Severity: 2/10

Existing Risk: 2/10 - A reader checking the plan's evidence for the standalone-task and short-body claims cannot find the quoted text and may doubt whether the new task actually delivers them.

Proposal Risk: 1/10 - The quotes then match the cited file; the residual risk is future wording drift if the task's preamble is edited again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2173 "correct the canonical plan's misquoted evidence for the new plan-PR task". In `product/plans/complete/pull-request-descriptions.md`, replace the parenthetical quote in Assumption 16 with text actually present in `ai/tasks/workspace/open-plan-pull-request.md` — for example its opening "Your job: take the plan-only changes in this repository ... and open a pull request against `master` on GitHub carrying a short summary of the plan" — and change the Existing functionality 10 quote from "The PR body is a short plan summary, not a full description" to the file's exact "The body is a short plan summary, not a full description". Verify by reading each cited snippet against the current file so the evidence supports the claim it accompanies. The plan's underlying claims about the task (standalone peer, no mode flag, short body) are accurate and stay unchanged.
