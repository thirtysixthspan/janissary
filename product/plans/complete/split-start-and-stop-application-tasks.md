# Split the launch task into a start task and a stop task

**Complexity: 2/10** — one task file renamed and halved, one new beside it, and the references that follow. Prose only, and the pin test is what keeps the halves pointing at each other.

`ai/tasks/workspace/launch-application.md` owned an app's whole life: it discovered the recipe, created the scratch state, built, started, confirmed readiness, reported, and then stopped everything and removed the tree. The two halves belong to different moments and different callers. Starting is a decision a caller makes once, before its work begins; stopping is a decision it makes at the end, and it is also how a scratch root left behind by a run that died gets cleared — which is not something the starting task should be doing on its own initiative. So the file becomes `start-application.md` and `stop-application.md`, and the research task calls both.

The split needs one thing the single file did not have to name: how the second task learns what the first started. The start task writes `<scratch root>/start-record.txt` — scratch paths, process identity, stop command, address, commit, start time — and reports its path. The stop task reads that file and decides everything from it, which is also what makes the leftover case safe: a record is the attribution evidence, and an absent record means "nothing to stop", never "something to stop at my own discretion".

Two boundaries the split draws deliberately:

- **The start task does not stop what it started**, with one exception it needs itself: a start attempt that failed has to be cleaned up before the single retry, and it knows that process is its own. Everything after a successful start belongs to the stop task, including a scratch root that already existed when it began — removing a live app's state is a decision made with a record, not a side effect of starting a new run.
- **The stop task starts nothing.** A scratch root whose app was never started is still cleared; that is the whole of the task in that case.

And the Janissary-specific clause leaves the research task's start-failure list along with the rename: the list of environment causes no longer quotes one product's error message, and the stop task's refusal to end an app it was not given is stated without naming whose app that is.

## Implementation steps

1. `ai/tasks/workspace/start-application.md` — the renamed half: the job statement without teardown, the stop half of the recipe kept as a precondition, a clean-scratch-root precondition, the start record, and a handover report that says the app is left running.
2. `ai/tasks/workspace/stop-application.md` — new: read the record, stop what it names, remove the scratch root, report the ending.
3. `ai/tasks/workspace/launch-application.md` — removed.
4. `ai/tasks/research/find-bugs.md` — the delegation, the teardown hand-off, the recovery bullet, the record sentence, the start-failure list, and the remaining "launch" wording.
5. `scripts/find-bugs-playbook.test.mjs` — the delegation list gains the stop task and the renamed start task, and the loopback literal re-points at the start task.
6. `product/specs/task-picker.md` — the sentence describing the launch task.
7. `product/plans/complete/find-bugs-task.md` — the verification-status paragraph rewritten for two tasks.

## Tests

`scripts/find-bugs-playbook.test.mjs`:

- the link-integrity assertion now covers all three delegated tasks, each named on both sides and each present on disk — which is the check that fails if one half is renamed without the other being repointed;
- the loopback address is asserted in the start task, where the rule now lives.

No new test. The record file's contents are a contract between two prose files, and the same class of check as the delegation pins — that both name the file — is what covers it.

## Out of scope

- **`prepare-workspace.md`.** Untouched; the gate it gained in the previous change is not affected.
- **The run lock.** Already removed, and this change does not bring it back or replace it. Two concurrent runs remain possible, and the stop task's refusal to kill what it cannot attribute is now the last thing standing between them.
- **The research task's own recovery rules** about the tree it was handed, which are about committing rather than about the app's lifetime.
- **The extraction plan** `product/plans/complete/extract-launch-application-task.md`, which records that a launch task was added. It is a dated record of that change and is left naming the file as it was then; the feature plan's verification status is where a reader looks for what is true now.
- **Any product's stop command.** Neither new task names one. A project documents its own, and a project that documents none is not startable.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the repository for `launch-application` and confirm nothing refers to it, and search the three task files for a product name and confirm the only hits are the framework's own `$janissary` and `product/` paragraphs.
