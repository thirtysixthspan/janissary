# Drop the run lock from the spec-testing task

**Complexity: 1/10** — one step out of Step 0, and the eight places that referred to it. No code, no test.

`ai/tasks/research/find-bugs.md` takes a lock in Step 0: it creates a directory under the repository's common git directory, writes a record of the run inside it, stops when the directory already exists, and releases it on every exit. That lock is what this change removes, together with every sentence that exists only to maintain it — the forbidden item about proceeding while another run holds it, the release rule in the recovery section, the lock's path in the record the run keeps, the release in the teardown step, and the four "release the lock and stop" clauses in the browser gate, the spec selection, and the app launch. Step 0 is left with two items: confirm the project keeps the convention, and execute the preparation task.

The spec's "Only one run works a project at a time" sentence goes with it, since the behavior it describes is the lock's and there is no longer a lock to describe.

What replaces the exclusion, if anything, is already in place and is not part of this change: the launch task inspects a scratch root left by an earlier run, stops only the processes it can identify as its own, and refuses to kill anything whose ownership it cannot establish. That is a weaker guarantee than a lock, because it acts after a second run has already started rather than before, and this change does not attempt to strengthen it.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — Step 0, losing its second item and renumbering the two that follow.
2. `ai/tasks/research/find-bugs.md` — the forbidden list, losing its last item.
3. `ai/tasks/research/find-bugs.md` — the recovery section's record sentence and its release bullet.
4. `ai/tasks/research/find-bugs.md` — the four "release the lock" clauses in Steps 1, 2, and 3, and the release in Step 8.
5. `product/specs/task-picker.md` — the one-run-at-a-time sentence.

## Tests

None, and none needed. `scripts/find-bugs-playbook.test.mjs` pins application literals, the report shape, the two delegations, and the loopback address; the lock appears in none of them, so the suite is expected to pass untouched and is the check that the removal took nothing else with it.

## Out of scope

- **The start-failure list's treatment of an instance-lock collision.** It reads `another janus instance is already running in this directory` and classes that as an environment cause rather than a defect in the app. That stays: it is about a project's own instance lock, and with this task's lock gone a concurrent run is a likelier cause of it, not a less likely one.
- **Any substitute for mutual exclusion.** A different mechanism, a queue, or a per-run scratch path would be a new decision, and the user asked for this one removed.
- **The launch task's leftover handling.** It is the only remaining defense against a stale scratch root and it is not weakened by this change.
- **The plan.** It never described a lock, so there is nothing in it to correct.
- **The report shape.** `Status: stopped: <reason>` already carries a stop this task can now report, and nothing is added or removed.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task and the spec for `lock` and confirm every remaining mention is a lockfile or a project's own instance lock, never this run's.
