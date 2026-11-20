# Fix ACP workspace routing for file list, stat, exists, head, and tail

**Complexity: 3/10** — ~12 added lines in one production file, 6 behavioral requirements and 9 test scenarios, no new modules (p=4.651).

## Goal

A `ask`/`tell` ACP role that grants `file list`, `file stat`, `file exists`, `file head`, or `file tail` can emit that command as a tool step, and the gate recognizes it, but the core prompt's workspace runner has no branch for any of them. They fall through to `readFileInTab`, whose parser returns `Usage: file read <path> [--offset <line>] [--limit <lines>]` instead of running the command. `file glob` works because it has its own branch. The fix routes each of the five names to the same tab executor the typed `file` command uses, so an agent gets the real listing, stat row, existence word, or numbered lines and never the read usage. The far-side loop already routes all five through `runWorkspaceCommandIn`; only the local/core `runWorkspace` is wrong.

## Approach

1. `runWorkspace` in `src/acp/run-prompt.ts` is an ordered chain of `is…CommandLine` checks over the normalized command, ending in a `readFileInTab` fall-through. Add five siblings after the `file grep` branch and before the fall-through, using the shared line-detection predicates and the same tab executors `src/commands/file.ts` dispatches to. `file list` and `file ls` share one predicate and executor.
2. Pass the raw command text to the executors, matching every existing branch in that function; only the detection predicates read the normalized line.
3. Do not change the gate, the tool table, the primer, command settings, role grants, the far-side runner, or the typed `file` dispatcher. This corrects one missing dispatch branch set, not the command vocabulary.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| Core `runWorkspace` | `src/acp/run-prompt.ts` | The ordered chain with the missing branches and the `readFileInTab` fall-through. |
| Typed dispatcher | `src/commands/file.ts` | The canonical branch order and the exact executors to call. |
| Line predicates | `src/file-list/command.ts`, `src/file-stat/command.ts`, `src/file-exists/command.ts`, `src/file-head-tail/command.ts` | The `is…CommandLine` predicates already used by the gate and far-side runner. |
| Tab executors | `src/file-list/tab-list.ts`, `src/file-stat/tab-stat.ts`, `src/file-exists/tab-exists.ts`, `src/file-head-tail/tab-head-tail.ts` | Tab-aware root selection and remote transport; identical output to the typed command by construction. |
| Far-side runner | `src/acp/workspace-runner.ts` | Already routes all five; proves the intended behavior and needs no edit. |
| Core prompt tests | `src/acp/run-prompt.test.ts` | Existing per-command routing suites and executor mocks to mirror. |
| ACP spec | `product/specs/acp.md` | Already states these role steps run against the workspace and answer like the typed command. |

## Implementation steps

1. `src/acp/run-prompt.ts`: import `isFileListCommandLine` and `listFilesInTab`, `isFileStatCommandLine` and `statFileInTab`, `isFileExistsCommandLine` and `fileExistsInTab`, `isFileHeadTailCommandLine` and `headTailInTab`. Use `.js` extensions on every relative import.
2. In `runWorkspace`, after the `file grep` branch and before `return readFileInTab(...)`, add branches that return `listFilesInTab`, `statFileInTab`, `fileExistsInTab`, and `headTailInTab` for their matching predicates, passing `managers`, `label`, and the raw `command`.
3. Run `$janissary/scripts/run.mjs check-diff`; confirm `run-prompt.ts` stays under 200 lines.

## Tests

- `src/acp/run-prompt.test.ts`: extend the hoisted mock set and add `vi.mock` factories for the four tab executor modules that keep their real implementations, then add a `runCorePrompt listing and inspecting commands` describe with a temp workspace containing a file and a folder:
  - `file list .` returns a real row containing `a.txt` through `listFilesInTab`, not `FILE_READ_USAGE`, and never calls `readFileInTab`;
  - the `file ls .` alias takes the same route and echoes its own spelling;
  - `file stat a.txt` returns a real stat row through `statFileInTab` and never calls `readFileInTab`;
  - `file exists a.txt` returns `file` through `fileExistsInTab`;
  - `file head a.txt -n 1` and `file tail a.txt -n 1` return the numbered lines through `headTailInTab`;
  - a malformed `file list` returns `FILE_LIST_USAGE`, not the read usage;
  - an unrecognized `file` lookalike still falls through to `readFileInTab` and returns `FILE_READ_USAGE`;
  - an aborted prompt throws `ACP: prompt cancelled.` before a newly routed command runs;
  - a local fallback session on a remote tab routes `file list .` through the tab executor and never touches local disk.
- Existing `src/acp/run-prompt.test.ts`, `src/acp/tool-table.test.ts`, `src/acp/workspace-runner.test.ts`, and `src/commands/file.test.ts` suites remain the regression net for gating, the primer, and typed dispatch.

## Out of scope

- No change to the gate, `NATIVE_ACP_COMMANDS`, tool table, primer, command settings, role grants, or completion.
- No change to `runWorkspaceCommandIn` (far side), `runGrantedAgentCommand` (agent runs), or the typed `file` dispatcher.
- No new command, flag, message, protocol operation, or documentation page; the ACP spec and `help/file.md` already describe the intended behavior.

## Verification

- `$janissary/scripts/run.mjs check-diff` must be clean after the source change and again after adding tests.
- No edited production file exceeds the 200-line `max-lines` limit.
