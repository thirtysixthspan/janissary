<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the description's Screenshots claim, which names no code path or test that supports it.

Existing Issue: The description's Screenshots section states that no screenshot could be captured and attributes that to the task workflow, without naming any code path, line, or test assertion that proves the claim. Severity: 2/10

Existing Risk: 2/10 - A reader cannot check the claim against the code, so the section conveys nothing verifiable about the new buttons and leaves the UI change resting on unanchored prose.

Proposal Risk: 1/10 - The UI behavior remains covered by the component tests, and the description would either point at them or drop the unverifiable statement.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "anchor or remove the description's screenshots claim". The description's Screenshots section says no screenshot could be captured because this was a plan-first pull request and the update task never starts the app, and names no code path or test assertion. Replace that paragraph with an anchor to the component cases that prove the two buttons' labels, icons, placement and empty-state visibility in web/src/plugins/hosts/HostList.test.tsx, or remove the section entirely if no screenshot is supplied. Keep the Behavior examples and How to verify sections unchanged, since their lines already name their code paths and test assertions. No source file needs to change.
