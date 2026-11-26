<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the unhandled dangling symlink export target so the link survives and the file it names is created.

Existing Issue: Exporting to a symlink whose target does not exist yet replaces the link with a regular file instead of writing through to the file it points at. Severity: 4/10

Existing Risk: 4/10 - A user whose ssh config is a symlink to a not-yet-created file loses the link, gets a fresh config at the link path, and leaves the intended target missing so later ssh reads a different file.

Proposal Risk: 2/10 - Both live and dangling links resolve to a real path before the atomic write, and the existing error and mode behavior stays pinned by the file's tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "write through a dangling symlink export target". In writeSshConfigFile in src/plugins/hosts/ssh-config-file.ts, when lstatSync identifies a symlink and realpathSync fails because the pointed-to file is missing, resolve the link target with readlinkSync relative to the link's directory, create that target's parent directories with the same recursive 0700 mkdir, and pass the resolved path to replaceFileAtomically so the symlink survives. Keep the current behavior for a live symlink, a missing non-symlink file, an existing file's mode, and every mapped problem word. Add a case to src/plugins/hosts/ssh-config-file.test.ts that creates a symlink to a path in a missing parent directory, exports through it, and asserts the link is still a symlink, the bytes are at the resolved target, and the new file mode is 0600; the existing symlink, create-mode and write-failure cases must keep passing untouched. Verify against the symlink requirement in product/plans/complete/import-openssh-aliases-into-the-hosts-tab.md and the managed-section tests in src/plugins/hosts/ssh-config/section.test.ts.
