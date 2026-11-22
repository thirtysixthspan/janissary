<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Restore the plan's evidence citations so each quoted fragment is anchored to the line where it actually appears in the unchanged full-body task.

Existing Issue: The completed plan's Assumption 1, Assumption 2, Assumption 3 and Existing functionality 1 cite four line numbers in the full-body PR task that now point at an example transcript, a Step 0 heading, a blank line and a screenshot paragraph because the citations were left at the offsets of an intermediate design whose shift was removed when that task was restored to its master form. Severity: 3/10

Existing Risk: 3/10 - A reader following the plan's evidence lands on unrelated text instead of the quoted rules, which undermines confidence that the plan's other citations were checked against the files they cite.

Proposal Risk: 1/10 - The four anchors then resolve to their quoted fragments and the change touches only evidence prose in a completed plan, with no instruction or behavior altered.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2173 "correct the completed plan's stale line citations to the full-body task". In `product/plans/complete/pull-request-descriptions.md`, update the four stale `ai/tasks/workspace/open-feature-pull-request.md` citations — the four-section-body rule in Assumption 1 and again in Existing functionality 1, the `### How to verify` heading in Assumption 1, the Step 5 heading in Assumption 2, and the "Write them from the plan, the specs the change touches, and the diff" prose in Assumption 3 — so each anchor points to the line where its quoted fragment actually appears in the current `ai/tasks/workspace/open-feature-pull-request.md`. Read that file and locate each fragment directly rather than assuming a fixed offset: an intermediate mode-flag draft shifted these lines by a constant, and restoring the task to its master form dropped that shift while the plan kept it. Leave every other part of the plan, the task instructions and the specs unchanged; there is no behavior to exercise, so verify by reading each corrected anchor against the cited file and sweeping the plan for any other evidence citation left at the intermediate offset. Do not reintroduce a mode flag or any other change to `ai/tasks/workspace/open-feature-pull-request.md`.
