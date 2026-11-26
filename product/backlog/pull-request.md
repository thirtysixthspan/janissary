<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the description's command import report in the verification walkthrough, which drops the skipped clause the shared fixture produces.

Existing Issue: How to verify step 2 expects the transcript note `Imported 1 host from ~/.ssh/config.` from the shared Setup fixture, while that fixture skips two aliases so the command actually notes `Imported 1 host from ~/.ssh/config; skipped 2.`. Severity: 5/10

Existing Risk: 5/10 - A reviewer following the walkthrough sees a different transcript line than the one documented and can conclude the skip counting or the clash rule is broken when the implementation is correct.

Proposal Risk: 2/10 - The documented command path and the button path then agree with the summary formatter and its test, leaving only the unchanged implementation to maintain.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "correct the command import report in the verification walkthrough". In the pull request body's How to verify section, step 2, change the Expect transcript note to `Imported 1 host from ~/.ssh/config; skipped 2.` so it matches the shared Setup fixture, where `bad` is skipped for its invalid user and the saved `web2` is skipped as a clash. Keep the step's other assertions, the identical report in step 1, and every other paragraph of the description byte for byte; apply the body edit with gh pr edit --body-file only after the branch commit is pushed, using the body-edit route in ai/tasks/feature/work-pull-request-issue.md. Verify by reading the step against importSummary in src/plugins/hosts/import-ssh.ts and the case in src/plugins/hosts/import-ssh.test.ts that asserts `Imported 1 host from ~/.ssh/config; skipped 2.`, and confirm the pull request stays OPEN on the same head branch. No source or test file changes.


* Handle the unhandled dangling symlink export target so the link survives and the file it names is created.

Existing Issue: Exporting to a symlink whose target does not exist yet replaces the link with a regular file instead of writing through to the file it points at. Severity: 4/10

Existing Risk: 4/10 - A user whose ssh config is a symlink to a not-yet-created file loses the link, gets a fresh config at the link path, and leaves the intended target missing so later ssh reads a different file.

Proposal Risk: 2/10 - Both live and dangling links resolve to a real path before the atomic write, and the existing error and mode behavior stays pinned by the file's tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "write through a dangling symlink export target". In writeSshConfigFile in src/plugins/hosts/ssh-config-file.ts, when lstatSync identifies a symlink and realpathSync fails because the pointed-to file is missing, resolve the link target with readlinkSync relative to the link's directory, create that target's parent directories with the same recursive 0700 mkdir, and pass the resolved path to replaceFileAtomically so the symlink survives. Keep the current behavior for a live symlink, a missing non-symlink file, an existing file's mode, and every mapped problem word. Add a case to src/plugins/hosts/ssh-config-file.test.ts that creates a symlink to a path in a missing parent directory, exports through it, and asserts the link is still a symlink, the bytes are at the resolved target, and the new file mode is 0600; the existing symlink, create-mode and write-failure cases must keep passing untouched. Verify against the symlink requirement in product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md and the managed-section tests in src/plugins/hosts/ssh-config/section.test.ts.
