<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Keep the walker fail-soft when the workspace root cannot be resolved, as the plan's read-failure rule requires, instead of letting the new root realpath reject the whole walk.

Existing Issue: `walkGlob` in `src/file-glob/walk.ts` now calls `await realpath(options.root)` unguarded while building `WalkState`, so a root removed between validation and walking (the default `--path` start is the root itself) makes `walkGlob` reject, where before the repair it returned no paths with `truncated` and `timedOut` false as the subplan's "Read failures, completed" decision states. Severity: 3/10

Existing Risk: 3/10 - A rare race (workspace deleted or renamed mid-command) turns a quiet empty result into an unhandled rejection in whatever subplan 4 wires `walkGlob` into, the one failure path in the walker that is not fail-soft.

Proposal Risk: 1/10 - The rejection is caught and mapped to the same empty result as a deleted start, so the only remaining exposure is that a link check can no longer run when the root is gone, which is moot because nothing under a missing root can be listed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "keep walkGlob fail-soft when the root realpath rejects". In `walkGlob` in `src/file-glob/walk.ts`, resolve the root before building the state inside a `try`/`catch` (a small helper such as `resolveRoot(root): Promise<string | undefined>` keeps `walkGlob` flat); on rejection return `{ paths: [], truncated: false, timedOut: false }` without walking, matching the deleted-start behavior pinned by the `start: path.join(root, 'missing')` case in `src/file-glob/walk.test.ts`. Do not fall back to the unresolved `options.root` for `realRoot`, since `checkRealTarget` in `src/file-read/policy.ts` expects canonical paths and would wrongly drop in-root links under a symlinked root such as macOS's `/var`. Add a case to `src/file-glob/walk.test.ts` that removes a fresh `mkdtempSync` directory and walks with it as both `root` and `start`, expecting the empty result. Existing cases in `walk.test.ts` and `walk-modes.test.ts`, including `lists a symbolic link to a file in file mode only`, must pass unchanged. Run `$janissary/scripts/run.mjs check-diff`.


* Bring the plans' remaining link-classification sentences in line with the widened link target rule, so no complete plan still says a link to a file classifies or lists exactly like a regular file.

Existing Issue: The repair added the link target rule to `file-glob.md`'s Secret files decision and a new decision to the 3.2 subplan, but left the 3.2 subplan's "Classification with `stat`" decision saying a file target classifies as `'file'` (the code now returns `'link'`, and the new bullet directly below says so), and left `file-glob.md`'s "Symbolic links" decision ("A symbolic link to a file is listed like a file") and its walker implementation note ("a link to a file counts as a file") unqualified. Severity: 2/10

Existing Risk: 3/10 - The later file glob subplans are written from the canonical plan's decisions and test list, so an agent reading the unqualified sentences can write command-level tests or help text that promise every link to a file is listed, contradicting the shipped drop of secret and out-of-workspace targets.

Proposal Risk: 1/10 - The plan text agrees with itself and the code; what remains is only that the canonical test list does not yet name a command-level link-target case, which the edit adds.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "align the remaining plan sentences on link classification with the link target rule". In `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`, change the "Classification with `stat`" decision so a file target classifies as `'link'` (judged further by the link target check), keeping the note that the link target check was added by `file-glob-walker-link-target-check.md`. In `product/plans/complete/file-glob.md`, qualify the "Symbolic links" decision and the walker implementation note that a link to a file is listed like a file unless its resolved target is a secret file, lies outside the workspace, or cannot be resolved, pointing at the Secret files decision, and add "a symlink to a secret file or to a file outside the workspace that is omitted" beside "a symlink to a file that is listed" in the `src/file-glob/glob.test.ts` test list. Edit plan text only; no code or test changes. Run `$janissary/scripts/run.mjs check-diff`.
