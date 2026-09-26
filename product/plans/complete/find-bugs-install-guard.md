# Keep the install recipe's error guard when copying it into the spec-testing task

**Complexity: 1/10** — one command in one playbook, and the reason it carries the guard. No code, no test.

`ai/tasks/workspace/prepare-workspace.md` ends its third step with the permission fix on node-pty's prebuilt helper followed by `2>/dev/null || true`. The plan requires that task's steps two and three to be performed *exactly* by the spec-testing task, and the copy in the new task's preparation step carries the command without the guard. On a platform where node-pty ships no prebuilt helper the glob matches nothing, the shell reports that as an error, and an unattended run reading it has to decide whether the dependency step is broken. The source of the command guards it deliberately; the copy dropped it.

## Approach

Restore the guard and say why in the playbook, because the reason is the part a reader needs when the command does fail: the glob matching nothing is an expected outcome on some platforms, not a broken install. Nothing else in the block moves — the install stays script-skipping and no browser is ever fetched, which is the whole reason for copying these two steps rather than running a plain install.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — the `chmod` line in the preparation step's install block, with the reason beside it.

## Tests

None. The change is a shell guard on a command whose failure mode is visible in the run's own output, and the reason it matters is precisely that it is not a code path anything can assert on. The step this line belongs to is exercised by the acceptance rehearsal recorded in `product/plans/complete/find-bugs-acceptance-record.md`, which ran the whole preparation chain including the rebuild step on a platform where the glob does match.

## Out of scope

- **The other two commands in the block.** The script-skipping install and the rebuild of the three native packages are the plan's, verbatim, and neither needs a guard: a failure in either is a real failure.
- **Making the install resilient in general.** Restoring one dropped guard is the fix; a policy about which steps tolerate failure is a change to `prepare-workspace.md`, which every other playbook also copies.
- **A shell-portability note.** The guard is what the source uses; changing how either file spells it is not this entry's business.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: read the install block against `ai/tasks/workspace/prepare-workspace.md` and confirm the three commands now match it line for line.
