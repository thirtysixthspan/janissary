# Record what the spec-testing task's acceptance runs actually did

**Complexity: 2/10** — one rehearsal of the preparation chain in a throwaway clone, and a status note in a plan file. No application code.

`product/plans/complete/find-bugs-task.md` names running the task end to end as the way this change is checked, and lists three acceptance cases. The pull request records that none of the three was performed, because the authoring tab had no attached E2E browser, and the plan was moved to `complete/` regardless. A plan in `complete/` is the repository's claim that the work is done and verified; right now it claims a verification nobody performed, and the only place that says otherwise is a pull-request body that a later reader may never see. The first execution of this task then happens against a real user's uncommitted work, with no rehearsal of the ordering the plan itself names as the hard part.

## Approach

**Rehearse what this tab can reach, and record what it cannot.** The preparation step runs before the browser gate, so the chain this tab *can* exercise is the one that carries the risk: stash including untracked files, resolve and check out the primary branch, audit the lockfile, install, and restore. That runs in a throwaway clone of this branch so nothing real is at stake and the task file under test is the one on the branch.

**Record the outcome where the claim lives.** A short status note under the plan's verification section names the cases that ran, on which commit, and what each produced — so `complete/` no longer implies verification that never happened, and the next person to run the task knows which paths are still untested.

**Note the ordering the rehearsal exposed, without changing the task.** The specification-case check sits in the second step, after the browser gate, so a run without a browser reports the missing browser rather than the unknown spec name. That is worth writing down as an untested path; reordering the steps is a design change to the task and does not belong to a verification record.

## Implementation steps

1. Clone this branch into a throwaway directory under `temp/`, which `find-bugs.md` already keeps ignored, and use the clone as the project under test.
2. Follow the task's preparation step inside the clone, in order and as written: confirm a clean tree with an `origin`; resolve the primary branch from `origin/HEAD`; fetch; confirm no local commits ahead; make the tree dirty with one tracked edit and one untracked file so the stash path is real; stash with the run's own message and record the stash's object ID; check out the primary branch and fast-forward only; audit `./package-lock.json` through the clone's own runner; install with the script-skipping command and the two rebuild lines.
3. Reach the browser gate, find both variables unset, and take the stop it prescribes — restoring this run's stash by its recorded object ID.
4. Confirm the aftermath: the tree is exactly as it was left, the stash is gone, and the clone is on the primary branch.
5. Add the status note to `product/plans/complete/find-bugs-task.md` under its verification section, and record the ordering observation beside it.

## Tests

No new test. The rehearsal is the verification: it drives the task's own preparation chain in a real repository and asserts its aftermath, which is what a test for a prose playbook cannot do. `scripts/check-malicious-package.test.mjs` covers the audit step the chain now depends on, added by the previous entry.

## Out of scope

- **Acceptance cases 1 and 3.** Both need a tab launched with the E2E browser, and this tab has neither `JANISSARY_BROWSER_WS_ENDPOINT` nor `JANISSARY_PLAYWRIGHT`. The status note says so rather than claiming a pass.
- **Reordering the task's steps** so that a specification name is validated before the browser gate. Real, but a design change to the task rather than a verification record.
- **Changing the task in response to the rehearsal.** If the rehearsal surfaces a defect, it becomes its own backlog entry, as the review task requires of anything the rehearsal uncovers.
- **Any application code.** The rehearsal builds nothing: `npm install --ignore-scripts` links binaries, and the failure it rehearses is the preparation chain, not the build.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: the rehearsal itself, run in the steps above, plus reading the status note back to confirm it names the commit it ran on.
