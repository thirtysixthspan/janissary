<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request's testing step that describes a member's workspace folder as named after the tab and the model, which no longer leaves out the member index.

Existing Issue: Step 2 of the description's **How to verify** says to confirm each clone in `.janissary/workspace/` is "named after the tab and the model with its `/` replaced by `-`", but `memberWorkspaceName` in `src/multiagent/workspaces.ts` appends the member's index as well, so the folders are named `multi-agent-opencode-big-pickle-0` and `multi-agent-google-gemini-3.1-flash-lite-1`, and a reviewer following the step literally looks for names that do not exist. Severity: 4/10

Existing Risk: 4/10 - The step is the only written account of where a member's clone lands, so a reviewer running it concludes the naming is broken — or, having seen the index in the folder name and no explanation for it in the pull request, cannot tell whether the suffix is intended or a leftover — and either reports a defect that is not there or accepts a behavior nobody documented.

Proposal Risk: 1/10 - The step then matches the code, and the naming it describes is already pinned by the unit tests in `src/multiagent/workspaces.test.ts` and by the plan's own out-of-scope note, so nothing can drift back without a test failing.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1513: correct the description's clone-naming step to include the member index". In the pull request description's **How to verify** section, change step 2 so it reads that each clone is "named `<tab label>-<model with its / replaced by ->-<member index>`, e.g. `multi-agent-opencode-big-pickle-0`", and keep the rest of the step as the author wrote it. Observed at b62e24cf: a two-member `fanout opencode:opencode/big-pickle opencode:google/gemini-3.1-flash-lite explain this repository` produced exactly `multi-agent-opencode-big-pickle-0` and `multi-agent-google-gemini-3.1-flash-lite-1` under `.janissary/workspace/`, and closing the tab removed both along with their `.tmp` siblings. The same wording appears in the **Verification** section of `product/plans/complete/multiagent.md`; a completed plan is a historical record and is deliberately left alone, so the description is the only place to correct. A regression test is not needed for a prose correction — `memberWorkspaceName`'s cases in `src/multiagent/workspaces.test.ts` already assert the exact form, including the case where two models differing only in a `/` against a `-` must derive different names.


