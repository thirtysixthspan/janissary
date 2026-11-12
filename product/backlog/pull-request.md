<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the ACP spec's secret-path rule, which limits `SECRET_DENY_PATHS` to the real home even though the reader refuses those segments anywhere in the workspace.

Existing Issue: `product/specs/acp.md` says a `.env` or `.env.*` file, or a path matching a run in `SECRET_DENY_PATHS` under the real home directory, returns `Secret file`, while `src/file-read/read.ts` also rejects any workspace-relative path whose segments contain a `SECRET_DENY_PATHS` run, and `help/file.md` already describes credential locations such as `.ssh`, `.aws`, and `.gnupg` as refused anywhere in the workspace. Severity: 3/10

Existing Risk: 3/10 - A developer relying on the spec can assume a workspace `.ssh` or `.aws` path is readable and narrow the reader to match the sentence later.

Proposal Risk: 1/10 - The spec and the help page agree on the workspace-wide rule, and the reader keeps enforcing it; the only remaining risk is a future divergence between the two documents.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "correct the ACP spec's secret-path scope". In `product/specs/acp.md`'s `### File read` containment paragraph, state that a `.env` or `.env.*` file and any path containing a run from `SECRET_DENY_PATHS` are refused anywhere in the workspace, and that a path under the real home matching the same table is also refused; keep `Secret file: <path>.` and the typed-path rule verbatim. Use `isSecretPath` and `isUnderHomeSecret` in `src/file-read/read.ts`, `SECRET_DENY_PATHS` in `src/sandbox/paths.ts`, and the credential-location list in `help/file.md` as the cross-check. Do not change the reader or its tests; `src/file-read/read.test.ts` already pins the workspace secret cases.
