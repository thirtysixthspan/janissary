# ACP tool loop 7.1 — every ACP tool names its side

**Complexity: 1/10** — ~5 added lines in 1 file, 2 requirements, 1 test scenario (p=3.29)

Run order: piece 1 of 3 of subplan 7 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md` (decomposed from it; "Every tool has a side"). Canonical plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (source decision 2). Depends on subplan 6 (`product/plans/complete/move-janissarys-acp-tool-loop-6-file-read-vocabulary.md`, landed). Pieces 7.2 and 7.3 build on it; the pure gate in 7.2 returns the matched tool's `runsOn`.

The loop's gate will decide, for each command an agent emits, on which side it runs: on the caller's machine or in the workspace. That decision needs each tool to say which side it belongs to. This piece adds that one field to `AcpTool` and fills it in for the three existing entries. Piece 7.2's `gateCommand` is the first reader; nothing on the live run path reads it until subplan 8 switches `runCorePrompt` to the gate.

## Design decisions

- **Every tool has a side** (source decision 2). `AcpTool` in `src/acp/tool-table.ts` gains a required `runsOn: 'caller' | 'workspace'`, declared as the type's last field (after `isCommandLine`), with a one-line `//` comment above it in the style of the other field comments, saying which side runs an emitted command: the caller's machine or the workspace. The union is written inline; add no exported alias type for it (piece 7.2 reads it as `tool.runsOn`, and an exported alias nothing imports would be flagged by knip).
- The browser, question, and database entries in `createAcpToolTable` are `caller`: each entry's `tool` literal in the `ownedTools` array gains `runsOn: 'caller'` as its last property (after `isCommandLine`), matching the field order. The `file` entry, added in subplan 8, is `workspace`; this piece adds no `file` entry.
- `AcpTool` keeps its `run` field here; subplan 8 removes it.
- Only `createAcpToolTable` builds `AcpTool` values anywhere today, in production or tests (a grep for `AcpTool` matches only `src/acp/tool-table.ts`), so the new required field breaks nothing else. The other consumers only call the factory or read existing fields, and need no edit: `runCorePrompt` in `src/acp/run-prompt.ts` (`createAcpToolTable(managers, request.roleName, request.commands, request.abort.signal)`), `src/native-commands/feature.integration.test.ts` (`createAcpToolTable(managers, 'ask', grants)`), and, inside `tool-table.ts`, `toolPrimer`, `toolRunner`, and `toolExtractor`, which read only `primer`, `match`, `run`, and `isCommandLine`. Test files that hand-build `AcpTool` literals (piece 7.2 onward) supply `runsOn` themselves.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `AcpTool` type and its three entries | `src/acp/tool-table.ts` (`export type AcpTool`; the `ownedTools` array in `createAcpToolTable`) |
| Existing table tests and fixture | `describe('createAcpToolTable')` in `src/acp/tool-table.test.ts`; its `setup()` helper defaults `grants` to `NATIVE_ACP_COMMANDS`, which grants all three owners |

## Proposed changes

One commit, additive, green on its own.

- `src/acp/tool-table.ts` (140 lines today): add `runsOn` to `AcpTool` and `runsOn: 'caller'` to the browser, question, and database entries. `toolRunner`, `dispatchNative`, `run`, the owner filter, and `createAcpToolTable`'s parameters stay unchanged. No new import; the file stays well under the 200-line `max-lines` limit.

## Tests

`src/acp/tool-table.test.ts`, in the existing `describe('createAcpToolTable')` block, add one new case rather than folding an assertion into an existing one, so a failure names the side rule:

- `setup()` with its default grants builds the three real entries (browser, question, database, in that order), and mapping them to `runsOn` gives exactly `['caller', 'caller', 'caller']`. Comparing the whole array also pins the count, so the case cannot pass on an empty table.

## Out of scope

`AcpRunSnapshot`, `AcpRunSnapshotRow`, `AcpGateDecision`, and `gateCommand` (pieces 7.2 and 7.3). Removing `run` or `toolRunner`, and the `file` tool entry with `runsOn: 'workspace'` (subplan 8).

## Verification

Run `$janissary/scripts/run.mjs check-diff` (lint, typecheck, and the server tests for `src/acp/`). Confirm `src/acp/tool-table.ts` gained no new import and that `git diff --stat` lists only `src/acp/tool-table.ts` and `src/acp/tool-table.test.ts`. Nothing user-visible changes; `ask` with a granted `db sqlite query` on a local tab still runs through `toolRunner` exactly as before.
