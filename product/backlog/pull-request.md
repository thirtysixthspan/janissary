<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the planned strict `files print` completion behavior after its single tab target.

Existing Issue: `completeFilesCommand` returns `null` for the `none` slot after `files print <tab>`, so `completeCommandLine` falls through to ordinary filesystem completion even though the print form accepts exactly one tab name. Severity: 2/10

Existing Risk: 2/10 - Pressing Tab after a complete print command offers unrelated cwd paths and makes an invalid extra argument look supported.

Proposal Risk: 1/10 - Keeping the print slot handled with an empty match list prevents fallback; a regression would be visible in a focused completion test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "stop files print completion after its tab target". In `src/completion/files.ts`, distinguish the `none` slot used after a complete or over-argument `print` form from the `trailingPath` slot used by valid open forms, returning the unchanged input with no matches for `none` while retaining filesystem fallback for `trailingPath`. Add cases to `src/completion/files.test.ts` for `files print navigator ` and an extra argument after the target, asserting that neither offers filesystem candidates; keep the existing print-target completion and ordinary trailing-root path completion cases passing.
