# File glob 5 — far-side `glob-paths` remote filesystem operation

**Complexity: 5/10** — ~50 added lines, 4 files edited, 8 requirements, 12 test scenarios (p=5.65)

Run order: 5 of 9 in the file glob series. Source plan: `product/plans/complete/file-glob.md`. Depends on subplan 1 (`FILE_GLOB_MAX_LIMIT`, `FILE_GLOB_DEFAULT_LIMIT` in `src/file-glob/command.ts`) and subplan 4 (`globWorkspace`, `GLOB_TIMEOUT_MS` in `src/file-glob/glob.ts`), both already on this branch.

A remote tab must glob its remote clone and never the local disk. This subplan adds the read-only `glob-paths` operation the far side answers, registers it in the operation table, and bumps the protocol version so a peer without it is refused at the handshake. The near-side port method that sends it is subplan 6; mapping the containment refusal to a user line is subplan 7.

## Design decisions

All from the source plan, plus the containment details checked against the code:

- The operation is named `glob-paths` and is read-only. Its wire arguments are `{ pattern: string; dir?: string; hidden?: boolean; dirs?: boolean; limit?: number }`, written inline in `RemoteFilesystemArgumentsByOperation` like every other entry there; `protocol-frames.ts` does not import `FileGlobArgs`.
- `valid` and `decode` require `pattern` to be a string (any string, including empty: the parser on the near side already enforced one token), `dir` an optional string, `hidden` and `dirs` optional booleans, and `limit` an optional safe integer from 1 to `FILE_GLOB_MAX_LIMIT`. Anything else fails `valid`, so `src/remote/frame/decode-filesystem.ts:12` (`if (!descriptor.valid(record.args)) return malformed('filesystem-request')`) drops the frame; `decode` throws the standard `Invalid remote filesystem operation arguments.` when called without its validator, like `requireInteger` in `read-lines-operation.ts`.
- `decode` copies only the optional fields the frame carried, the way `read-lines` spreads `offset`/`limit` only when present (`...(args.limit !== undefined && { limit: … })`). Subplan 6 sends `hidden`/`dirs` only when true, so this keeps the decoded record's keys equal to the sent keys (the `decodes %s to the keys it carries and no others` test in `operations.test.ts` checks that for every `PATH_CASES` row).
- `paths` returns `[args.dir]` when `dir` is present, else `[]`, and the descriptor sets `rootDestination: true`. The far-side gate `refusedPaths` (`src/remote/filesystem/refusal.ts`) then applies before `run`: it exempts `''` (the root) for `rootDestination` operations, refuses a `..` escape (`containedPath`) and an in-root link or missing child below a link that resolves outside (`physicallyContainedPath` in `src/remote/filesystem/path-containment.ts`), and refuses a literal `.`. `glob-paths` names no `refusal` shape (its `{ text }` result has no failure channel, like `read-lines`), so `RemoteFileNavigators.refuse` in `src/remote/serve-file-navigator.ts` answers with an error reply carrying `OUTSIDE_ROOT_REASON` (`'The path is outside this file navigator; choose an item inside the tree'`, `src/file-navigator/file-operation-result.ts`). Subplan 7 maps that error to `Outside the workspace: <dir>.`
- How the two containment layers split the `--path` messages (decided; no special-casing in the operation):
  - `..` escape or a link resolving outside: refused by the gate as the error above, before `globWorkspace` runs.
  - A missing directory, a file, or an in-root link to a file: passes the gate, and `globWorkspace` answers `Directory not found: <dir>.` or `Not a directory: <dir>.` as a successful `{ text }` reply.
  - A missing child below an outside link: the gate refuses it (outside), where the local glob says `Directory not found`. This is accepted: the remote answer is the stricter one and reveals nothing.
  - A secret `--path` (such as `.aws`): the gate does not check secrets, so it passes, and `globWorkspace`'s secret-start branch returns `(no matches)` in-band, the same as locally.
  - An in-root link start (such as `cfg` → `.config`): passes the gate, and `globWorkspace` judges matches by their real location (`realStart`), the same as locally.
  - An absolute `dir` that lies inside the far-side root: `refusedPaths` relativizes and passes it, and `globWorkspace` answers `Outside the workspace: <dir>.` in-band (`checkLexicalPath` refuses every absolute path). Subplan 6 answers an absolute `--path` locally and never sends one.
  - `dir: ''`: exempt from the gate and globbed as the root (`resolveStart` resolves it to the root, and `walkGlob` sees `realStart === prefix`). Subplan 6's `paths.to(root, '.')` produces `''`, so a typed `--path .` reaches the far side this way rather than as a refused `.`.
- `run` calls `globWorkspace` with `context.root`, a full `FileGlobArgs` built from the decoded arguments (`dir` passed through as sent or `undefined`, an omitted `hidden` or `dirs` as false, an omitted `limit` as `FILE_GLOB_DEFAULT_LIMIT`), and a fresh deadline of now plus `GLOB_TIMEOUT_MS`, and resolves to `{ text }` holding the returned string. It does not go through `globWorkspaceCommand`, which re-parses a typed line. The descriptor's `run` already allows `MaybePromise` (`src/remote/filesystem/operation-types.ts`, `run: (context: OperationContext, args: A) => MaybePromise<R>`), and `RemoteFileNavigators.request` awaits it with `Promise.resolve(result).then(…)`, so a rejected promise becomes an error reply with `errorText(error)` and needs no extra handling here.
- The result decoder accepts exactly `{ text: string }`, beside `read-lines`.
- The standard 60-second request deadline (`REQUEST_DEADLINE_MS` in `src/file-navigator/remote/port-requests.ts`) is enough, because the far side stops at 30 seconds, so `glob-paths` is not added to the `LONG_RUNNING` set. Nothing changes in `port-requests.ts`.
- `REMOTE_PROTOCOL_VERSION` goes from 41 to 42. No branch on `origin` has bumped past 41 (checked: `origin/master` and every remote branch read 41 or lower), so 42 is free. A version-41 remote would refuse `glob-paths` as unknown after the handshake had passed, so the exact-version handshake refuses the pairing first.

## What already exists (reuse, don't rebuild)

| Piece | Where | Use |
| --- | --- | --- |
| `readLinesOperation` | `src/remote/filesystem/read-lines-operation.ts` | The model for the descriptor file: its local `INVALID_ARGUMENTS` constant, its integer predicates and `requireInteger`, the spread-only-when-sent decode, `paths`/`rootDestination: true`, and `decodeResult: resultDecoders['read-lines']`. Its predicates aren't exported; define a local limit predicate the same way, bounded by `FILE_GLOB_MAX_LIMIT`. |
| `requireString`, `stringValue`, `requireBoolean` | `src/remote/filesystem/argument-checks.ts` | Argument validation and decoding. `requireBoolean` is already used for `move`'s and `rename`'s optional `overwrite` in `operations.ts` (`...(args.overwrite !== undefined && { overwrite: requireBoolean(args.overwrite) })`), the pattern for `hidden` and `dirs`. |
| `READ_OPERATIONS` table, `FILESYSTEM_OPERATIONS` | `src/remote/filesystem/operations.ts` | Registration beside `'read-lines': readLinesOperation`; the `satisfies Record<RemoteFilesystemOperation, AnyOperationDescriptor>` forces the entry once the union grows. |
| `resultDecoders['read-lines']` | `src/remote/filesystem/result-decoders.ts` | The `{ text }` decoder pattern. |
| `RemoteFilesystemOperation`, `RemoteFilesystemArgumentsByOperation` | `src/remote/protocol-frames.ts` | The operation union and its argument map. |
| `refusedPaths`, `physicallyContainedPath`, `RemoteFileNavigators.refuse` | `src/remote/filesystem/refusal.ts`, `src/remote/filesystem/path-containment.ts`, `src/remote/serve-file-navigator.ts` | The far-side containment gate; used as is, unchanged. |
| `globWorkspace`, `GLOB_TIMEOUT_MS` | `src/file-glob/glob.ts` | The far-side walk, with its own `--path` validation and messages. |
| `FILE_GLOB_DEFAULT_LIMIT`, `FILE_GLOB_MAX_LIMIT` | `src/file-glob/command.ts` | Default and upper bound for `limit`. |
| Version history comment | `src/remote/protocol.ts` above `REMOTE_PROTOCOL_VERSION` (the `// Version 41 adds …` paragraph) | The style for the version-42 entry. |
| `Protocol version 41` paragraph | `product/specs/remote-server.md` (the last protocol-version paragraph) | The style for the version-42 paragraph. |

## Proposed changes

Land all of these in one change: adding `'glob-paths'` to the union breaks the `satisfies` in `operations.ts` and the `VALID_RESULTS` mapped type in `operations.test.ts` until the descriptor, table entry, decoder, and test rows all exist.

- `src/remote/protocol-frames.ts`: add `'glob-paths'` to `RemoteFilesystemOperation` (after `'read-lines'`) and its argument shape to `RemoteFilesystemArgumentsByOperation` (after the `'read-lines'` entry).
- New `src/remote/filesystem/glob-paths-operation.ts` exporting `globPathsOperation`, built with `descriptorFor<'glob-paths'>()` as described above. Imports use `.js` extensions: `./argument-checks.js`, `./operation-types.js`, `./result-decoders.js`, `../../file-glob/glob.js`, `../../file-glob/command.js`.
- `src/remote/filesystem/operations.ts`: import `globPathsOperation` beside the `readLinesOperation` import and register `'glob-paths': globPathsOperation` in `READ_OPERATIONS` right after `'read-lines': readLinesOperation`. The file is about 194 lint-counted lines (221 raw); the two added lines keep it under 200, so no extraction is needed. If the lint count does cross 200, move `READ_OPERATIONS` to its own module rather than compacting.
- `src/remote/filesystem/result-decoders.ts`: add a `'glob-paths'` `decodeResult<{ text: string }>` entry right after `'read-lines'`, with the same check.
- `src/remote/protocol.ts`: `REMOTE_PROTOCOL_VERSION` to 42, with a `// Version 42 adds the read-only glob-paths operation …` sentence appended after the version-41 paragraph, stating the reason above.
- `product/specs/remote-server.md`: a `Protocol version 42` paragraph after the version-41 one, naming `glob-paths`, its arguments, its `{ text }` result, the containment check on `dir` (refused as an error for an escape or an outside link; other `--path` failures answered in the text), its use of the normal request deadline, and why a version-41 peer is refused.

## Tests

- `src/remote/filesystem/operations.test.ts` (extend the existing tables, don't add parallel ones):
  - Add `'glob-paths'` to `ALL_OPERATIONS` after `'read-lines'`.
  - `PATH_CASES`: `['glob-paths', { pattern: '**/*.ts' }, []]` and `['glob-paths', { pattern: '*.ts', dir: 'src', hidden: true, dirs: true, limit: 20 }, ['src']]`. These also drive the existing `accepts a well-formed`, `extracts every path`, and `decodes … to the keys it carries` cases.
  - `INVALID_CASES`: a missing or numeric `pattern`, a numeric `dir`, a string `hidden`, a string `dirs`, and `limit` of `0`, `FILE_GLOB_MAX_LIMIT + 1`, `1.5`, and `'5'`.
  - `VALID_RESULTS`: `'glob-paths': { text: 'src/a.ts' }`.
  - A `glob-paths` case beside `accepts read-lines bounds and decodes only the integers it was sent`: accepts `limit: FILE_GLOB_MAX_LIMIT`, decodes `{ pattern }` without `hidden`, `dirs`, `limit`, or `dir` keys, and `decode` throws `Invalid remote filesystem operation arguments.` for `limit: 0`.
  - A case beside `rejects a read-lines result without string text` for `{}` and `{ text: 3 }`.
  - Add `'glob-paths'` to the expected list in `treats an empty path as the root only for the operations that accept a root destination`. The refusal-shape list is unchanged.
- `src/remote/serve-file-navigator.test.ts` (its `request` helper calls `files.request` directly, past the frame decoder, so send only well-formed args):
  - A `glob-paths` request for `**/*.txt` over a small tree returns `{ result: { text } }` with the sorted root-relative matches; the same request with `dir: ''` returns the same text.
  - A `dir` of `'../x'` is answered with `{ error: expect.stringContaining('outside this file navigator') }` and no `result`, in the shape of the existing `refuses a directory symlink that resolves outside the workspace` case.
  - A `dir` of `missing` returns `{ result: { text: 'Directory not found: missing.' } }`, and a secret `dir` such as `.aws` (created in the temp root) returns `{ result: { text: '(no matches)' } }`, showing those failures stay in-band.
- `src/remote/protocol.test.ts`: the `it('is 41', …)` pin becomes `is 42` / `toBe(42)`. The other handshake cases derive from the constant and need no edit.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual end-to-end check is possible yet: nothing sends `glob-paths` until subplans 6 and 7 land. Subplan 9 carries the end-to-end check on a remote tab.

## Out of scope

The near-side port method (subplan 6), mapping the containment error and remote connection failures to user lines and the typed command (subplan 7), and the ACP loop (subplan 8). No change to the containment gate, to `globWorkspace`, or to `port-requests.ts`. `glob-paths` never mutates and never streams partial results.
