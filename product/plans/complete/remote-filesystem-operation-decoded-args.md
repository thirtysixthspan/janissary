# Give each remote filesystem operation its own decoded-argument type

**Complexity: 6/10** — a real generics refactor (`OperationDescriptor` becomes generic over the
decoded shape, and every one of nineteen table entries gets its own inferred type argument), but it
stays inside `src/remote/`, changes no wire shape, and changes no observable behavior. No new
subsystem, no new architecture — the risk is entirely in getting TypeScript's inference to hold
across the table, not in the runtime logic.

`RemoteFilesystemArguments` in `src/remote/protocol.ts` declares sixteen optional fields shared by
all nineteen `RemoteFilesystemOperation` members. `OperationDescriptor` in
`src/remote/filesystem-operations.ts` gives each operation a `decode` that narrows the wire record to
exactly the fields that operation carries, but `paths`, `refusal`, and `run` are all typed against the
full optional record, so every `run` re-defaults what `decode` already guaranteed present — `args.path
?? ''`, `args.paths ?? []`, `args.message ?? ''`, `args.direction ?? 'undo'`, two `as HistoryStep[]`
assertions in `replay`, and so on, scattered across every operation's `run` closure.

## Goal

`OperationDescriptor<A>` is generic over the decoded shape. Every table entry infers its own `A` from
its own `decode`, and every `??` fallback and `as` assertion inside a `run` closure is gone because the
argument type already guarantees the field is present. `FILESYSTEM_OPERATIONS`'s `as const satisfies`
completeness guarantee (an operation added to the union without a table entry fails the build) is
unchanged. No wire shape changes, no runtime behavior changes — this is verified by every existing
test in the four files below passing unchanged.

## Approach

1. **`OperationDescriptor<A>` becomes generic**, with `paths`, `refusal`, and `run` taking `A` instead
   of the full `RemoteFilesystemArguments`; `valid` and `decode` keep taking the raw
   `Record<string, unknown>`, since validation and decoding both run before an `A` exists.

2. **A generic identity helper, `descriptorFor<A>(descriptor: OperationDescriptor<A>): OperationDescriptor<A>`**,
   wraps each table entry. TypeScript infers `A` per call from the entry's own `decode` return type
   (which needs no context, since `decode`'s parameter is always the fixed `Record<string, unknown>`)
   and then contextually checks that entry's `paths`/`refusal`/`run` against that inferred `A`. This is
   what makes each of the nineteen entries independently typed inside one plain object, without
   duplicating each shape as an explicit annotation. If inference does not hold for a particular entry
   (checked empirically via `check-diff`'s typecheck), that entry's `run` gets an explicit parameter
   annotation instead — a fallback, not the default.

3. **Both `READ_OPERATIONS` and `MUTATION_OPERATIONS` satisfy `Record<string, OperationDescriptor<any>>`**
   (loosened from the current unparameterized `OperationDescriptor`), and the merged
   `FILESYSTEM_OPERATIONS` satisfies `Record<RemoteFilesystemOperation, OperationDescriptor<any>>`. The
   `any` here only loosens the *satisfies check's* variance — each entry keeps its own concrete,
   narrower type in `typeof FILESYSTEM_OPERATIONS`, which is what `operationDescriptor` reads.

4. **`operationDescriptor` becomes generic over the operation key**:
   `function operationDescriptor<K extends RemoteFilesystemOperation>(operation: K): (typeof FILESYSTEM_OPERATIONS)[K]`.
   A caller with a literal or narrowed key gets back that operation's exact descriptor type; a caller
   with the full union key (the common case — `frame.operation` in the dispatch path) gets back a union
   of descriptor types, whose members are individually well-typed but cannot be *called* without first
   re-establishing the pairing between operation and argument that the caller already knows holds at
   runtime (the frame's `operation` and `args` always agree, because `decode` produced `args` from that
   same `operation`'s table entry) but that the type system cannot see across the union.

5. **Three call sites cross that boundary** and need one explicit, narrow `as never` per call — a
   deliberate, single-line acknowledgment that the operation/argument pairing is runtime-verified, not
   type-provable, rather than the `??`/`as` fallbacks scattered through every `run` today:
   - `RemoteFileNavigators.dispatch` in `src/remote/serve-file-navigator.ts` (the `run` call)
   - `refusedPaths` in `src/remote/filesystem-refusal.ts` (the `paths` call)
   - `refusalValueFor` in the same file (the `paths` and `refusal` calls)

6. **`filesystem-refusal-shapes.ts` needs no changes.** Every refusal-shape helper (`refusedItem`,
   `refusedMoveMany`, `refusedPaste`, `refusedDeleteMany`, `refusedReplay`) is already typed against the
   full `RemoteFilesystemArguments`, and every operation's decoded `A` is a required-fields narrowing of
   that same shape — so a function declared to accept the wide type remains a valid implementation of
   the narrower `refusal?: (args: A, ...) => unknown` slot for any `A`, with no change needed. This is
   the "left on the wire record where it genuinely handles any operation" half of the proposal.

7. **`replay`'s decoder returns `HistoryStep[]` for `undoStack`/`redoStack`** instead of `unknown[]`,
   removing both `as HistoryStep[]` assertions from `paths` and `run` alike. The cast moves to exactly
   one place: inside `decode`, which is the one function whose entire job is narrowing the wire record —
   `valid` already proved `history(args.undoStack)` true before `decode` ever runs.

8. **Every `??` fallback and `as` assertion inside a `run` closure is deleted**, across both
   `READ_OPERATIONS` and `MUTATION_OPERATIONS` — not only the ones the backlog entry named by example,
   but every one, since the entry's `Proposal` says "delete every `??` fallback and `as` assertion
   inside `run`" as the general instruction. `namedPath`/`namedDestination` (the shared `paths`
   extractors) keep their own `?? ''` fallback and their own `RemoteFilesystemArguments`-typed
   parameter unchanged — they are shared across operations with different call sites and are not
   `run` closures, so they are out of the scope the entry names.

## Implementation steps

1. `src/remote/filesystem-operations.ts`: make `OperationDescriptor` generic (`OperationDescriptor<A = RemoteFilesystemArguments>`), add the `descriptorFor<A>` helper, wrap every entry in `READ_OPERATIONS` and `MUTATION_OPERATIONS` with it, loosen both tables' `satisfies` targets to `OperationDescriptor<any>`, delete every `??`/`as` inside every `run` closure, change `replay`'s `decode` to produce `HistoryStep[]` for both stacks, and make `operationDescriptor` generic over the operation key.
2. `src/remote/serve-file-navigator.ts`: add the one `as never` to `dispatch`'s `run` call.
3. `src/remote/filesystem-refusal.ts`: add the `as never` casts to `refusedPaths` and `refusalValueFor`.
4. Run `check-diff` after each file; resolve any inference gap in step 1 with an explicit `run` parameter annotation on the specific entry that needs it, rather than reworking the whole table.

## Tests

No new test cases — this changes no observable behavior, so the existing suite is the verification:

- `src/remote/filesystem-operations.test.ts` — add `as never` to the one `.paths(args)` call in the `it.each(PATH_CASES)` case that needs it (the loop variable's `operation` is the full union, so the same crossing applies here as in production code); every other assertion in the file must keep passing unchanged, including the `it.each(PATH_CASES)` decode/valid cases and the refusal-shape/root-destination membership checks.
- `src/remote/serve-file-navigator.test.ts` — passes unchanged; it exercises `RemoteFileNavigators.request` end-to-end and never touches the table's types directly.
- `src/remote/file-navigator-refusal-contract.test.ts` — passes unchanged, for the same reason.
- `src/remote/protocol.test.ts` — passes unchanged; it pins wire encode/decode, which this does not touch.

## Out of scope

- Any change to `RemoteFilesystemArguments` or the wire protocol — the wire record stays one flat
  optional-fields type; only the server-side table's internal typing changes.
- Typing `namedPath`/`namedDestination`/the refusal-shape helpers against a narrower `A` — they stay on
  the wide wire type deliberately, since they are shared across operations with different decoded
  shapes.
- Any change to the client (`web/src/`) — this table exists only on the server side of the remote
  channel.
