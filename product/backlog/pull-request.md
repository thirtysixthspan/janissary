<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Restore the failure guard on the native rebuild step that the plan required the install recipe to copy exactly.

Existing Issue: The playbook's Janissary install block ends with the permission fix on node-pty's prebuilt helper and drops the trailing guard that the install step it copies ends with, so the plan's requirement to perform those steps exactly holds for two of the three commands. Severity: 3/10

Existing Risk: 3/10 - Where node-pty ships no prebuilt helper for the platform, the shell reports the unmatched glob as an error, and an unattended run either stops there or treats the dependency step as broken and starts diagnosing it as a product problem.

Proposal Risk: 1/10 - The command becomes a no-op on a platform without prebuilds, which is exactly what the copied step already does.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1327: keep the install recipe's error guard when copying it into the spec-testing task". The install block in the new task's preparation step lists the script-skipping install, the rebuild of the three native packages, and the permission fix on the prebuilt helper; the third command of that block in `ai/tasks/workspace/prepare-workspace.md` is the same permission fix with its error guard and its tolerant exit appended, and the plan requires that task's two steps to be performed exactly. Add the guard to the playbook's copy and say why in the playbook: the glob matches nothing when the package has no prebuilt helper for the platform, the shell reports that as an error, and an unattended run must not read a missing optional helper as a broken install. Leave the rebuild line as it is, since those three packages are the ones the plan names. Nothing else in the block changes — the install stays script-skipping and no browser is ever fetched, which is the reason for copying those steps rather than running a plain install.

