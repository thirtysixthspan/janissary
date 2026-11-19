# Supplement file command with additional sub commands — 2: local `file exists`

**Complexity: 3/10** — ~55 added lines, 6 requirements, 13 scenarios (p=4.82)

Decomposed from `./product/plans/complete/supplement-file-command-with-additional-sub-commands.md`, the authoritative feature scope. This is subplan 2 of 9. It depends on subplan 1 (`./product/plans/ready/supplement-file-command-with-additional-sub-commands-1-list-stat-local.md`) for the shared one-word failure helper; subplan 4 reuses the type-word decision for the `path-exists` remote operation.

## Goal

Make `file exists <path>` answer a cheap existence and type question on a local tab with a single word. No remote channel behavior, dispatcher wiring, completion, native command registration, or docs are part of this subplan.

## Design decisions

- `file exists` prints only one word and never echoes the path. On a hit it prints the type word `file`, `dir`, or `link`; a genuinely absent path prints `missing`; a path outside the workspace or a secret file prints `forbidden`. A miss and a refusal are normal answers, not error lines. This one-word result is deliberately different from the verbose refusal lines the older `file` commands print.
- Derive the type word from the `mode` of the `RowStat` returned by `readRowStat` at `src/file-navigator/stats.ts:17`, which uses `lstat`, so a symlink answers `link` rather than the type of its target. Compare `mode & S_IFMT` with `S_IFREG`, `S_IFDIR`, and `S_IFLNK` from `node:fs`; that is the same bit-check family the row formatter of subplan 1 uses.
- Run the policy checks before the type lookup, and let them decide between `missing` and `forbidden`: first `checkLexicalPath(root, requested)` at `src/file-read/policy.ts:61`; then resolve the candidate with `canonicalPath` from `src/file-read/canonical.ts` and apply `checkRealTarget(realRoot, realTarget)` at `src/file-read/policy.ts:73` (as a glob walk does through `createRealTargetCheck` at line 79), so a symlink whose target escapes the workspace is also `forbidden`. Only a path that passes both checks reaches `readRowStat`; a `null` result there means `missing`. Return `forbidden` for both `Outside the workspace` and `Secret file` using the helper from subplan 1.
- `.git` and `.janissary` paths answer normally, as they do for `file read`. `isSecretPath` at `src/file-read/policy.ts:24` denies only `.env`, `.env.*`, and `SECRET_DENY_PATHS` runs, and `checkProtectedPath` at `src/file-read/policy.ts:90` is mutation-only, so neither check fires on those two paths. Only the containment and secret rules above make a path `forbidden`.
- Reuse the one-word failure translation helper introduced in subplan 1 rather than restating the policy-to-word mapping.
- A local tab resolves the path against its workspace directory, or the launch/project directory when it has none, using `localReadRoot` in `src/file-read/tab-read.ts:7`.
- Follow the per-subcommand shape: a pure parser that checks the literal `file exists` prefix and returns a typed path or a usage error, and a tab executor that takes `Managers`, the tab label, and the raw line, resolves the root, and returns the one-word output string. Malformed arguments print the canonical usage line `Usage: file exists <path>`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `readRowStat` | `src/file-navigator/stats.ts:17` (lstat-based `{ size, modified, mode }`, returns `null` on failure) |
| Secret rule and failure union | `isSecretPath` at `src/file-read/policy.ts:24`; `checkLexicalPath` / `checkRealTarget` / `createRealTargetCheck` at `src/file-read/policy.ts:61`, `src/file-read/policy.ts:73`, and `src/file-read/policy.ts:79`; `checkProtectedPath` (mutation-only) at `src/file-read/policy.ts:90`; `FilePolicyFailure` at `src/file-read/policy.ts:11` |
| Canonical path resolution | `canonicalPath` in `src/file-read/canonical.ts` |
| Local root rule | `localReadRoot` at `src/file-read/tab-read.ts:7` |
| One-word failure helper | introduced by subplan 1 |
| Parser and executor precedent | `src/file-read/command.ts` and `src/file-read/tab-read.ts` |

## Proposed changes

- Add `src/file-exists/` with a pure parser for `file exists <path>` and a tab executor that resolves the local root, applies containment and secret checks, then uses `readRowStat` for the type word and returns exactly one of `file`, `dir`, `link`, `missing`, or `forbidden`.
- Render the type word from the `mode` bits in the same way the row formatter from subplan 1 renders its type word; keep the decision in one place if the two subplans can share it without coupling, otherwise describe it identically in both.

## Tests

- Colocated parser tests beside the new module, following `src/file-read/command.test.ts`: a valid path argument, a missing argument, a repeated argument, and the exact `Usage: file exists <path>` line.
- Executor tests with a temporary directory for the local root: each of `file`, `dir`, and `link`, an absent path returning `missing`, an out-of-workspace path and a secret path returning `forbidden`, `.git` and `.janissary` paths answering normally, the root choice for a tab with a workspace and one without, and an assertion that no output line contains the path.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after the source changes and again after the tests. The dispatcher entry arrives in subplan 7, so exercise the parser and executor through colocated tests here.

## Out of scope

Remote tabs and the `path-exists` operation (subplans 4-6); `file list`, `file stat`, `file head`, and `file tail` (subplans 1 and 3); the dispatcher chain and completion (subplan 7); native command registration and agent integration (subplan 8); help, specs, and manual end-to-end checks (subplan 9).
