# Bring the file completion doc comments up to date with grep

**Complexity: 1/10** — comment text in two existing files, with no behavior, routing, signature, or test to change; ~8 added lines across 2 files and 2 requirements give p≈3.30.

## Goal

Two comments that describe the `file` command's completion surface still present it as `file read` and `file glob` only, even though `completeFileReadCommand` now delegates `file grep` to `completeFileGrepArgument`. A maintainer reading either comment comes away with an incomplete map of the routes and can send a later grep completion change to the wrong module, or add a second grep branch that already exists.

The first is the comment above `completeFileReadCommand` in `src/completion/file-read.ts:24`. It says the function completes `file read` and `file glob`, and describes `root` as the directory "the read and the glob" resolve against.

The second is the `completeCommandLine` JSDoc in `src/completion/index.ts:38`. It carries one bullet for `file read` and one for `file glob`, with no bullet for `file grep`.

## Approach

Change only those comments. The grep handler's own comment in `src/completion/file-grep.ts:35` already states its rules precisely, so the new text points at that behavior rather than restating it in a second, drift-prone place. The routing itself is unchanged: `completeFileReadCommand` already branches on the `grep` subcommand, and `completeCommandLine` already passes `fileReadRoot` through.

Nothing in either edit changes a token the compiler, a test, or a runtime path reads. No test pins either comment.

## Implementation steps

1. **`src/completion/file-read.ts`** — replace the comment above `completeFileReadCommand` with one that names all three routes and describes `root` as the directory they all resolve against. The current text is:

   ```ts
   // Complete `file read <path> [--offset <line>] [--limit <lines>]` and `file glob`. Paths complete
   // against `root`, the directory the read and the glob resolve against; an undefined root (a remote
   // tab) offers no paths. Subcommands disabled by `policy` are not offered.
   ```

   The replacement keeps the same three sentences and adds `file grep` to the route list and to the root description:

   ```ts
   // Complete `file read <path> [--offset <line>] [--limit <lines>]`, `file glob`, and `file grep`.
   // Paths complete against `root`, the directory all three resolve against; an undefined root (a
   // remote tab) offers no paths. Subcommands disabled by `policy` are not offered.
   ```

2. **`src/completion/index.ts`** — add a `file grep` bullet after the `file glob` bullet in the `completeCommandLine` JSDoc, beside the existing two file bullets:

   ```ts
   * - For `file grep`, completes the subcommand, its seven lowercase flags, and file or directory
   *   names after `--path` against `fileReadRoot`, all before the pattern starts; with no root (a
   *   remote tab) it offers no paths. The include, exclude, and limit values, and every word once
   *   the pattern or a `--` terminator starts, get nothing.
   ```

## Tests

No new tests and none change. The behavior the comments describe is already covered by `src/completion/file-grep.test.ts`, which asserts the seven flags, the `--path` file and directory names, the include/exclude/limit suppression, the pattern and terminator boundaries, the undefined-root case, and the `completeFileReadCommand` and `completeCommandLine` routing. `src/completion/file-read.test.ts` and `src/completion/index.test.ts` stay untouched.

`$janissary/scripts/run.mjs check-diff` must pass. A comment edit that broke TypeScript syntax would fail typecheck; nothing else can move.

## Verification

- Run `$janissary/scripts/run.mjs check-diff`.
- Read the rewritten `file-read.ts` comment against `completeFileReadCommand`: the function completes `file read`, `file glob`, and `file grep`; `root` feeds `completeFilePath` for both read paths and glob `--path` directories, and feeds `completeFileGrepArgument` for grep's `--path` file or directory names; an undefined root returns `unchanged` in each case; disabled children are filtered by `policy`.
- Read the new `index.ts` bullet against `completeFileGrepArgument` and `grepArgumentState`: seven lowercase flags (`--literal`, `--word`, `--case-sensitive`, `--path`, `--include`, `--exclude`, `--limit`); flags and `--path` values are completed only in flag and path-value state, before the pattern; an undefined root returns `unchanged` for a pending `--path` value; include, exclude, and limit values return `unchanged`; a committed pattern or `--` terminator returns `unchanged`.

## Out of scope

- Any routing, signature, flag, or behavior change in `src/completion/`. The code is right; its comments lag.
- Test changes. Existing coverage already pins every behavior the comments mention.
- `product/specs/application-commands.md`, which already describes the `file grep` completion rules and needs no correction for a comment-only change.
- `help/` and `documentation/user-documentation/`, none of which describe these internal module comments.
- The `completeFileGrepArgument` comment in `src/completion/file-grep.ts`, which already matches its code.
