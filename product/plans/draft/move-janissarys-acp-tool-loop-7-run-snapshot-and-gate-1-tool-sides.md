# ACP tool loop 7.1 — every ACP tool names its side

**Complexity: 1/10** — ~5 added lines in 1 file, 2 requirements, 1 test scenario (p=3.29)

Run order: piece 1 of 3 of subplan 7 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` (decomposed from it; "Every tool has a side"). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (source decision 2). Depends on subplan 6 (`product/plans/complete/move-janissarys-acp-tool-loop-6-file-read-vocabulary.md`, landed). Pieces 7.2 and 7.3 build on it; the pure gate in 7.2 returns the matched tool's `runsOn`.

The loop's gate will decide, for each command an agent emits, on which side it runs: on the caller's machine or in the workspace. That decision needs each tool to say which side it belongs to. This piece adds that one field to `AcpTool` and fills it in for the three existing entries. Nothing reads it in production until subplan 8.

## Design decisions

- **Every tool has a side** (source decision 2). `AcpTool` in `src/acp/tool-table.ts` gains a required `runsOn: 'caller' | 'workspace'`, with a short comment beside the other field comments saying which side runs the command.
- The browser, question, and database entries in `createAcpToolTable` are `caller`. The `file` entry, added in subplan 8, is `workspace`.
- `AcpTool` keeps its `run` field here; subplan 8 removes it.
- Only `createAcpToolTable` builds `AcpTool` values in production code (no other file constructs one), so the new required field breaks nothing else. Test files that hand-build `AcpTool` literals (piece 7.2 onward) supply `runsOn` themselves.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `AcpTool` type and its three entries | `src/acp/tool-table.ts` (`createAcpToolTable`) |
| Existing table tests | `describe('createAcpToolTable')` in `src/acp/tool-table.test.ts` |

## Proposed changes

One commit, additive, green on its own.

- `src/acp/tool-table.ts` (140 lines today): add `runsOn` to `AcpTool` and `runsOn: 'caller'` to the browser, question, and database entries. `toolRunner`, `dispatchNative`, `run`, and `createAcpToolTable`'s parameters stay unchanged.

## Tests

`src/acp/tool-table.test.ts`, in the existing `describe('createAcpToolTable')` block (an existing case gaining one assertion, or one new case):

- the three real entries, built with every owner granted, all report `runsOn: 'caller'`.

## Out of scope

`AcpRunSnapshot`, `AcpRunSnapshotRow`, `AcpGateDecision`, and `gateCommand` (pieces 7.2 and 7.3). Removing `run` or `toolRunner`, and the `file` tool entry with `runsOn: 'workspace'` (subplan 8).

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests for `src/acp/`). Confirm `src/acp/tool-table.ts` gained no new import. Nothing user-visible changes; `ask` with a granted `db sqlite query` on a local tab still runs through `toolRunner` exactly as before.
