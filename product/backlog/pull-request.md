<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep two runs of the task from sharing one scratch directory, one stash stack, and one checkout of the project.

Existing Issue: Nothing in the new task stops a second run while one is still in flight, because the command queue that serializes task execution is per tab rather than per project, so two agent tabs open on the same project directory both drive the same fixed scratch path, the same working tree, and the same checkout of the primary branch. Severity: 5/10

Existing Risk: 5/10 - The run that finishes first deletes the shared scratch directory out from under the run still testing inside it, so a live instance, its log, and the evidence a reproduction depends on disappear mid-run and that run goes on to report against an app that is no longer there.

Proposal Risk: 2/10 - A second run now stops before it touches anything and says why, leaving the residual exposure to two runs in separate clones, which share no directory and only contend for the same branch.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1327: exclude a second concurrent run of the spec-testing task". Give the run a lock it takes before it changes anything and releases at teardown: a lock file in the repository's common git directory, so two tabs on one project and two workspaces of the same repository contend for the same lock, carrying the run's identity and the object ID of the stash it recorded. Take it in the preparation step beside the stash, and when it is already held, stop before changing the tree, with no install, no stash, and a report that names the holder. Release it in the teardown step and in the recovery rules for a stop, so no exit path can leave the project locked against the next run, and give the report a status that distinguishes this stop from the others. Make the collision explicit in the start-failure list as an environment cause in the same class as a port held by another process, so a launch that fails against the per-directory instance lock the other run holds is reported as unfiled rather than researched as a startup bug; the existing catch-all may already carry an agent that far, but the list should not depend on it. The stash rules stay as they are, since locating this run's stash by object ID already stops a run from popping another run's, and the scratch path stays fixed, because exclusion is what makes one fixed path safe. The task picker spec and the bugs backlog do not change, and the report shape is unchanged.


* Pin the application strings the task tells an agent to match, the way the sibling screenshot task's playbook already is.

Existing Issue: The new playbook's instructions turn on exact output from the launcher, the server, and the stop command — a timeout message, a readiness marker, a stop message, a build script, a configuration key — and nothing in the repository checks those strings against the code that prints them, even though that exact hazard is already pinned for the screenshot task's playbook. Severity: 4/10

Existing Risk: 5/10 - One edit to the launcher or the server leaves the playbook matching output that no longer exists, and an unattended run follows the stale instruction, misreads a real start failure, and files a bug describing a message the app never printed.

Proposal Risk: 2/10 - The pins must be updated whenever those messages change, which is a small deliberate tax that trades a silently wrong playbook for a test that fails.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1327: pin the literals the spec-testing playbook matches against application code". Add a test beside the precedent at `scripts/docs-screenshots/task-playbook.test.mjs`, which exists for this reason and says so in its own comment: reword a message the pipeline prints and the playbook goes on giving confident instructions for output that no longer exists. The new test reads the new task file and asserts, against the code that produces them, the literals the playbook tells the agent to match: the timed-out start message and the readiness marker in `bin/janus.mjs`, the same readiness line in `src/main.ts`, the no-running-instance message in `src/stop-instance.ts`, the missing web bundle error in `src/main.ts`, the workspace-sandbox configuration key against `src/config.ts` and `src/config-decode.ts`, and the build and web-build npm scripts against `package.json`, as the existing test does for the web build. Pin the two browser variables against the attached-browser guideline, which is where an agent is sent to learn them. Keep the negative pin the existing test uses: the playbook must not spell the installation's runner as a project-relative path, and must not contain a file-URL or browser-closing instruction its own forbidden list rules out. Pin the playbook's copy of the fixed report shape against the plan's copy so the two cannot drift silently. No application code changes, and the new file is a script test the existing runner already picks up.


* Restore the failure guard on the native rebuild step that the plan required the install recipe to copy exactly.

Existing Issue: The playbook's Janissary install block ends with the permission fix on node-pty's prebuilt helper and drops the trailing guard that the install step it copies ends with, so the plan's requirement to perform those steps exactly holds for two of the three commands. Severity: 3/10

Existing Risk: 3/10 - Where node-pty ships no prebuilt helper for the platform, the shell reports the unmatched glob as an error, and an unattended run either stops there or treats the dependency step as broken and starts diagnosing it as a product problem.

Proposal Risk: 1/10 - The command becomes a no-op on a platform without prebuilds, which is exactly what the copied step already does.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1327: keep the install recipe's error guard when copying it into the spec-testing task". The install block in the new task's preparation step lists the script-skipping install, the rebuild of the three native packages, and the permission fix on the prebuilt helper; the third command of that block in `ai/tasks/workspace/prepare-workspace.md` is the same permission fix with its error guard and its tolerant exit appended, and the plan requires that task's two steps to be performed exactly. Add the guard to the playbook's copy and say why in the playbook: the glob matches nothing when the package has no prebuilt helper for the platform, the shell reports that as an error, and an unattended run must not read a missing optional helper as a broken install. Leave the rebuild line as it is, since those three packages are the ones the plan names. Nothing else in the block changes — the install stays script-skipping and no browser is ever fetched, which is the reason for copying those steps rather than running a plain install.

