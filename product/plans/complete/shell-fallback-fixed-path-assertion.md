# Pin the shell-fallback test's no-node-added assertion with a fixed shell PATH

**Complexity: 1/10** — no production lines or files, 1 requirement, 1 test scenario (p=2.32)

## Goal

The node-on-PATH fix (`product/plans/complete/bundled-acp-adapter-node-on-path.md`) promised that the interactive-shell fallback in `locateAcpCommand` keeps returning the shell's PATH untouched, without the server's node directory. The test case `resolves a command only the user's interactive shell finds, despite a banner` in `src/acp/command-path.test.ts` asserts `located.env.PATH` equals `${binDir}:${process.env.PATH}`. The stand-in shell builds that PATH from the runner's own inherited `$PATH`, which on a typical nvm setup already lists `path.dirname(process.execPath)`. On such a machine, a regression that wrapped the fallback branch's env in `withServerNode` would leave the PATH unchanged and the test would still pass. The assertion should hold on every machine.

## Design decisions

- Give `userShellAdding` an optional third parameter, the base PATH the stand-in script appends after `binDir`. Its default is the literal `$PATH`, so the script still expands the inherited PATH and every other caller keeps its current behavior.
- The fallback case passes `/nonexistent-a` as the base, so the shell's PATH is `${binDir}:/nonexistent-a`. That holds no `node`, so `withServerNode` would prepend the server's node directory if it ran on this branch.
- The stand-in still runs the command through `/bin/sh` by absolute path, and `printf` is a shell builtin, so a PATH without system directories does not stop the lookup.
- Assert the exact PATH and, separately, that it does not include `serverNodeDir`, so the intent of the check reads directly from the test.
- No production code changes. `locateAcpCommand` and `withServerNode` in `src/acp/command-path.ts`, including the realpath check from the symlinked-node fix, stay as they are.

## Implementation steps

1. `src/acp/command-path.test.ts`: add a `basePath = '$PATH'` parameter to `userShellAdding` and use it in place of `$PATH` in the script's `PATH=` assignment. Update the helper's comment to mention the base PATH.
2. In the case `resolves a command only the user's interactive shell finds, despite a banner`, call `userShellAdding(binDir, 'Welcome back', '/nonexistent-a')`, assert `located.env.PATH` is `${binDir}:/nonexistent-a`, and assert it does not contain `serverNodeDir`.
3. Confirm the test is effective: temporarily wrap the fallback branch's returned env in `withServerNode`, see the case fail, and revert the change.

## Tests

`src/acp/command-path.test.ts`:

- The shell-fallback case asserts the exact fixed PATH and its lack of the server's node directory, and fails when the fallback branch's env is passed through `withServerNode`.
- Every other case keeps passing unchanged.

## Spec and docs updates

- None. No behavior changes; `product/specs/acp.md` already says a shell-located agent gets the shell's PATH.

## Out of scope

- Any change to `src/acp/command-path.ts`.
- Pinning the PATH of the other `userShellAdding` callers, whose assertions do not depend on the runner's PATH.
