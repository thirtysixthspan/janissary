# ACP tool loop 12 — the driver's agent kind

**Complexity: 4/10** — ~55 added lines across 3 edited files, 6 requirements, 6 scenarios (p=5.16)

Run order: 12 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `agent` sentences of "Per-prompt snapshot" and "One loop driver", including the `command-extract.ts` move; decisions 2, 7, and 22). Depends on subplans 7 and 10 (`move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md`, `move-janissarys-acp-tool-loop-10-loop-driver-module.md`). Subplan 13 switches `executeAgentRun` to it, and subplan 18 runs it on the far side.

An autonomous `agent …` run has its own primer, extractor, and unlimited step count. This subplan teaches the shared driver those rules, so one driver serves both kinds of run on both hosts. It also moves the agent extractor out of a module the far side cannot load. `executeAgentRun` keeps its own loop until subplan 13.

## Design decisions

- **Agent kind in `driveToolLoop`.**
  - The loop's primer is `MARKDOWN_INSTRUCTION` alone. The agent primer stays in the prompt text, which `executeAgentRun` already builds with `agentPrimer(run.snapshot)`.
  - The extractor is `extractAgentCommand(text, snapshot.askUser)`.
  - `maxSteps` is unlimited, as today.
  - `gateCommand`'s agent rule (subplan 7) picks the side. `janissary file read …` is a workspace command when the run's grants include `file` (source decision 22), and is otherwise refused with `Agent: command not permitted: <command>.`. Every other command is a caller command.
- **`extractAgentCommand` moves.** It and its fence helpers (`openingFence`, `closesFence`) move from `src/agent/command-tools.ts` into a new pure `src/agent/command-extract.ts`, because `command-tools.ts` imports the command registry, which the far side must not load. `agentPrimer` and `runGrantedAgentCommand` stay in `command-tools.ts`.
- **No re-export.** `executeAgentRun` and the tests import the extractor from its new home directly, and nothing is re-exported from the old one (`ai/guidelines/imports-and-barrel-files.md`).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Agent extractor and fence helpers | `extractAgentCommand` in `src/agent/command-tools.ts` |
| Driver | `driveToolLoop` in `src/acp/drive-loop.ts` (subplan 10) |
| Agent gate rule | `gateCommand` in `src/acp/tool-table.ts` (subplan 7) |

## Proposed changes

- New `src/agent/command-extract.ts`: the moved extractor and fence helpers.
- `src/agent/command-tools.ts`: drop them.
- `src/agent/execute.ts`: import `extractAgentCommand` from the new module.
- `src/acp/drive-loop.ts`: the agent kind's primer, extractor, and unlimited step count.

## Tests

- `src/acp/drive-loop.test.ts`, agent kind:
  - the primer is `MARKDOWN_INSTRUCTION` only;
  - a `janissary db sqlite list` reply routes to `runCaller` with `db sqlite list`;
  - `janissary file read a.md` routes to `runWorkspace` when `file` is granted and is a refused step otherwise;
  - a bare `question ask "x"` line is extracted only when `askUser` is true;
  - twenty steps run without a cap.
- New `src/agent/command-extract.test.ts`: the extractor cases from `src/agent/command-tools.test.ts`, moved with the function.

## Out of scope

Switching `executeAgentRun` to the driver (subplan 13). Running an agent loop on the far side (subplans 18 and 23).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Nothing user-visible changes.
