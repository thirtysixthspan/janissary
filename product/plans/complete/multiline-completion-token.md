# Complete the token on a continuation line of a multi-line command

**Complexity: 1/10** — `readCompletionCursor` in `src/completion/cursor.ts` adds `'\n'` to the characters that end a token. No client, protocol, or handler change.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): "Make Tab complete the token on a continuation line of a multi-line command, as it does on the first". Tab does nothing on the second and later lines of a command typed with Shift+Enter. `ls`, Shift+Enter, `do`, Tab leaves the line as `ls\ndo` where the same `do` on one line completes to `docs/`.

## Reproduction

Failing tests added before the fix, run with `npx vitest run --project server src/completion/cursor.test.ts src/completion/index.test.ts` against `master`:

- `readCompletionCursor('cat alpha.md\nbe', 15)` reported `tokenStart: 4` (the whole `alpha.md\nbe` as the token) instead of `13`.
- `completeCommandLine('ls\nsrc', 6, dir)` returned `ls\nsrc` unchanged, where `srcdir/` is the only match in `dir`.
- `completeCommandLine('msg\nbi', 6, noFiles, ['janus', 'bilal', 'aslan'])` returned `msg\nbi` unchanged instead of `msg\nbilal `.

## Root cause

The client and server disagree about where a token starts. `handleTabCompletion` in `web/src/agent-tabs/command-input/command-completion.ts` ends a token at the last space, tab, or newline, so it sends the request for the continuation line's text. `readCompletionCursor` computes `tokenStart` from the last space and tab only. For `ls\ndo` the server's token is the whole `ls\ndo` and `preceding` is empty, so no handler matches an empty command and `completeFilePath` looks for a directory entry starting with `ls\n`, finds none, and returns the line unchanged.

## Correct behavior

Per `product/specs/tab-completion.md`, "the shell attempts to complete the token immediately preceding the cursor". On a continuation line that token starts after the newline. The command and argument position still come from every word before the token, across lines, because a multi-line command is still one command: `ls` + Shift+Enter + `do` completes to `docs/`, and `msg` + Shift+Enter + `bi` completes the recipient to `bilal `.

## Approach

Add `before.lastIndexOf('\n')` to the `Math.max` that computes `tokenStart`. `preceding` already splits on `/\s+/`, which includes newlines, so earlier lines' words count toward the command and argument index without further change. `replaceToken` rebuilds the line from `before.slice(0, tokenStart)`, so the newline is preserved.

## Implementation steps

1. `src/completion/cursor.test.ts`: add a newline-boundary case asserting `tokenStart`, `token`, `preceding`, `command`, and `argumentIndex` for `cat alpha.md\nbe`.
2. `src/completion/index.test.ts`: add a continuation-line path case (`ls\nsrc` → `ls\nsrcdir/`, `cat report.txt\nuni` → `cat report.txt\nunique.log `) and a recipient case (`msg\nbi` → `msg\nbilal `).
3. `src/completion/cursor.ts`: add `'\n'` to the boundary scan.
4. Run `./scripts/run.mjs check-diff`.

## Regression test

- `src/completion/cursor.test.ts` — "treats a newline as a token boundary and counts the words of earlier lines".
- `src/completion/index.test.ts` — "completes the token on a continuation line of a multi-line command" and "completes a recipient typed on the line after msg".

All three fail on `master` and pass with the fix.

## Specs and docs

`product/specs/tab-completion.md`: state that on a continuation line the token starts after the newline, and that words on earlier lines still set the command and argument position. `help.md` and `documentation/user-documentation/` do not describe completion token boundaries, so neither changes.

## Out of scope

- Client changes: the client's token slice and its guard against completing an empty token on a new line are already correct and tested.
- Treating a continuation line as a separate command with its own command word.
