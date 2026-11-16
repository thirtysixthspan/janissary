# File patch 13: patch branch in the mutation runner, with rejection lines

**Complexity: 5/10** — 9 requirements and 16 test scenarios across the routing, pass-through, and rejection-line rules drive it, with ~35 added lines and 3 files edited (p=5.66)

Run order: 13 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-8-apply-runner-output.md` (`src/file-patch/messages.ts` and its exported `withFinalPeriod`), `./product/plans/ready/file-patch-9-command-argument-parser.md` (`isFilePatchCommandLine`, `parseFilePatchCommand`) and `./product/plans/ready/file-patch-12-filesystem-port-apply-patch.md` (`FileSystemPort.applyPatch` on both ports, `apply-patch` in `LONG_RUNNING`), and through them on subplans 1 to 7, 10, and 11. All of them must land first: today there's no `src/file-patch/` folder and no `applyPatch` on `FileSystemPort`, so none of this subplan's imports would typecheck. It depends on no later subplan.

This subplan teaches the two mutation runners in `src/file-write/tab-write.ts` to handle a patch line: parse its argument, send the patch to the tab's port, and turn a rejection into the right line. It doesn't widen `isFileMutationCommandLine` yet, so no command or loop sends a patch line here. Subplan 14 flips that switch. Keeping them apart lets this subplan be tested by calling the runners directly.

## Goal

`runFileMutation(port, root, input)` and `mutateFileInTab(managers, label, input)` handle a `file patch` line end to end, locally and remotely, and print exactly the source plan's lines.

## Design decisions

From the source plan:

- **Runner branch.** Both functions branch first on `isFilePatchCommandLine`. They parse with `parseFilePatchCommand`, returning its usage or size line without touching any port, and otherwise return `await port.applyPatch(root, patchText)`. Because `mutateFileInTab` calls `runFileMutation`, the typed command (`fileOutput` in `src/commands/file.ts`) and the local ACP path (`runWorkspace` in `src/acp/run-prompt.ts`) share the branch, and the far-side ACP loop (`runWorkspace` in `src/remote/serve-acp-loop.ts`, which calls `runFileMutation(new LocalFileSystemPort(), workspaceDir, normalized)`) gets it too. Those are the only callers of the two functions; none of them is edited here.
- **Root.** The same root as `file write`: a local tab's workspace or project directory (`localReadRoot` in `src/file-read/tab-read.ts`: `tab.workspaceDir ?? managers.tab.launchDir`), and a remote tab's remote clone only (`withRemoteTabPort` in `src/file-read/remote-tab-port.ts`), never the local disk.
- **Connection lines.** A thrown rejection whose message is one of the connection lines in `PASS_THROUGH_MESSAGES` (`src/file-write/outcome.ts`: `Remote connection unavailable.` (`REMOTE_UNAVAILABLE`), `The remote connection ended.` (`ENDED_REASON`), `The remote machine did not answer in time.` (`TIMED_OUT_REASON`), and `CLOSED_REASON`) prints that line unchanged, as write and edit do. `withRemoteTabPort` already returns `Remote connection unavailable.` itself when the tab has no channel, ready promise, or workspace, without calling the runner.
- **Other rejections.** Any other rejection prints `Patch failed: <reason>.`, with the final period not doubled when the reason already ends in one, for example `Patch failed: Invalid remote filesystem operation result.`. It makes no promise about the tree, because the far side may already have applied the patch.

Decided here:

- **Where the branch lives.** A new `src/file-patch/tab-patch.ts` exports `runFilePatch(port: FileSystemPort, root: string, input: string): Promise<string>`. It runs `parseFilePatchCommand(input)` and returns `result.error` when `'error' in result` (as `runFileMutation` does with `parseFileMutation`). Otherwise it calls `port.applyPatch(root, result.patchText)` inside a `try` and returns the awaited string. The call itself sits inside the `try`, so a synchronous throw from `LocalFileSystemPort.applyPatch` (a bug in `applyPatchText`, which reports failures as text) is caught the same way as a remote rejection. In the `catch`, an `Error` whose message passes `isPassThroughMessage` returns that message unchanged; anything else returns `patchRejectionLine(error)`.
- **`runFileMutation`.** Its first statement is `if (isFilePatchCommandLine(input)) return runFilePatch(port, root, input);`, before `parseFileMutation` runs, so a patch line never gets `Usage: file write <JSON>` (which is what `parseFileMutation` returns for any line that isn't write or edit).
- **`mutateFileInTab`.** Its first step parses: a patch line goes through `parseFilePatchCommand` and returns its `error` line when there is one; any other line goes through `parseFileMutation` exactly as today. So a malformed or oversized patch on a remote tab never opens a remote port and never sends a frame. Then it picks the root exactly as today (`localReadRoot`, else `mutateRemoteFile`), and both paths reach `runFileMutation`, which branches again and re-parses. The double parse matches what write and edit already do (`mutateFileInTab` and `runFileMutation` both call `parseFileMutation` today); don't restructure it. `mutateRemoteFile` keeps its `'file-write'` session prefix for patches too.
- **The pass-through predicate.** `PASS_THROUGH_MESSAGES` is private to `src/file-write/outcome.ts`. Export `isPassThroughMessage(message: string): boolean` from it, returning `PASS_THROUGH_MESSAGES.has(message)`. `mutationFailureLine` and `mutationRejectionLine` keep their current bodies; don't rewrite them to call it.
- **The rejection line, and why the pass-through check isn't in it.** `patchRejectionLine(error: unknown): string` goes in `src/file-patch/messages.ts`, next to subplan 8's builders, and reuses `withFinalPeriod`. It builds only the `Patch failed: <reason>.` form; the pass-through check stays in `runFilePatch`. `messages.ts` must not import `src/file-write/outcome.ts`: `outcome.ts` imports `src/file-navigator/remote/port-requests.ts`, which imports `src/remote/filesystem/operations.ts`, which (after subplan 11) imports `apply-patch-operation.ts` → `src/file-patch/apply.ts` → `messages.ts`, so that import would close a runtime cycle. `tab-patch.ts` can import `outcome.ts` safely, because nothing in that chain imports `tab-patch.ts` or `tab-write.ts`.
- **The reason.** For an `Error` with a non-empty message, the reason is `error.message`. For a non-`Error` throw, or an `Error` with an empty message, it's `fileOperationReason(error)` (`src/file-navigator/file-operation-result.ts`), as `mutationRejectionLine` does for non-`Error` throws. `messages.ts` adds `fileOperationReason` to its existing import from `../file-navigator/file-operation-result.js`; that module imports nothing, so no cycle.
- **Escaping and the period.** The reason is escaped with `displayPath` (`src/file-write/messages.ts`), as `reasonLine` in `outcome.ts` and every subplan 8 reason are, so a far-side error message holding a newline still prints on one line. Then `withFinalPeriod` runs on `Patch failed: <escaped reason>`. There is no `OUTSIDE_ROOT_REASON` mapping here (unlike `mutationRejectionLine`): `remoteApplyPatch` maps no path, so that reason can't come from the near side, and the source plan says any other rejection prints `Patch failed: <reason>.`.
- **The ill-formed remote text.** Subplan 12's `remoteApplyPatch` rejects text that isn't well-formed (a JSON `\ud800` escape gives a lone surrogate) with `Error('Not a text file')` before sending anything, which this branch prints as `Patch failed: Not a text file.`. A local tab gets subplan 8's section-specific line for the same text instead.
- **Remote root precondition.** Subplan 12 requires that a remote port's `root` be the remote workspace and adds no near-side guard. This subplan's only remote call passes `withRemoteTabPort`'s `workspace` straight through (`mutateRemoteFile`), and the far-side loop passes a `LocalFileSystemPort`, so the precondition holds. Add no guard and no other remote caller of `applyPatch`.
- **Imports.** `tab-patch.ts` imports `type FileSystemPort` from `../file-navigator/filesystem-port.js`, `parseFilePatchCommand` from `./command.js`, `patchRejectionLine` from `./messages.js`, and `isPassThroughMessage` from `../file-write/outcome.js`. `tab-write.ts` adds `isFilePatchCommandLine` and `parseFilePatchCommand` from `../file-patch/command.js` and `runFilePatch` from `../file-patch/tab-patch.js`. Every relative import carries `.js`; no re-exports.
- **File sizes.** `tab-write.ts` is at about 47 counted lines, so keep its edit to the imports and the two branches. `outcome.ts` is at about 30, `tab-patch.ts` is about 20, and subplan 8 left room in `messages.ts` for this one function.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Typed mutation runner | `runFileMutation`, `mutateFileInTab`, `mutateRemoteFile` in `src/file-write/tab-write.ts` | Root choice and remote port lifecycle; gains the patch branch. |
| Local root | `localReadRoot` in `src/file-read/tab-read.ts` | Workspace clone or launch directory. |
| Remote port lifecycle | `withRemoteTabPort`, `REMOTE_UNAVAILABLE` in `src/file-read/remote-tab-port.ts` | Remote workspace as `root`, port disposal, unavailable line. |
| Rejection lines | `mutationRejectionLine`, `PASS_THROUGH_MESSAGES`, `reasonLine` in `src/file-write/outcome.ts` | Connection lines pass through; model for the non-`Error` and escaping rules. |
| Reason mapping | `fileOperationReason` in `src/file-navigator/file-operation-result.ts` | A non-`Error` throw. |
| Path escaping | `displayPath` in `src/file-write/messages.ts` | Escapes the rejection reason. |
| Command parser | `isFilePatchCommandLine`, `parseFilePatchCommand` in `src/file-patch/command.ts` (subplan 9) | Line test, usage and size lines, `{ patchText } \| { error }`. |
| Port method | `FileSystemPort.applyPatch` (subplan 12) | Local and remote apply. |
| Line builders | `withFinalPeriod` in `src/file-patch/messages.ts` (subplan 8) | Home of `patchRejectionLine`. |
| Remote test harness | `fakeChannel()`, `managers()`, `withReply` in `src/file-write/tab-write.test.ts` | Remote patch cases. |

## Proposed changes

- New `src/file-patch/tab-patch.ts` with `runFilePatch`.
- `src/file-write/tab-write.ts`: the patch branch in both functions, and the two imports.
- `src/file-write/outcome.ts`: export `isPassThroughMessage`.
- `src/file-patch/messages.ts`: add `patchRejectionLine` and the `fileOperationReason` import.

Land all four in one change; `tab-write.ts` needs `runFilePatch`, which needs the other two.

## Tests

All in the vitest `server` project.

`src/file-write/tab-write.test.ts`, extending the existing `describe('mutateFileInTab')` and its `describe('on a remote tab')`:

- A local tab with a `workspaceDir`: `file patch {"patchText":"*** Add File: a.md\n+x"}` creates `a.md` under the workspace (not under the launch directory) and returns exactly `Patched 1 file:\nA a.md`. A tab without one applies under the launch directory.
- Local `file patch {"patchText":1}` returns exactly `Usage: file patch <JSON>` (not the write usage line) and creates nothing.
- On a remote tab: a usage line and an oversized argument (one byte over `FILE_POLICY_MAX_BYTES`, built like `writeArgument` in `src/file-write/command-size.test.ts`) return their lines with no request sent and `remote.channel.attachNavigator` never called.
- On a remote tab: a valid patch sends one request with operation `apply-patch`, a reply of `{ text: 'Patched 1 file:\nA a.md' }` is returned unchanged, nothing is written under the local roots, and the port is detached once.
- On a remote tab: with no channel it returns `Remote connection unavailable.`; closing the connection mid-request returns `The remote connection ended.`; with fake timers, after `LONG_REQUEST_DEADLINE_MS + 1` it returns `The remote machine did not answer in time.` (as the existing timed-out edit case does).
- On a remote tab: a reply of `{ text: '' }` returns `Patch failed: Invalid remote filesystem operation result.` with one period; an error reply `boom` returns `Patch failed: boom.`; a patch text with a lone surrogate (`\ud800` in the JSON) returns `Patch failed: Not a text file.` and sends no request.

New `src/file-patch/tab-patch.test.ts`, calling `runFilePatch` with stub ports built as partial objects cast `as unknown as FileSystemPort` (as the test doubles subplan 12 lists do):

- A usage line returns without calling `applyPatch`.
- Each of the four connection messages, thrown as an `Error`, comes back unchanged (`it.each` over `REMOTE_UNAVAILABLE`, `ENDED_REASON`, `TIMED_OUT_REASON`, `CLOSED_REASON`).
- A reason without a final period gets one; a reason holding a newline prints escaped on one line.
- A non-`Error` throw (`{ code: 'EACCES' }`) prints `Patch failed: ` plus `fileOperationReason`'s text and a period; an `Error` with an empty message does the same with the generic reason.
- A synchronous throw from `applyPatch` (not a rejected promise) gives a `Patch failed:` line rather than escaping.
- `root` and the decoded `patchText` reach `applyPatch` unchanged.

`src/file-write/outcome.test.ts`: `isPassThroughMessage` is true for the four lines and false for `Invalid remote filesystem operation result.`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- `npx madge --circular --extensions ts,tsx src` reports no new cycle (`import-x/no-cycle` doesn't fire in this setup, per the note in `eslint.config.mjs`).
- No manual check: no command sends a patch line here until subplan 14.

## Out of scope

- Widening `isFileMutationCommandLine`, the agent-run refusals, the typed sample, and help (subplan 14).
- The `describeLoopCommand` delegation and loop-host tests in `src/acp/run-prompt.test.ts` and `src/remote/serve-acp-loop.test.ts` (subplan 15).
- A near-side guard against a remote `root` below the workspace (subplan 12, Out of scope).
- Falling back to the local machine for a remote tab (source plan, Out of scope).
