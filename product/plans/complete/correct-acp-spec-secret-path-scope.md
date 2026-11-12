# Correct the ACP spec's secret-path scope

**Complexity: 1/10** — docs-only; one spec paragraph, 0 production lines or files, no behavior change (p≈2.56).

## Issue

`product/specs/acp.md`'s `### File read` containment paragraph says a `.env` or `.env.*` file, or a path matching a run in `SECRET_DENY_PATHS` under the real home directory, returns `Secret file`. The reader is broader. `isSecretPath` in `src/file-read/read.ts` refuses any workspace-relative path whose contiguous segments contain a run from `SECRET_DENY_PATHS` — `notes/.ssh/key` and `.config/gh/hosts.yml` as well as a top-level `.ssh` — and `help/file.md` already lists credential locations such as `.ssh`, `.aws`, and `.gnupg` as refused. The home-anchored check is an additional rule, not the only one. Severity: 3/10.

## Goal

Make the ACP spec state both scopes: a `.env` or `.env.*` file and any path containing a run from `SECRET_DENY_PATHS` are refused anywhere in the workspace, and a path under the real home directory matching the same table is also refused. `Secret file: <path>.` and the typed-path rule stay verbatim. No reader or test change.

## Approach

Rewrite only the secret sentence in the `### File read` containment paragraph. Keep the surrounding containment sentence, the exact `Secret file: <path>.` code span, and `The reader names the path as typed.` unchanged. Name the workspace-wide run rule and the home-anchored rule as separate scopes:

> A `.env` or `.env.*` file and any path containing a run from `SECRET_DENY_PATHS` are refused anywhere in the workspace, and a path under the real home directory matching the same table is also refused. Any of them returns `Secret file: <path>.`. The reader names the path as typed.

Cross-check the wording against `isSecretPath` and `isUnderHomeSecret` in `src/file-read/read.ts`, the table in `src/sandbox/paths.ts`, the credential-location list in `help/file.md`, and the workspace secret cases in `src/file-read/read.test.ts`.

## Implementation steps

1. Replace the secret sentence in `product/specs/acp.md`'s `### File read` containment paragraph with the two-scope wording above, preserving `Secret file: <path>.` and `The reader names the path as typed.` verbatim.
2. Re-read `isSecretPath`, `isUnderHomeSecret`, `SECRET_DENY_PATHS`, `help/file.md`, and the `readWorkspaceLines secrets` cases in `src/file-read/read.test.ts` to confirm every stated scope matches the code.
3. Run `$janissary/scripts/run.mjs check-diff`; a docs-only diff may select no lint, typecheck, or test step.
4. Remove the resolved entry from `product/backlog/pull-request.md` and restore the comment-and-heading skeleton when it empties.
5. Promote this plan from `product/plans/ready/` to `product/plans/complete/`.

## Tests

None new. The change is prose only, and the entry requires the reader and its tests to stay untouched. `src/file-read/read.test.ts` already pins the workspace-wide secret cases — `.env`, `.env.*`, `.ssh/id_rsa`, `notes/.ssh/key`, `.config/gh/hosts.yml` — and the home-anchored cases. The verification net is a sentence-by-sentence comparison of the edited paragraph with those cases and the two reader checks.

## Spec and documentation

`product/specs/acp.md` is the fix. No `help/` change is needed: `help/file.md` already describes the workspace-wide `.env` and credential-location rule. No `documentation/user-documentation/` page describes secret-path scope.

## Out of scope

- Changing `src/file-read/read.ts`, `src/sandbox/paths.ts`, or any reader test.
- Editing `help/file.md` or adding user documentation.
- Changing the ACP tool loop, typed `file read`, or remote behavior.

## Verification

- The `### File read` paragraph states both scopes and keeps `Secret file: <path>.` and `The reader names the path as typed.` verbatim.
- The stated scopes match `isSecretPath`, `isUnderHomeSecret`, `SECRET_DENY_PATHS`, `help/file.md`, and the existing `read.test.ts` secret cases.
- `$janissary/scripts/run.mjs check-diff` passes.
- `product/backlog/pull-request.md` contains only its leading comment and `# pull-request` heading.
