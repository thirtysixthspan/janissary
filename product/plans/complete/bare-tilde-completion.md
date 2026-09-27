# Complete a bare `~` into the home directory instead of dropping the tilde

**Complexity: 2/10** — `splitToken` in `src/completion/helpers.ts` learns to treat a bare `~` as `~/` and to report the typed directory prefix; `completeFilePath` in `src/completion/fs.ts` rebuilds the token from that prefix. No client, protocol, or handler change.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): "Complete a bare `~` in the command line into the home directory, instead of dropping the tilde and completing a relative path". Pressing Tab on a lone `~` replaces it with the home directory's own base name as a relative path (`~` became `home/` under a home directory named `home`), where the spec promises tilde expansion to the user's home directory.

## Reproduction

A new test file, `src/completion/tilde.test.ts`, mocks `homedir()` to a temporary `<root>/home` holding `home-alpha.txt`, `home-bravo/` and `.zebra.txt`, with a sibling `<root>/home-sibling/` and a separate working directory `<root>/work`. Run with `npx vitest run --project server src/completion/tilde.test.ts` against `master`:

- `splitToken('~', cwd)` returned `{ dir: '<root>', base: 'home' }` — the home directory's *parent* and the home directory's own name.
- `completeCommandLine('ls ~', 4, cwd)` returned `ls home` — the tilde gone, completed to the common prefix of `home` and `home-sibling` from the parent directory.
- `completeCommandLine('cd ~', 4, cwd)` with one visible entry in home returned `cd home`, not `cd ~/home-bravo/`.
- `~/` + Tab returned `ls ~/home-` as expected, so only the slash-less token is affected.

## Root cause

1. `splitToken` expands a leading `~` to `homedir() + token.slice(1)` and then splits the *expanded* string at its last slash. For a bare `~` that slash is the one inside the home directory's own path, so the directory to list is home's parent and the partial is home's base name.
2. `completeFilePath` rebuilds the completed token from `token.slice(0, token.length - base.length)`. With `base` taken from the expanded path and longer than the typed token, that slice is empty and the tilde is dropped.

## Correct behavior

Per `product/specs/tab-completion.md`, path completion "Supports tilde (`~`) expansion to the user's home directory", and the bug report expects a bare `~` to behave as `~/` does. `~` + Tab lists the home directory's entries with the tilde intact: several matches extend the line to `~/` plus their common prefix, and a single match completes to `~/<entry>` followed by `/` for a directory or a space for a file.

## Approach

- In `splitToken`, treat a token that is exactly `~` as `~/`, split the *typed* token at its last slash, and expand a leading `~/` only in the directory part. Return the typed directory prefix alongside `dir` and `base`.
- In `completeFilePath`, rebuild the token from that reported prefix instead of subtracting `base.length` from the typed token.
- A token such as `~name` (no slash) is no longer expanded against the home directory; it completes as a literal name in the working directory. Before this fix it expanded to a nonexistent path (`<home>name`) and completed nothing useful.

## Implementation steps

1. `src/completion/tilde.test.ts`: the failing tests from the reproduction — `splitToken('~')` lists the home directory with prefix `~/`, `~/home-b` keeps `~/` as its prefix, `ls ~` completes to `ls ~/home-`, `ls ~/` gives the same, and a home directory with one visible directory completes `cd ~` to `cd ~/home-bravo/`.
2. `src/completion/helpers.ts`: rewrite `splitToken` as described, returning `{ dir, base, prefix }`.
3. `src/completion/helpers.test.ts`: add `prefix` to the existing `splitToken` expectations.
4. `src/completion/fs.ts`: use `prefix` from `splitToken` in place of `typedDirPrefix`.
5. Run `./scripts/run.mjs check-diff` after each step.

## Regression test

`src/completion/tilde.test.ts` — "completes into the home directory with the tilde intact" (and its siblings in the same file): fails on `master` (`ls home`), passes with the fix.

## Specs and docs

`product/specs/tab-completion.md`: state that a bare `~` completes into the home directory the same as `~/`, keeping the tilde. `help.md` and `documentation/user-documentation/` do not describe tilde completion, so neither changes.

## Out of scope

- `~user` expansion to another account's home directory.
- Multi-line token boundaries in completion (a separate backlog entry).
