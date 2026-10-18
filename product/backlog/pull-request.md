<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's single runscripts-directory definition by building the directory creation's path from the shared helper.

Existing Issue: The plan's design decisions say the reads and the writes all build the scripts directory from runscriptsDirectoryPath, yet makeScriptsDirectory still joins the scripts segment onto the state directory itself, so the directory the code creates and the one the helper names are defined in two places. Severity: 3/10

Existing Risk: 3/10 - A later change to the directory name in the helper alone would leave ensureScriptsDirectory and createRunscript creating the old directory, so every create would fail with ENOENT, and nothing would stop that drift until the create tests ran.

Proposal Risk: 1/10 - With one definition, the directory that is created and the directory that reads and listings use cannot diverge, and the path on disk stays the same.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "route the runscripts directory creation through the shared path helper". In src/schedule/system/runscript-files.ts, change makeScriptsDirectory so that its scripts directory comes from runscriptsDirectoryPath(projectRoot) instead of path.join(stateDir, 'scripts'). Keep its state directory check and its order unchanged, state directory first and scripts directory second, so a symlinked .janissary still throws from the state directory check before anything is created. This departs from the plan's line that makeScriptsDirectory's body does not change, and follows the plan's design decision that the reads and the writes build the directory from the helper. Leave ensureScriptsDirectory, createRunscript, and every exported signature unchanged. Existing tests that must keep passing untouched: the ensureScriptsDirectory case in src/schedule/system/runscript-files.test.ts that creates .janissary and .janissary/scripts, the symlinked state directory cases that expect a real-directory throw, and the createRunscript cases in the same file. Verify with ./scripts/run.mjs check-diff and read the diff to confirm the state directory check still runs first.


* Add tests for two error paths this diff adds without coverage, the untitled create's failure name and the delete's absent-after-race result.

Existing Issue: The untitled create's tagging of a thrown error with runscriptName and the delete's false return when unlink reports ENOENT after the existence check have no test in src/schedule/system/runscript-files.test.ts, though the plan's design decisions specify both. Severity: 3/10

Existing Risk: 3/10 - A refactor could drop the property, so the scripts tab's failure text names no file, or let an unlink race surface as an error for a file that is already gone, and nothing in the suite would fail.

Proposal Risk: 1/10 - Once both branches are pinned, a later change to either fails the suite, though the unlink race itself stays a timing case that the test can only simulate.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "test the untitled create's failure name and the delete's absent-after-race result". Add two cases to src/schedule/system/runscript-files.test.ts without changing production code. First, in a plain temporary project, make .janissary/scripts/untitled.rs a dangling symlink: nextFreeName reads the link as free and returns untitled.rs, the exclusive write in createRunscript fails with EEXIST, and readRunscript rejects the link as not a regular file, so newUntitledRunscript must throw an error whose runscriptName is untitled while the link stays in place. Assert both. Second, for the unlink race, mock node:fs the way the file already mocks next-free-name, with unlinkSync wrapped in vi.fn over the real implementation through importOriginal, set one mockImplementationOnce that throws an error with code ENOENT, and assert deleteRunscript returns false for a regular runscript whose existence check passed. Keep the default pass-through so every other case still runs the real unlink. Existing cases that must stay untouched: the untitled create cases, the clone case that throws on a dangling symlink at the target, and the delete cases, which must keep passing against the real filesystem.
