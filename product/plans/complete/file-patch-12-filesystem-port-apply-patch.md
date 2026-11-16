# File patch 12: `FileSystemPort.applyPatch` on the local and remote ports

**Complexity: 5/10** — ~30 added lines, 5 files edited, 8 requirements, 13 test scenarios (p=5.66)

Run order: 12 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-8-apply-runner-output.md` (`applyPatchText` in `src/file-patch/apply.ts`) and `./product/plans/ready/file-patch-11-remote-apply-patch-operation.md` (the `apply-patch` operation, its `{ patchText: string }` argument type and non-empty `{ text }` result decoder, and protocol 44). Through them it also depends on subplans 1 to 7 and 10. All of them must land first: today there's no `src/file-patch/` folder and no `'apply-patch'` member in `RemoteFilesystemOperation`, so neither the local method's import nor the remote `request('apply-patch', …)` call nor the `LONG_RUNNING` entry would typecheck. This subplan depends on no later one.

This subplan gives the filesystem port a multi-file transaction. A local port runs the patch in place, and a remote port sends it as one `apply-patch` request. After this lands, any code holding a `FileSystemPort` can apply a patch, and subplans 13 and 14 make the `file` command do exactly that.

## Goal

`FileSystemPort.applyPatch(root, patchText): MaybePromise<string>` exists on the interface in `src/file-navigator/filesystem-port.ts`, `LocalFileSystemPort.applyPatch` calls `applyPatchText`, and `RemoteFileSystemPort.applyPatch` (`src/file-navigator/remote/port.ts`) delegates to a new `remoteApplyPatch` in `src/file-navigator/remote/port-reads.ts`.

## Design decisions

From the source plan:

- **Interface.** `applyPatch(root: string, patchText: string): MaybePromise<string>`. The returned string is the whole output: the success report or a failure line.
- **Local.** `LocalFileSystemPort.applyPatch(root, patchText)` returns `applyPatchText(root, patchText)` synchronously.
- **Remote.** `remoteApplyPatch(request, root, patchText)` sends `apply-patch` with `patchText` base64-encoded UTF-8, as `remoteEditFile` sends its strings (`Buffer.from(…, 'utf8').toString('base64')`), and resolves to the reply's `text`. Patch paths are root-relative on both sides: the remote tab's workspace (`withRemoteTabPort`'s `workspace`) is the far side's `context.root`. So the text is sent unchanged and every containment check happens on the far side. The near side doesn't map or check any section path.
- **Deadline.** `src/file-navigator/remote/port-requests.ts` adds `apply-patch` to its `LONG_RUNNING` set, beside `edit-file`, so a patch gets the long request deadline (`LONG_REQUEST_DEADLINE_MS`). Subplan 11's `remote-server.md` paragraph already describes that deadline, so this subplan edits no spec.
- **Connection failures.** A closed or ended session, or a timeout, rejects with the existing reasons (`CLOSED_REASON`, `ENDED_REASON`, `TIMED_OUT_REASON`), because `apply-patch` names no `refusal` (`unavailableResult` and `settle` in `port-requests.ts` throw for such operations). An error reply from the far side (for example a throw inside `applyPatchText`, which subplan 11 turns into an error reply) rejects with the reply's message the same way. Subplan 13 prints those lines unchanged and never falls back to the local disk.
- **The size limit.** `src/file-navigator/remote/port.ts` is at 194 counted lines (eslint `max-lines` with `skipBlankLines` and `skipComments`). Adding `applyPatch` there is three lines, so in the same change move the private `pasteRemote` body (`port.ts`, `private async pasteRemote(`, seven counted lines) into an exported `remotePaste` helper after `remoteCreateItem` in `src/file-navigator/remote/port-mapped.ts`, taking the `requester()` and `paths` the way `remoteCreateItem` does. The public `paste` method becomes a one-line delegation. The source plan also named `createItem`, but that already moved: `createFile` and `createDirectory` delegate to `remoteCreateItem` today, and `port.ts` has no `createItem` left. After the change `port.ts` is at about 190 counted lines.
- **Test doubles.** The only implementers are `LocalFileSystemPort` and `RemoteFileSystemPort`. Test doubles typed as `FileSystemPort` (`src/file-navigator/manager/files.test.ts`, `src/file-navigator/manager/profile.test.ts`, `src/file-navigator/remote/file-cache.test.ts`, `src/plugins/origin-workspace.test.ts`, `src/editor/rename-remote.test.ts`, `src/remote/serve-file-navigator.test.ts`) all build partial objects with `as FileSystemPort` or `as unknown as FileSystemPort` casts, so they need no stub. Add one only where the compiler asks.

Decided here:

- **Ill-formed text never crosses.** `Buffer.from(text, 'utf8')` would silently turn an unpaired surrogate into U+FFFD, and the far side would then apply a different patch than the one sent. So `remoteApplyPatch` checks `patchText.isWellFormed()` first, before anything is awaited. When it's false, it rejects with an `Error` whose message is `Not a text file`, and sends nothing. Subplan 13 prints that as `Patch failed: Not a text file.`. That mirrors `remoteEditFile`'s near-side refusal of ill-formed strings (`port-reads.ts`, `if (!newString.isWellFormed()) return failureResult('Not a text file');`); it rejects rather than returning a value because the result type is a plain string with no failure shape. A local tab gets a section-specific line for the same text instead, which is acceptable because only the remote path re-encodes.
- **The `root` parameter.** `remoteApplyPatch` takes no `RemotePortPaths`: there is nothing to map. Its `root` parameter is named `_root` and kept only so the helper's signature matches the port method's, the same reason `pull(_root)` in `port.ts` gives in its comment. The order is `(request, _root, patchText)`.
- **Root precondition.** For a remote port, `root` must be the remote workspace itself, because the far side resolves the patch's paths against its `context.root`, which is the workspace. The only caller (subplan 13's `mutateFileInTab`, `src/file-write/tab-write.ts`, `withRemoteTabPort(…, (port, workspace) => runFileMutation(port, workspace, input))`) passes exactly that, and `withRemoteTabPort` (`src/file-read/remote-tab-port.ts`) builds the port from the same tab's `readyOf` and `workspaceOf`. A file-navigator tree rooted below the workspace (such as `/remote/ws/src` in `port.test.ts`'s paste case) never calls `applyPatch`. The interface method's comment states this precondition; there is no near-side guard (Out of scope).
- **Interface comment.** The new interface method gets a one-line comment saying it resolves to the patch's whole output text, with every refusal already in that text, and rejects only when the patch couldn't be delivered (a connection failure, or text a remote port can't encode), and that `root` is the tree's root, which for a remote port is its workspace. Place the method directly after `editFile` in both the interface and `LocalFileSystemPort`, and after `editFile` in `RemoteFileSystemPort`.
- **Where `remoteApplyPatch` lives.** In `port-reads.ts`, directly after `remoteEditFile`, as the source plan says, with a short comment above it giving the ill-formed rule and saying the text crosses unmapped. That file is at 85 counted lines and grows to about 92. Extend the file's header comment ("line read, glob, write and text edit") to name the patch too. It imports nothing new.
- **`remotePaste`'s shape.** `remotePaste(request, paths, root, sources, destination, mode, policy?)` with `mode: 'copy' | 'cut'` and `policy?: BulkConflictPolicy`, returning `Promise<PasteManyResult>`. Its body is `pasteRemote`'s unchanged: it maps only `destination` through `paths.to(root, destination)` and sends `sources`, `mode`, and `policy` exactly as given (a clipboard source is absolute and can cross roots, as the comment above `port.test.ts`'s `'maps only the paste destination, leaving the sources as they arrived'` case says). Add a one-line comment above it saying so. `port-mapped.ts` gains type-only imports of `BulkConflictPolicy` from `../../protocol.js` and `PasteManyResult` from `../paste.js`; it goes from 55 to about 65 counted lines.
- **`port.ts` imports.** `remoteApplyPatch` joins the existing `./port-reads.js` import and `remotePaste` joins the existing `./port-mapped.js` import. `BulkConflictPolicy` and `PasteManyResult` stay imported in `port.ts`, because `paste` and `moveMany` still name them.
- **`filesystem-port.ts` room.** It's at 192 counted lines. The import of `applyPatchText` from `../file-patch/apply.js`, the interface method, and the one-line local method add three. If `lint-files` still reports it over 200, move `LocalFileSystemPort.applyPatch`'s import and body into a one-line delegation to a `localApplyPatch` helper in `src/file-patch/apply.ts`. Don't compact the file. The import adds no cycle: `src/file-patch/` reaches `src/file-write/`, `src/file-read/policy.ts`, and `src/file-navigator/file-operation-result.ts`, none of which imports `filesystem-port.ts`.
- **Deadline comment.** In `port-requests.ts` add `'apply-patch'` right after `'edit-file'` in `LONG_RUNNING`, and add "patches" after "text edits" in the comment above `REQUEST_DEADLINE_MS` that lists the long-running kinds.
- **One commit.** All five files land together; `port.ts`'s `applyPatch` and `paste` delegations need the two helpers, and the class needs the interface method once it exists.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Port interface | `FileSystemPort`, `LocalFileSystemPort` in `src/file-navigator/filesystem-port.ts` | The new method. `MaybePromise` comes from `src/maybe-promise.ts` and is already imported there. |
| Remote port | `RemoteFileSystemPort` in `src/file-navigator/remote/port.ts` | The new method, delegating through `requester()`. |
| Remote text-edit sender | `remoteEditFile` in `src/file-navigator/remote/port-reads.ts` | Model for base64 UTF-8 text arguments and the near-side ill-formed check. |
| Extracted remote helpers | `remoteCreateItem` in `src/file-navigator/remote/port-mapped.ts` | Model and home for `remotePaste`. |
| Unused-root precedent | `pull(_root)` in `src/file-navigator/remote/port.ts` | Naming and reason for `remoteApplyPatch`'s `_root`. |
| Request deadlines | `LONG_RUNNING`, `requestDeadline` in `src/file-navigator/remote/port-requests.ts` | Add `apply-patch`. |
| Rejection for no-refusal operations | `unavailableResult` and `settle` in `src/file-navigator/remote/port-requests.ts` | Closed, ended, timed-out, and error-reply rejections, unchanged. |
| Remote tab port lifecycle | `withRemoteTabPort` in `src/file-read/remote-tab-port.ts` | Supplies the workspace that subplan 13 passes as `root`. |
| Runner | `applyPatchText` in `src/file-patch/apply.ts` (subplan 8) | The local implementation. |
| Remote port test harness | `harness()` in `src/file-navigator/remote/port.test.ts` (`sent`, `reply`, `listener`) | Remote cases, like the `editFile` lone-surrogate, close/end, and creation-deadline cases. |
| Local port temp-dir fixtures | `tempDir()` and `tree()` in `src/file-navigator/filesystem-port-policy.test.ts` | The local case. |

## Proposed changes

- `src/file-navigator/filesystem-port.ts`: the commented interface method and `LocalFileSystemPort.applyPatch`, each after `editFile`, plus the `applyPatchText` import.
- `src/file-navigator/remote/port-reads.ts`: `remoteApplyPatch` after `remoteEditFile`, and the header comment update.
- `src/file-navigator/remote/port-mapped.ts`: `remotePaste` after `remoteCreateItem`, with its two type imports.
- `src/file-navigator/remote/port.ts`: `applyPatch` after `editFile`, delegating to `remoteApplyPatch(this.requester(), root, patchText)`; `paste` delegating to `remotePaste(this.requester(), this.paths, root, sources, destination, mode, policy)`; the private `pasteRemote` removed.
- `src/file-navigator/remote/port-requests.ts`: `apply-patch` in `LONG_RUNNING` and the comment word.

Every relative import keeps the `.js` extension; no re-exports.

## Tests

All in the vitest `server` project.

`src/file-navigator/remote/port.test.ts`, a new `describe('RemoteFileSystemPort.applyPatch')` at the end of the file, using `harness()` with root `/remote/ws`:

- It sends one `filesystem-request` frame with operation `apply-patch` and exactly one argument, `patchText`, whose base64 decodes (`Buffer.from(…, 'base64').toString('utf8')`) to the original text, including a non-ASCII character and a path climbing out (`../x.md`), which proves nothing is mapped or checked near side.
- It resolves to the reply's `text` unchanged (for example `Patched 1 file:\nA a.md`).
- It rejects with `CLOSED_REASON` when the port is disposed mid-request, with `ENDED_REASON` when the listener's `onClose` fires mid-request, and with `CLOSED_REASON` without sending a frame when called after `dispose`.
- It rejects with `TIMED_OUT_REASON` only after `LONG_REQUEST_DEADLINE_MS`: with fake timers, still pending after `REQUEST_DEADLINE_MS + 1`, rejected after the long deadline, as the creation-deadline case does with `vi.useFakeTimers()`.
- An error reply (`h.reply(undefined, 'boom')`) rejects with `boom`.
- A reply of `{ text: '' }` rejects with `Invalid remote filesystem operation result.`.
- Text holding a lone surrogate (`'\u{D800}'`) rejects with `Not a text file` and no `filesystem-request` frame is sent, like the `editFile` lone-surrogate case.
- The existing `paste` case (`'maps only the paste destination, leaving the sources as they arrived'`) passes unchanged after the extraction.

`src/file-navigator/remote/port-requests.test.ts`: in the existing `requestDeadline` case, `expect(requestDeadline('apply-patch')).toBe(LONG_REQUEST_DEADLINE_MS)` beside the `edit-file` assertion.

`src/file-navigator/filesystem-port-policy.test.ts`, a new `describe('LocalFileSystemPort.applyPatch')` using its `tree()` fixture and the shared `port`: an `*** Add File: a.md` patch returns exactly `Patched 1 file:\nA a.md` synchronously (not a promise) and `a.md` exists under the root; a `*** Delete File: missing.txt` patch returns exactly `Patch failed at section 1 (Delete File: missing.txt): File not found. No files were changed.` (subplan 8's section failure line).

## Verification

- `$janissary/scripts/run.mjs check-diff`, confirming no `max-lines` error on `port.ts` or `filesystem-port.ts` and that the three test files above pass.
- No manual check: the `file` command doesn't route patches until subplan 14.

## Out of scope

- Command routing and the output lines for rejections, including `Patch failed: <reason>.` (subplan 13).
- The far-side `apply-patch` operation, its result decoder, the protocol bump, and the `remote-server.md` paragraph (subplan 11).
- Any change to `applyPatchText`'s output or rules (subplan 8).
- Running the patch in a worker (the source plan's upgrade path only).
- Falling back to the local machine for a remote tab (source plan, Out of scope).
- A near-side guard against a remote `root` below the workspace.
