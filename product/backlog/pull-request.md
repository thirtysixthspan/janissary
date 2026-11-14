<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bring the plans' remaining link-classification sentences in line with the widened link target rule, so no complete plan still says a link to a file classifies or lists exactly like a regular file.

Existing Issue: The repair added the link target rule to `file-glob.md`'s Secret files decision and a new decision to the 3.2 subplan, but left the 3.2 subplan's "Classification with `stat`" decision saying a file target classifies as `'file'` (the code now returns `'link'`, and the new bullet directly below says so), and left `file-glob.md`'s "Symbolic links" decision ("A symbolic link to a file is listed like a file") and its walker implementation note ("a link to a file counts as a file") unqualified. Severity: 2/10

Existing Risk: 3/10 - The later file glob subplans are written from the canonical plan's decisions and test list, so an agent reading the unqualified sentences can write command-level tests or help text that promise every link to a file is listed, contradicting the shipped drop of secret and out-of-workspace targets.

Proposal Risk: 1/10 - The plan text agrees with itself and the code; what remains is only that the canonical test list does not yet name a command-level link-target case, which the edit adds.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "align the remaining plan sentences on link classification with the link target rule". In `product/plans/complete/file-glob-3-sorted-walker-2-dirs-links-secrets-deadline.md`, change the "Classification with `stat`" decision so a file target classifies as `'link'` (judged further by the link target check), keeping the note that the link target check was added by `file-glob-walker-link-target-check.md`. In `product/plans/complete/file-glob.md`, qualify the "Symbolic links" decision and the walker implementation note that a link to a file is listed like a file unless its resolved target is a secret file, lies outside the workspace, or cannot be resolved, pointing at the Secret files decision, and add "a symlink to a secret file or to a file outside the workspace that is omitted" beside "a symlink to a file that is listed" in the `src/file-glob/glob.test.ts` test list. Edit plan text only; no code or test changes. Run `$janissary/scripts/run.mjs check-diff`.
