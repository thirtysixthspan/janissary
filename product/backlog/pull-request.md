<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Bring the Roles tab user documentation in line with the new default tell grants, which it still describes without file write and file edit.

Existing Issue: The commit adds file write and file edit to the built-in tell role and updates the roles and acp specs, but the user-facing Roles tab page still says Tell starts with only the ask commands plus database create/delete and browser eval, and that Add command hides when all ten native commands are granted, so the published docs contradict the shipped defaults. Severity: 4/10

Existing Risk: 4/10 - A user reading the docs believes the default tell role cannot write or edit workspace files and is surprised when a tell prompt mutates files, or expects Add command behavior keyed to a count that is no longer true.

Proposal Risk: 1/10 - Only documentation wording changes; a future change to the defaults could drift again, which a reviewer comparing DEFAULT_ROLES with this page would catch.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "update the Roles tab user documentation for tell's default file write and file edit grants". In documentation/user-documentation/tab-types/roles.md, edit the defaults paragraph that begins "If neither your project nor your home folder has a roles.json file" so the Tell sentence says it starts with those commands plus database create/delete, browser eval, and writing and editing workspace files, and add that an existing roles file is not changed so a saved tell keeps the grants it lists (matching product/specs/roles.md); edit the paragraph beginning "The built-in ask role can read a file" so Tell also lists writing and editing files while ask stays read-only; and change "When all ten native commands are granted" to twelve in the Commands paragraph. Cross-check the wording against DEFAULT_ROLES in src/plugins/roles/roles-file.ts and NATIVE_ACP_COMMANDS in src/plugins/roles/shared.ts. No code or tests change; verify with npm run docs:build or a read-through that the page renders and that no other page under documentation/ (grep for "ten native" and "browser eval") still describes the old tell defaults.
