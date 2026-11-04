<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Plan fidelity: complete and record the manual acceptance scenarios that the completed 07 plan still lists as unexercised.

Existing Issue: The completed 07 plan says completion requires evidence for every requirement-map row and manual scenarios M1 through M8, but its own ledger records M1, M2, and M6 as partial and M3, M4, M5, and M7 as not exercised, with no browser or remote-host evidence in the pull request. Severity: 6/10

Existing Risk: 6/10 - Cancel, record-tab controls, agent Terminate, and real remote cancellation can ship broken even though all automated checks pass.

Proposal Risk: 3/10 - The work still depends on an assigned browser, authenticated provider, and a protocol-37 remote host, so the honest outcome may be a recorded blocker rather than a pass.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "complete the feature's manual acceptance ledger". Run the M1 through M8 scenarios in `product/plans/complete/connections-tabs-07-specs-docs-integration.md` against a server built from this workspace, using an isolated scratch project, an assigned browser, authenticated provider access, and a reachable SSH host speaking remote protocol 37. Capture the exact observed result for async shell delivery, list and record navigation, record history and paging, cancel/close/questions, headed and headless agent runs, persistence/recovery/deletion, real remote cancellation, and legacy help/completion. Update the plan's verification ledger with per-scenario status, screenshots or capture paths, the production chunk names and static-closure result, and every unavailable resource; do not substitute unit tests or the stub/frame suites for the browser or real-host checks. If a required resource is still unavailable, leave the scenario explicitly blocked and do not mark the acceptance complete.
