# Extract remote item creation to make room for grep
**Complexity: 4/10** — ~18 added production lines across 2 existing files, 6 behavior-preservation requirements and 12 scenarios, with 1 new function (p=5.02380).

## Dependencies

Depends on: none (file glob has already landed). Source: `product/plans/complete/file-grep.md`.

## Goal and decisions

Make the source-required space for `RemoteFileSystemPort.grepFiles` through a behavior-preserving extraction. The remote protocol decision at `product/plans/complete/file-grep.md:109`, `remoteCreateItem`, names this move. Its conditional instruction is resolved: glob has landed and `port.ts` is exactly 200 lint-counted lines, so extraction is mandatory.

This plan can land independently of the grep foundations. Complete it before plan 12 adds the `FileGrepArgs` import and one-statement `grepFiles` delegation; neither addition belongs in this refactor.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Creation implementation and its only callers | `src/file-navigator/remote/port.ts:221`, `createItem`; `:170`, `createFile`; `:174`, `createDirectory` | Move the private implementation and change both delegations together. Preserve their public signatures. |
| Mapped-operation home and precedent | `src/file-navigator/remote/port-mapped.ts:17`, `remoteStatRows`; `src/file-navigator/remote/port-moves.ts:19`, `remoteMove` | Use the existing bound-request/path-mapper split, not a new service or module. |
| Narrow request capability | `src/file-navigator/remote/port-git.ts:12`, `RemoteRequest`; `src/file-navigator/remote/port.ts:193`, `requester` | Pass the bound closure, keeping the class as the session/request owner. |
| Both path directions | `src/file-navigator/remote/port-paths.ts:6`, `to`; `:10`, `from` | Preserve POSIX workspace-relative outgoing paths and navigator-relative answers. |
| Typed creation results | `src/file-navigator/file-operation-result.ts:1`, `FileOperationResult`; `src/remote/filesystem/result-decoders.ts:75`, `'create-file'`; `:80`, `'create-directory'` | Retain the original result type and existing decoder before mapping successful replies. |

Actual ESLint `max-lines` measurement with `skipBlankLines` and `skipComments` gives `port.ts` 200 lines and `port-mapped.ts` 43 lines, leaving 157 in the helper module. The existing ten-line private method fits there with its exported declaration and type import. These are lint counts, not raw file lengths.

Public consumers at `src/file-navigator/manager/files.ts:35`, `createNavigatorFile`, and `:55`, `createNavigatorDirectory`, depend on the returned navigator-relative path or unchanged refusal reason. The far-side descriptors at `src/remote/filesystem/operations.ts:143`, `'create-file'`, and `:150`, `'create-directory'`, already provide the required operations; neither callers nor wire descriptors change.

## Proposed changes

- Export async `remoteCreateItem(request, paths, root, destination, operation)` directly from `port-mapped.ts`. In this order, the arguments are the existing `RemoteRequest`, the existing `RemotePortPaths`, a root string, a destination string, and the exact union `'create-file' | 'create-directory'`. Preserve the original return type `Promise<FileOperationResult<{ path: string }>>`. Import the three types directly from `./port-git.js`, `./port-paths.js` and `../file-operation-result.js`; the first two imports already exist.
- Await `paths.to(root, destination)` before issuing exactly one request. Retain the existing explicit file/directory branch and send only the mapped `destination` under the matching operation. Do not add validation, normalization or policy checks beyond the existing mapper.
- Return an unsuccessful `FileOperationResult` unchanged, without reading a success value or mapping a failure path. On success, return the existing success shape with only `value.path` mapped through `paths.from(root, result.value.path)`. Do not echo the typed destination or expose the far-side workspace prefix.
- Change both public creation methods to call `remoteCreateItem` with `this.requester()`, `this.paths`, their unchanged root/destination arguments and their existing operation literal. Preserve their async promise behavior. Extend the existing direct `./port-mapped.js` import, then remove the private `createItem` implementation entirely in the same change. Leave no forwarding wrapper, duplicate implementation or re-export.
- Keep session opening, request identifiers, result decoding, deadlines, disposal and channel-close settlement in the existing class/request machinery (`src/file-navigator/remote/port.ts:197`, `request`; `src/file-navigator/remote/port-requests.ts:61`, `RemotePortRequests`). Far-side error replies, closed ports, ended connections and request timeouts still become failure values through this bound request path. Unexpected mapper/workspace failures and invalid decoded replies still reject; add no catch or fallback in the helper.
- Measure both production files again after extraction using ESLint's actual count. Record the remaining `port.ts` capacity and check it against plan 12's complete planned additions: its `FileGrepArgs` import, any helper-import expansion, and the formatted one-statement `grepFiles` method. Do not add grep here or assume the method alone is the whole growth. Both files must remain at or below 200. No compaction, comment removal or max-lines suppression.

## Tests

Use the existing fake-channel harness at `src/file-navigator/remote/port.test.ts:11`, `harness`, and call the public port methods. Existing tests at `:450`, `maps a created file`, `:461`, `maps a created directory`, and `:474`, `returns a create refusal`, cover both nested-root successes and file refusal. Retain these and fill missing creation cases in this suite, without adding a helper-only suite or duplicating request infrastructure.

Cover twelve production scenarios: nested-root file success; nested-root directory success; workspace-root file success; workspace-root directory success; file refusal; directory refusal; a far-side error reply; a request after disposal; in-flight connection end; request timeout; malformed successful reply; and workspace/path-mapping rejection. Successful cases assert exact operation, outgoing destination and mapped return path. Failure values retain their reason and never attempt success mapping; malformed results and mapper rejection remain rejections. Reuse the existing request lifecycle and deadline tests in `src/file-navigator/remote/port-requests.test.ts:19`, `RemotePortRequests deadlines`, for shared behavior rather than rebuilding it. Restore any scoped mocks or fake timers.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. During implementation confirm the port and request suites run; if related-test selection misses them, run `npm run test:server -- src/file-navigator/remote/port.test.ts src/file-navigator/remote/port-requests.test.ts`. Record actual lint counts and the measured capacity for plan 12.

For a manual end-to-end check, use a disposable remote workspace, open its navigator at a nested directory, create a file and directory, and verify they appear in that directory and the new file opens. Repeat a name to inspect the existing refusal. The fake-channel suite remains the deterministic check for transport failures.

## Out of scope

No grep import/method, grep transport, protocol bump, creation behavior change, new validation, path-mapper/request-manager edits or unrelated port refactor. This extraction exposes no new public behavior; help/spec updates remain with the later feature plans.

## Implementation constraints

Use direct `.js` imports and type-only imports in `src`, respecting the type-aware rules in `eslint.config.mjs`. Only the two existing production modules change; no new module or type is needed. Extract cohesive logic rather than compacting code. Tests are colocated and exempt from `max-lines`. No `npm run check`; use the diff-scoped development gate.
