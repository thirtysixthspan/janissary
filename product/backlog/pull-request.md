<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the planned support for quoted tab labels in the `files in` clause.

Existing Issue: Completion offers tab labels with spaces or quotes wrapped in quotes after `in`, but the parser reads only the next whitespace-delimited raw word and does not remove quotes, so accepting such a suggestion cannot resolve that tab. Severity: 3/10

Existing Risk: 3/10 - A command targeting a valid multiword label fails or resolves against the wrong label, and the accepted completion misleads users about the supported syntax.

Proposal Risk: 1/10 - A shared quoted-label parsing path and regression tests make the target round-trip predictable; an untested quote boundary would show up in parser and completion cases.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "support quoted tab labels in files in clauses". In `src/file-navigator/args.ts`, decode a fully quoted `in` value in both leading and trailing clause positions while preserving the existing unquoted single-word form. In `src/completion/files.ts`, keep the decoded label for local-root lookup after `in` so quoted labels complete paths against the correct cwd. In `src/file-navigator/print-command.ts`, quote and escape a remote owner label when needed so `files print` emits a command accepted by the same parser. Update `product/specs/file-navigator-tab.md`, `product/specs/tab-completion.md`, and the relevant help or user-documentation text to state the quoted-label behavior. Add parser tests for quoted labels with spaces and escaped quotes in both clause positions, completion coverage for a quoted local label and its root-aware path suggestions, and a print formatter case for a remote owner label with spaces; keep the existing bare-label, trailing-path, and remote-target cases passing.


* Complete the planned strict `files print` completion behavior after its single tab target.

Existing Issue: `completeFilesCommand` returns `null` for the `none` slot after `files print <tab>`, so `completeCommandLine` falls through to ordinary filesystem completion even though the print form accepts exactly one tab name. Severity: 2/10

Existing Risk: 2/10 - Pressing Tab after a complete print command offers unrelated cwd paths and makes an invalid extra argument look supported.

Proposal Risk: 1/10 - Keeping the print slot handled with an empty match list prevents fallback; a regression would be visible in a focused completion test.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1803 "stop files print completion after its tab target". In `src/completion/files.ts`, distinguish the `none` slot used after a complete or over-argument `print` form from the `trailingPath` slot used by valid open forms, returning the unchanged input with no matches for `none` while retaining filesystem fallback for `trailingPath`. Add cases to `src/completion/files.test.ts` for `files print navigator ` and an extra argument after the target, asserting that neither offers filesystem candidates; keep the existing print-target completion and ordinary trailing-root path completion cases passing.
