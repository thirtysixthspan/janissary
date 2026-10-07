<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Security: prevent a remote `files` path from listing a symlink target outside the provisioned workspace.

Existing Issue: `remoteCwd` checks normalized path strings, and the far-side refusal uses the same lexical containment check, so a target like `<workspace>/link` passes even when `link` points to a directory outside the workspace; `readDirectory` then follows it. Severity: 7/10

Existing Risk: 7/10 - A remote workspace can contain a symlink to sensitive host data, and `files link` can expose that directory through the remote navigator despite the stated workspace boundary.

Proposal Risk: 2/10 - Far-side real-path containment would refuse reads that cross the workspace boundary while preserving ordinary in-workspace navigation.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1576: prevent remote file navigator paths from following symlinks outside the workspace". In `src/remote/serve-file-navigator.ts` and its path-refusal helpers, check existing path components against the canonical workspace root before dispatching filesystem operations, so an in-workspace symlink cannot redirect a remote tree read outside the workspace. Keep missing in-workspace destinations usable for creation. Add server tests using a symlink inside the workspace that points to an outside directory and assert that listing it is refused without returning its entries; also retain a positive test for an ordinary directory. Update the remote file navigator spec to state that symlink targets outside the workspace remain inaccessible, run the scoped checks, and record the fix in a completed plan.


* Plan fidelity: support the planned `files <path> in <remote tab>` command form.

Existing Issue: The plan specifies that a remote path can be written before the `in <label>` clause, but `parseFileNavigatorArgs` only consumes `in <label>` at the start of the argument tail, so the specified form is treated as a path containing the words `in` and the label. Severity: 4/10

Existing Risk: 4/10 - A user following the plan's command form gets no intended remote path, although the existing `files in <label> <path>` ordering works.

Proposal Risk: 1/10 - Accepting and testing the planned clause order makes the stated remote-target workflow work without changing the existing ordering.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1576: support a path before the remote in clause". Extend `src/file-navigator/args.ts` to recognize a trailing `in <label>` after the path while preserving the current leading-clause grammar, and make `openFilesCommand` pass the extracted path and target label to the same remote path resolver. Add parser and command tests for a relative path, the existing leading `in` form, and a missing target label. Update `product/specs/file-navigator-tab.md` and the PR's own plan with the accepted syntax, run the scoped checks, and record the fix in a completed plan.


* Technical debt: bring `openFilesCommand` back within the configured cognitive-complexity limit.

Existing Issue: The new remote/local routing branches raise `openFilesCommand` to cognitive complexity 16 against the configured limit of 15, producing a lint warning in the PR gate. Severity: 3/10

Existing Risk: 4/10 - Further path cases will add branches to an already warning-level function, making the command harder to change without altering existing local behavior.

Proposal Risk: 2/10 - Extracting the root-selection decision into a focused helper keeps the command dispatcher straightforward while retaining its existing tests.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1576: reduce files command routing complexity". Extract the local-versus-remote target resolution from `src/file-navigator/open-command.ts` into a small helper with a result that distinguishes a resolved root from a refusal. Keep local `~`/`$root` expansion and remote POSIX containment in their current owning paths. Add or adjust unit cases in `src/file-navigator/open-command.test.ts` for local and remote roots, then run the scoped checks and record the refactor in a completed plan.
