# One descriptor table for the remote filesystem protocol's seventeen operations

**Complexity: 7/10** — one new descriptor table plus a helpers module, four existing modules rewired to read from it, and no behavior change anywhere. Large because it touches every layer the protocol passes through (decode, validate, refuse, dispatch), but bounded: one subsystem, seventeen operations, and an existing test suite on both sides of the channel that must keep passing unchanged.

The seventeen remote filesystem operations are spelled out separately in seven places:

| List | Where |
|---|---|
| The `RemoteFilesystemOperation` union | `src/remote/protocol.ts` |
| The `OPERATIONS` set | `src/remote/frame-decode-filesystem.ts` |
| The `validArguments` switch | `src/remote/frame-decode-filesystem.ts` |
| The `decodedArguments` switch | `src/remote/frame-decode-filesystem.ts` |
| The `requestPaths` switch | `src/remote/filesystem-refusal.ts` |
| The `ROOT_DESTINATION_OPERATIONS` set | `src/remote/filesystem-refusal.ts` |
| The `UNCLASSIFIABLE_OPERATIONS` set | `src/remote/filesystem-refusal.ts` |

plus the `dispatch` switch in `src/remote/serve-file-navigator.ts`. Adding an operation means editing all of them, and forgetting any one fails quietly rather than at compile time.

The `requestPaths` fall-through is the sharp edge. Its `default` returns only `[args.path ?? args.destination ?? '']`, so a new operation carrying paths under any other key — a `sources` array, a `from`/`to` pair — passes the containment check without a single path being tested against `containedPath`, silently losing the workspace-containment guarantee that is the whole point of the far-side validator.

## Goal

Each operation is described once, in one entry, naming its argument validator, its decoder, its path extractor, how a refusal is answered, and what it dispatches to. A missing entry is a compile error, and there is no fall-through for a new operation to land in.

## Design decisions

**The union stays the source of truth; the table is checked against it.** `FILESYSTEM_OPERATIONS` is declared `satisfies Record<RemoteFilesystemOperation, OperationDescriptor>`, exactly the pattern `CLIENT_METHOD_CONTRACTS` already uses against `ClientMessage['method']`. Adding a member to the union without a table entry fails the build, and every consumer then reads the table instead of restating the list. Inverting it — deriving the union from the table's keys — would put the wire contract downstream of a module that imports a filesystem port, which is backwards for a protocol definition.

**No `default` branch anywhere, because there is nothing left to fall through.** Each descriptor's `paths` is written for that operation's own argument keys. That is what closes the containment hole: a new operation cannot inherit a wrong extractor, because it has no extractor at all until someone writes one.

**One entry per operation, even though the fields serve different layers.** Splitting by concern is what produced seven lists. The table is grouped into two consts in one module purely to respect the 200-line file limit, merged into one `satisfies`-checked object — every operation still appears exactly once, and the compile check is on the merged result.

**`run` takes a context, not the server object.** `RemoteFileNavigators.dispatch` reaches `this` for four session-scoped helpers (`watch`, `unwatch`, `git`, `readFile`) and one argument mapper (`pasteSources`). The descriptor's `run(context, args)` receives those as bound closures alongside `root` and `filesystem`, so the table stays a plain data module with no knowledge of the server class, and the class keeps its session bookkeeping private.

**Type-only imports from `protocol.ts`.** The table imports `RemoteFilesystemOperation` and `RemoteFilesystemArguments` as types, which are erased, so no runtime cycle is introduced even though `protocol.ts` transitively imports the decoder that reads the table. `frame-decode-filesystem.ts` already imports from `protocol.ts` exactly this way.

**Refusal shape stays a field, not a second set.** `UNCLASSIFIABLE_OPERATIONS` becomes the absence of a `refusal` field on the descriptor — an operation whose result type cannot carry a reason simply does not name one, and `refusalFor` reports it as unclassified. That keeps the contract stated in the port interface (a method's failure channel decides how a refusal travels) expressed as one field per operation rather than a membership list to keep in sync.

**The argument predicates move out, unchanged.** `stringValue`, `stringArray`, `policy`, `history`, and friends go to their own module so both the table and the decoder can use them without either importing the other. They are copied verbatim — this change must not alter what validates.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `satisfies Record<Union, …>` pattern this table copies | `CLIENT_METHOD_CONTRACTS` in `src/client-message.ts` |
| The operation union | `RemoteFilesystemOperation` in `src/remote/protocol.ts` |
| The argument predicates to move verbatim | `src/remote/frame-decode-filesystem.ts` |
| The refusal shapes and the reason string | `src/remote/filesystem-refusal.ts`, `src/file-navigator/file-operation-result.ts` |
| The containment check | `containedPath` in `src/file-navigator/batch-paths.ts` |
| The port every `run` dispatches to | `FileSystemPort` in `src/file-navigator/filesystem-port.ts` |
| Decode coverage for valid, malformed, and unknown-operation frames | `src/remote/protocol.test.ts` |
| End-to-end coverage of every operation and every refusal | `src/remote/serve-file-navigator.test.ts`, `src/remote/file-navigator-refusal-contract.test.ts` |

## Implementation steps

1. **New `src/remote/filesystem-argument-checks.ts`.** Move `nonEmptyString`, `stringValue`, `stringArray`, `policy`, `isRecord`, `moveEntry`, `historyStep`, and `history` out of `frame-decode-filesystem.ts` verbatim, and add the small `optionalPolicy` decode helper the table's two policy-carrying entries share.

2. **New `src/remote/filesystem-operations.ts`.** Declare `OperationContext` and `OperationDescriptor`, then the seventeen entries — grouped as two consts merged into one `FILESYSTEM_OPERATIONS` declared `as const satisfies Record<RemoteFilesystemOperation, OperationDescriptor>`. Each entry's `valid`, `decode`, `paths`, `rootDestination`, `refusal`, and `run` are lifted from the corresponding arm of the switch or set that holds them today, unchanged.

3. **`frame-decode-filesystem.ts`: read the table.** `OPERATIONS` becomes a membership test over the table's keys; `validArguments` and `decodedArguments` become table lookups. The `write-file` base64 decode, the reply decoding, and the open/close/event branches are untouched.

4. **`filesystem-refusal.ts`: read the table.** `requestPaths`, `ROOT_DESTINATION_OPERATIONS`, and `UNCLASSIFIABLE_OPERATIONS` are deleted in favour of the descriptor's `paths`, `rootDestination`, and `refusal`. `refusedPaths` and `refusalFor` keep their signatures, so `serve-file-navigator.ts`'s refusal gate does not move.

5. **`serve-file-navigator.ts`: dispatch through the table.** `dispatch` builds an `OperationContext` from `this` and calls `FILESYSTEM_OPERATIONS[frame.operation].run(context, frame.args)`. `watch`, `unwatch`, `git`, `readFile`, `pasteSources`, and the session/watcher bookkeeping stay exactly as they are — only the seventeen-arm switch goes.

## Tests

- `src/remote/filesystem-operations.test.ts` (new) — the table's own guarantees, which are what the change exists to provide: every member of the operation union has an entry (iterated from the table, cross-checked against a literal list of all seventeen, so a union member silently dropped from *both* is still caught); every entry's `paths` extractor returns the paths that entry's own arguments actually carry, asserted per operation from a representative argument record — this is the case that pins the closed containment hole; no entry accepts an argument record its `valid` should reject; and `decode` never returns a key the operation does not declare.
- `src/remote/protocol.test.ts` — passes **unchanged**. It is the decode contract, and this change must not alter what decodes.
- `src/remote/serve-file-navigator.test.ts` and `src/remote/file-navigator-refusal-contract.test.ts` — pass **unchanged**. Between them they exercise every operation end to end and every refusal shape, so they are the regression net for both the dispatch rewiring and the refusal rewiring.

## Out of scope

- **Changing the wire format, the operation set, or any argument shape.** Nothing a client sends or receives changes.
- **Altering what validates or what refuses.** Every predicate and every refusal shape is carried over as written; the tests above are what hold that.
- **The client-side `RemoteFileSystemPort` request builders.** They name operations one call at a time rather than as a list, so they are not one of the parallel lists, and a table-driven client is separate work.
- **Applying the same treatment to the non-filesystem remote frames** (spawn/input/resize/kill, the ACP family). They have their own shapes and are not part of this item.
