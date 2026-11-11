# ACP tool loop 14.1 — validate and rebuild run snapshots

**Complexity: 4/10** — ~50 added production lines, no existing production files edited, 5 requirements, 27 scenarios, 3 new units (p=4.95)

Run order: piece 1 of 2 of subplan 14 of 27. Source: `product/plans/complete/move-janissarys-acp-tool-loop-14-acp-run-frame.md`. Canonical feature: `product/plans/complete/move-janissarys-acp-tool-loop.md`. Depends on completed subplan 7 and its `AcpRunSnapshot` contract. Piece 2 wires the validated data into the frame codec.

## Goal

Build the pure snapshot decoder before admitting the new frame, so the remote loop receives only validated fields. This preparatory piece has no runtime sender or receiver.

## Design decisions

- New `src/remote/frame/decode-acp-run.ts` exports `decodeAcpRunSnapshot(value: unknown)`, returning a rebuilt `AcpRunSnapshot` or `undefined` for invalid input. Piece 2 adds `decodeAcpRun` to this same module; subsequent original subplans 15–17 add their frame decoders here.
- Use `isRecord` to reject null, arrays and scalars where a snapshot or row object is required. Discriminate only `core` and `agent` kinds.
- Both kinds require a grants array containing only strings. Empty arrays are valid.
- Core requires role `ask` or `tell`, nonempty string `roleName`, boolean `withoutTools`, and rows that are objects with a string `name` and boolean `effectiveEnabled` and `effectiveAgentAccess`. Empty rows and arbitrary string row names are valid. Agent requires boolean `askUser`.
- Construct fresh snapshots and rows using declared fields only. Drop unknown snapshot and row fields without rejecting otherwise valid input. Do not cast unvalidated fields into the contract.
- Follow the record narrowing and explicit reconstruction used by `decodeCloned` at `src/remote/frame/decode-root.ts:60`, using `isRecord` at `src/value-guards.ts:10` and `nonEmptyString` at `src/remote/frame/decode-shared.ts:13`. Import the snapshot and row types directly from `src/acp/types.ts:124`; do not introduce a second wire shape. A `false` boolean is valid and must survive reconstruction unchanged.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Snapshot union and row contract | `src/acp/types.ts`, `AcpRunSnapshot` and `AcpRunSnapshotRow` |
| Object guard | `src/value-guards.ts`, `isRecord` |
| Nonempty string check | `src/remote/frame/decode-shared.ts`, `nonEmptyString` |

## Proposed changes

- New `src/remote/frame/decode-acp-run.ts`: implement the decoder and small private row/grants validation helpers as needed, using direct `.js` imports and remaining below 200 effective lines.
- New `src/remote/frame/decode-acp-run.test.ts`: direct table-driven tests of snapshot validation and reconstruction. Keep frame-level malformed errors and base64 behavior for piece 2.

## Tests

Cover valid core and agent snapshots; unknown kind; null, array and scalar snapshots; invalid core role; empty core role name; non-array grants; numeric grants element; non-array rows; null row; numeric row name; non-boolean effectiveEnabled; missing effectiveAgentAccess; non-boolean withoutTools; missing and non-boolean askUser. Confirm empty grants/rows are accepted and arbitrary string row names remain valid. Verify both snapshot kinds drop unknown fields, and core rows drop unknown fields too. Count the individual input variants when rating this validation work.

Include a core snapshot with both effective row flags and `withoutTools` false, and an agent snapshot with `askUser` false. These are successful decodes, not missing-field cases; assert their rebuilt values exactly. The test module imports the decoder directly, and production code gains no caller until piece 2.

## Out of scope

Adding or admitting `acp-run`, its base64 text, frame malformed errors and codec fixtures (piece 2). Runtime dispatch/sending (original subplans 19 and 21), other loop frames (15–17), old-frame removal and version bump (25). No source specification changes are needed for an unused decoder.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm the decoder has no runtime caller yet and no protocol union, registry or version changes. No user-visible behavior changes or browser interaction.
