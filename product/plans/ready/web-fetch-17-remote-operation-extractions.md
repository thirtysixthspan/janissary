# Web fetch 17 — make room in the remote operation table and port

**Complexity: 4/10** — ~35 added lines, 5 files edited, 4 requirements, 5 test scenarios (p=4.96)

Run order: 17 of 25 in the web fetch series. Source plan: `product/plans/complete/web-fetch.md` (the "Remote transport" decision and the remote-layer bullet under "Wiring into existing registries"). Depends on `product/plans/ready/web-fetch-1-rename-web-directory.md` only for ordering: that plan rewrites the `web-search` import paths in `src/remote/filesystem/web-search-operation.ts` and `src/file-navigator/remote/port.ts`, which this plan edits next to. Subplans 2 through 16 touch none of the files named here.

The `web-fetch` remote operation (subplan 18) and its sender (subplan 19) each add lines to a file that already sits exactly at the 200-line `max-lines` limit. ESLint counts `src/remote/filesystem/operations.ts` and `src/file-navigator/remote/port.ts` at 200 each, with blanks and comments skipped. The code guidelines require extracting a cohesive piece rather than compacting (`ai/guidelines/code-guidelines.md`). This plan does those extractions, plus one helper move, with no behavior change. That way the two feature subplans only add.

## Design decisions

- **Web operations get their own table.** Create `src/remote/filesystem/web-operations.ts` exporting only `WEB_OPERATIONS`, an object holding today's `'web-search': webSearchOperation`. It is declared `as const satisfies Record<string, AnyOperationDescriptor>`, like `READ_OPERATIONS`, and imports `webSearchOperation` from `./web-search-operation.js` and the `AnyOperationDescriptor` type from `./operation-types.js`. A short comment above it says these are the path-free web operations, spread into `READ_OPERATIONS`, and that none can express a refusal. In `operations.ts`, replace the `webSearchOperation` import (`operations.ts:20`) with a `WEB_OPERATIONS` import from `./web-operations.js`, and replace the `'web-search': webSearchOperation,` entry (`operations.ts:76`, the last entry of `READ_OPERATIONS`) with `...WEB_OPERATIONS,` at the same position, so the key order of `FILESYSTEM_OPERATIONS` is unchanged. The count stays at 200. Web operations stay members of `READ_OPERATIONS`, as the source plan requires for `web-fetch`. The `satisfies Record<RemoteFilesystemOperation, AnyOperationDescriptor>` check on `FILESYSTEM_OPERATIONS` still covers `'web-search'`, so dropping it from the table fails the build. Subplan 18 adds `'web-fetch'` to `WEB_OPERATIONS` without touching `operations.ts`.
- **Shared bounded-integer checks.** `boundedInteger(value, min, max)` and `requireBoundedInteger(value, min, max)` are private to `src/remote/filesystem/web-search-operation.ts` today (lines 13 and 17). Move them, names, signatures, and bodies unchanged, to `src/remote/filesystem/argument-checks.ts` as exports, beside `requireString` and the other checks. There `requireBoundedInteger` throws that file's own `INVALID_ARGUMENTS` constant, which has the same `Invalid remote filesystem operation arguments.` text. `web-search-operation.ts` adds both names to its existing `./argument-checks.js` import. It keeps its local `INVALID_ARGUMENTS` constant, because `requireDepth` still throws it. Subplan 18's `web-fetch-operation.ts` imports the pair under these names.
- **Paste request leaves the port class.** Move the private `pasteRemote` method of `RemoteFileSystemPort` (`port.ts:225`) into `src/file-navigator/remote/port-mapped.ts` as an exported `remotePaste(request: RemoteRequest, paths: RemotePortPaths, root: string, sources: string[], destination: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy): Promise<PasteManyResult>`, placed after `remoteDeleteMany`. Its parameter order follows `remoteReplay` and `remoteDeleteMany` there. The body is unchanged. Only `destination` crosses `paths.to(root, …)`. `sources` go out as they arrived, because a clipboard source is absolute and can cross roots (see the comment above `'maps only the paste destination, leaving the sources as they arrived'` in `src/file-navigator/remote/port.test.ts`). The answer comes back unmapped. Give `remotePaste` a comment saying this, since the file header says every path crosses the mapper. `port-mapped.ts` gains type imports of `BulkConflictPolicy` from `../../protocol.js` and `PasteManyResult` from `../paste.js`. In `port.ts`, `paste` returns `remotePaste(this.requester(), this.paths, root, sources, destination, mode, policy)`. `remotePaste` joins the existing one-line `./port-mapped.js` import (`port.ts:27`), and the `BulkConflictPolicy` and `PasteManyResult` imports stay, since `moveMany` and `paste` still name them. That frees seven counted lines, so `port.ts` drops from 200 to 193.
- **Room `port.ts` must leave.** Subplan 19 adds a three-line `webFetch` method and one `WebFetchCommand` type import, plus one more line if `remoteWebFetch` makes the `./port-reads.js` import wrap. So `port.ts` must end this plan at 195 counted lines or fewer.
- **Measure first; only `file-patch` can move the baseline.** Of the ready non-series plans, only `product/plans/ready/file-patch.md` touches these files. The `subagent` plan touches none of them. Before starting, measure `operations.ts` and `port.ts` with ESLint, using the `max-lines` rule at `max: 1` to print the count, and check whether `pasteRemote` still exists. The `WEB_OPERATIONS` table and the bounded-integer move always happen, whatever the counts, because subplan 18 cites both. The paste move depends on what's there:
  - If `pasteRemote` is still a private method of `RemoteFileSystemPort`, move it as described above.
  - If `file-patch` has already landed, its plan moved `pasteRemote` into a `remotePaste` helper in `port-reads.ts` and added an `applyPatch` method, leaving `port.ts` at about 196 or 197. Leave that `remotePaste` where it is. Instead, move two more path-mapping bodies into `port-mapped.ts` on the same pattern. `rename` goes as `remoteRename(request, paths, root, relPath, name, overwrite?)`, returning `Promise<RenameItemResult>`, with the `...(overwrite !== undefined && { overwrite })` spread unchanged. `readFile` goes as `remoteReadFile(request, paths, root, relPath)`, returning `Promise<Uint8Array>`, with the `Buffer.from(result.content, 'base64')` decode unchanged. Each method becomes a one-line delegation, freeing three counted lines.
  - Either way, stop only when `port.ts` counts 195 or fewer.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Role here |
| --- | --- | --- |
| Operation table | `READ_OPERATIONS`, `FILESYSTEM_OPERATIONS` in `src/remote/filesystem/operations.ts` | Spreads `WEB_OPERATIONS` |
| `web-search` descriptor | `webSearchOperation` in `src/remote/filesystem/web-search-operation.ts` | Moves into `WEB_OPERATIONS` unchanged |
| Argument checks | `src/remote/filesystem/argument-checks.ts` (`requireString`, `stringValue`, its own `INVALID_ARGUMENTS`) | Gains the bounded-integer pair |
| Mapped port requests | `remoteReplay`, `remoteDeleteMany` in `src/file-navigator/remote/port-mapped.ts` | Model for `remotePaste` |
| Bound request sender | `requester()` on `RemoteFileSystemPort` (`port.ts:205`); the `RemoteRequest` type in `src/file-navigator/remote/port-git.ts` | What `remotePaste` takes in place of the private `request` |

## Proposed changes

- `src/remote/filesystem/web-operations.ts` (new): `WEB_OPERATIONS`.
- `src/remote/filesystem/operations.ts`: the import swap and the spread; count unchanged at 200.
- `src/remote/filesystem/web-search-operation.ts`: drop the two private functions and import them.
- `src/remote/filesystem/argument-checks.ts`: export the two functions.
- `src/file-navigator/remote/port-mapped.ts`: add `remotePaste`, or `remoteRename` and `remoteReadFile` in the `file-patch`-landed case.
- `src/file-navigator/remote/port.ts`: delegate `paste`, delete `pasteRemote`, and extend the `./port-mapped.js` import.

The three changes are independent, and each keeps typecheck and tests green on its own.

## Tests

No new behavior, so no new tests. `remotePaste` is covered end to end through the port. These existing suites pass unchanged and pin what moves:

- `src/remote/filesystem/operations.test.ts`: the `FILESYSTEM_OPERATIONS` key-list test still lists `'web-search'`. The `web-search` refusal cases cover the bounded-integer checks after the move: `numResults` and `maxChars` one below the minimum and one above the maximum, `1.5`, and `'5'`.
- `src/file-navigator/remote/port.test.ts`: `'maps only the paste destination, leaving the sources as they arrived'` pins `remotePaste`. In the `file-patch`-landed case, the `rename` cases and `'decodes a read file from its base64 payload'` pin the other two moves.
- `src/file-navigator/remote/port-mapped.test.ts`, for the neighbouring helpers.
- `src/remote/serve-file-navigator.test.ts`, whose `web-search` request still runs `webSearch` through the table.
- `src/remote/protocol.test.ts`, whose out-of-range `web-search` frame is still refused.

## Out of scope

- The `web-fetch` operation (subplan 18) and the sender (subplan 19).
- The other private integer checks in `grep-files-arguments.ts`, `glob-paths-operation.ts`, and `read-lines-operation.ts`. They stay as they are.
- Any other extraction from `operations.ts`. `file-patch`'s own `apply-patch` additions to `MUTATION_OPERATIONS` are that plan's to fit.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then run ESLint with the `max-lines` rule at `max: 1` on the edited files and confirm `operations.ts` counts 200 or fewer and `port.ts` 195 or fewer. Confirm `grep -rn "pasteRemote" src` finds nothing. On a remote tab, `web search vitest` still answers, and a copy and paste in the remote file navigator still lands in the destination folder.
