<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Anchor the pull request description's unanchored behavior examples and its empty-scope verification step to the task text that proves them, correcting a description fidelity gap.

Existing Issue: The description's Before/After transcript and its fallback sentence under Behavior examples, and How to verify edge case 6 ("An empty scope is a clean review"), name no line or test assertion, while every other Do/Expect step does. Severity: 2/10

Existing Risk: 3/10 - A reader checking those claims has to search the playbooks to find what proves them, and a later edit that moves or drops the empty-scope or fallback wording would leave the description asserting behavior nothing ties back to the code.

Proposal Risk: 1/10 - Line anchors in a description go stale as files change, so the next pull request update still has to re-check that each one points at the quoted text.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2207 "anchor the description's unanchored behavior examples and How to verify step 6". In the PR body, under Behavior examples, anchor the After invocation to the `Invocation:` paragraph near the top of ai/tasks/feature/review-pull-request.md and to Step 6 item 1 of ai/tasks/feature/build-a-complex-feature.md, and anchor the fallback sentence ("A scope that can't be used, such as `scope: subplan 1a2b3c4`...") to Step 1 item 5 and the Step 7 `Scope:` template line of ai/tasks/feature/review-pull-request.md. The Before block quotes text that no longer exists on the branch, so anchor it to master's version of Step 6 item 1 in ai/tasks/feature/build-a-complex-feature.md rather than to a branch line. In How to verify step 6, replace "read \"Confirm coverage\" in Step 3" with the line of that paragraph's "A scope whose diff holds no changes has nothing to review" sentence at the branch head. Change only the description through `gh pr edit --body-file`, edit no playbook, spec, script, or test, and confirm with `gh pr view 2207 --json body` that each anchor lands on the text it cites. No test covers the description.
