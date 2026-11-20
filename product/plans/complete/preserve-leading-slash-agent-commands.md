# Preserve leading-slash agent commands in labelled blocks

**Complexity: 1/10** — 1 production line changed in 1 file, 2 behavioral requirements and 3 test scenarios, no new units (p=3.31)

The labelled-block migration rewrote the agent fixture that fed `janissary /file read a.md` into a block whose content dropped the slash, and the shared extractor does not recognize a leading-slash command inside a block. Restore the behavior the extraction plan said to keep: an agent that writes `/file read a.md` inside a `janissary` block gets a workspace read, not a correction prompt.

## Goal

Recognize one leading `/` on a candidate command line inside a labelled block so it counts as a command start, while leaving the extracted command text untouched. The existing gate (`gateAgentCommand`) and workspace host (`runWorkspace`) already strip one leading slash, so the surrounding gating, side selection, and agent/core paths must not change.

## Approach

1. In `src/acp/command-block.ts`, change `isCommandStart` so the `nativeCommandName` check sees the candidate line with one leading `/` removed. Keep `allowQuestion` checking on the returned name exactly as it is.
2. Do not change how `commandFromBlock` builds the returned `command`: the leading slash stays in the returned text so the downstream gate and host normalize it.
3. Restore the fixture in the `strips a leading slash from an agent file read before reading the workspace` test to a `janissary` block whose content is `/file read a.md`; keep all frame, step-count, and `workspace`/`result` assertions unchanged.
4. Add one focused extraction test in `src/acp/command-block.test.ts` that asserts a leading-slash command in a labelled block is returned as `kind: 'one'` with its command text unchanged.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `isCommandStart` | `src/acp/command-block.ts` | The one production line to change; the single command-start check for labelled-block content. |
| `commandFromBlock` | `src/acp/command-block.ts` | Already returns the trimmed line text; no change needed. |
| `gateAgentCommand` | `src/acp/tool-table.ts` | Already strips one leading slash before classifying the command; untouched. |
| `runWorkspace` | `src/remote/serve-acp-loop.ts` | Already strips one leading slash before running the command; untouched. |
| Leading-slash agent fixture | `src/remote/serve-acp-loop.test.ts` | The test the migration gutted; restore its original command content. |

## Implementation steps

1. Edit `isCommandStart` in `src/acp/command-block.ts` to pass the candidate line with one leading `/` removed to `nativeCommandName`, before the existing `allowQuestion` check. Leave `commandFromBlock`'s returned command construction untouched.
2. Restore the leading-slash agent fixture in `src/remote/serve-acp-loop.test.ts` to `block('/file read a.md')`, changing no assertion in that test.
3. Add the focused leading-slash extraction case to `src/acp/command-block.test.ts`.

## Tests

- `src/acp/command-block.test.ts`: a labelled block whose content is `/file read a.md` yields `kind: 'one'` with `command: '/file read a.md'`, confirming recognition without altering the returned text. Existing cases, including the `allowQuestion` question-start case, keep passing unchanged.
- `src/remote/serve-acp-loop.test.ts`: the `strips a leading slash from an agent file read before reading the workspace` case reports one workspace step with `workspace: true` and `result: '1\tone'` from a `/file read a.md` block; its other assertions and the rest of the suite keep passing unchanged.
- `src/acp/tool-table.test.ts` and the rest of the server suite keep passing untouched; the core path, gate decisions, and `allowQuestion` behavior do not move.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each change; the full server suite must be green. Confirm no edited production file crosses the 200-line `max-lines` limit and that no new relative imports need `.js` extensions.

## Out of scope

- No change to `gateAgentCommand`, `runWorkspace`, `nativeCommandName`, or any other normalizer.
- No change to the returned command text, the label, the correction prompt, the gate, permissions, or the core path.
- No change to any other fixture or assertion in `serve-acp-loop.test.ts`, no new command behavior, and no protocol change.
- No spec or user-documentation edits, no PR description change, and no other backlog entry.
