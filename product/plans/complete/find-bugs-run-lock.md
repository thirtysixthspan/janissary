# Exclude a second run of the spec-testing task from the same working tree

**Complexity: 2/10** — one lock, taken and released in four places in one task prompt, following the idiom `src/instance-lock.ts` already established. No code, no test, no architecture.

Two agent tabs open on one project directory can run `ai/tasks/research/find-bugs.md` at the same moment: `product/specs/agent-command-queue.md` puts the command queue on the tab, not the project, so nothing serializes them. Both runs then drive the same fixed `./temp/find-bugs/` path, the same working tree, and the same checkout of the primary branch. The run that finishes first tears down `./temp/find-bugs/` out from under the run still testing inside it, taking with it a live instance, its log, and the evidence a reproduction depends on, and the survivor goes on to file findings against an app that is no longer there. The stash rules already keep a run from popping another run's stash by locating its own entry by object ID; nothing keeps the two runs off each other's directory.

## Approach

**One working tree, one run.** A lock taken in Step 0, before anything is installed or stashed, and released on every exit path. It lives in the repository's common git directory, so two tabs on one project and two worktrees of one repository contend for the same lock rather than each ruling their own.

**The house idiom, not a new mechanism.** `src/instance-lock.ts` already writes a lock file, checks whether its holder is alive, and — the part that matters here — tells the reader which file to delete when the lock outlives its run: *"another janus instance is already running in this directory (pid …). If you're sure no other instance is running, delete … to clear the lock."* The run lock copies that shape, including its recovery advice, rather than inventing a reclaim protocol that would need process inspection the task cannot perform. A lock found by a new run stops that run with the holder named; a lock surviving its own run is cleared by a person, the same way Janissary's own instance lock is.

**Creation is the test.** A directory created with a single `mkdir` either succeeds or reports that it exists, so no read-then-write window exists for two runs to both win. The record inside it names the run — branch, commit, start time, and the stash object ID once there is one — so the run that stops can say whose lock it hit.

**The collision it prevents gets named too.** A launch that fails against Janissary's per-directory instance lock is this task's own collision, not a product defect, and belongs on the start-failure list beside a port held by another process. `src/instance-lock.ts`'s error string is the evidence, and quoting it is what lets a run recognize the case rather than reason its way to it.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — the forbidden list: a run may not proceed while another run holds the lock, and may not remove a lock it did not take.
2. `ai/tasks/research/find-bugs.md` — "Recovery on every stop": release the lock on every stop, after teardown and before the stash is restored.
3. `ai/tasks/research/find-bugs.md` — Step 0: take the lock in the repository's common git directory, write the run's record into it, stop with the holder named when it is already held.
4. `ai/tasks/research/find-bugs.md` — Step 4's start-failure list: the per-directory instance lock is an environment cause, quoted from `src/instance-lock.ts`.
5. `ai/tasks/research/find-bugs.md` — Step 8: release the lock at teardown.
6. `product/specs/task-picker.md` — one sentence: a run already in progress stops the next one, and a lock that outlives its run is cleared by hand.

## Tests

None, and none is meaningful: the change is prose, and its behavior is a `mkdir` the reader already knows. What a test could pin is the wording, and the next entry adds that for the literals this playbook quotes. The behavior is observable in a run's report — a second run stops with `Status: stopped: another find-bugs run holds …` and leaves the tree untouched — which is the acceptance anyone can check by opening two tabs.

## Out of scope

- **Reclaiming a stale lock automatically.** Deciding a lock is stale means deciding a process is gone, and the task cannot inspect processes. `janus` declines to do it too, and says which file to delete instead.
- **Excluding two runs in different clones of one repository.** They share no working tree and no scratch directory; they contend only for the primary branch, which the push path already settles by rebasing.
- **Serializing the whole run through the lock's owner.** The lock excludes, it does not queue: the second run stops and reports rather than waiting, because an unattended run waiting on another unattended run is indistinguishable from a hang.
- **The scratch path becoming per-run.** Excluding a second run is what makes one fixed path safe; a per-run path would leave two runs sharing the working tree, the stash, and the checkout.
- **Any application code.** `src/instance-lock.ts` is the model, not the subject.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: with one run's lock present, confirm a second run stops before installing or stashing and names the holder; remove the lock and confirm a run proceeds.
