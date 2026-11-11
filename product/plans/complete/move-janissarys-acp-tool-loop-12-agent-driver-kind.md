# ACP tool loop 12 — the driver's agent kind

**Complexity: 5/10** — ~65 added production lines across 3 edited files, 7 requirements, 9 scenarios, 1 new module (p=5.41)

Run order: 12 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` (the `agent` sentences of "Per-prompt snapshot" and "One loop driver", including the `command-extract.ts` move; decisions 2, 7, and 22). Depends on subplans 7 and 10 (`move-janissarys-acp-tool-loop-7-run-snapshot-and-gate.md`, `move-janissarys-acp-tool-loop-10-loop-driver-module.md`). Subplan 13 switches `executeAgentRun` to it, and subplan 18 runs it on the far side.

An autonomous `agent …` run has its own primer, extractor, and unlimited step count. This subplan teaches the shared driver those rules, so one driver serves both kinds of run on both hosts. It also moves the agent extractor out of a module the far side cannot load. `executeAgentRun` keeps its own loop until subplan 13.

## Design decisions

- **Agent kind in `driveToolLoop`.**
  - The loop's primer is `MARKDOWN_INSTRUCTION` alone. The agent primer stays in the prompt text, which `executeAgentRun` already builds with `agentPrimer(run.snapshot)`.
  - The extractor is `extractAgentCommand(text, snapshot.askUser)`.
  - `maxSteps` is unlimited, as today.
  - Widen `driveToolLoop`, `runToolLoop`, and `gatedRunner` from the core-only snapshot alias to `AcpRunSnapshot`; keep `corePrimer` core-only. At `src/acp/drive-loop.ts:63` (`snapshot.withoutTools`), narrow by `kind` before reading core fields: agent runs use an empty tool table, since their extractor and gate do not use the native catalog. Select the primer, extractor, and step limit by kind; retain the existing core branch unchanged.
  - `gateCommand`'s agent rule (subplan 7) picks the side. `janissary file read …` is a workspace command when the run's grants include `file` (source decision 22), and is otherwise refused with `Agent: command not permitted: <command>.`. Every other command is a caller command.
- **`extractAgentCommand` moves.** It and its fence helpers (`openingFence`, `closesFence`) move from `src/agent/command-tools.ts` into a new pure `src/agent/command-extract.ts`, because `command-tools.ts` imports the command registry, which the far side must not load. `agentPrimer` and `runGrantedAgentCommand` stay in `command-tools.ts`.
- **No re-export.** `executeAgentRun` and the tests import the extractor from its new home directly, and nothing is re-exported from the old one (`ai/guidelines/imports-and-barrel-files.md`).
- **Preserve the extractor exactly.** Move `CodeFence` with `openingFence`, `closesFence`, and `extractAgentCommand` from `src/agent/command-tools.ts:6` and `:32`. Keep the existing final-line selection, fence matching, case handling, and inline-backtick cleanup. The new module has no imports from the command registry or managers. This change adds driver support only: `executeAgentRun` still uses its existing loop and only changes its extractor import.

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
- `src/acp/drive-loop.ts`: the agent kind's primer, extractor, and explicit `Infinity` step count (`runAcpToolLoop` otherwise defaults to eight); widen the three snapshot parameters above. Continue using the existing gated runner, event forwarding, refusal metadata, and cancellation handling for both kinds. The driver remains comfortably below the 200-line limit; no new helper layer is needed.

## Tests

- `src/acp/drive-loop.test.ts`, agent kind:
  - the primer is `MARKDOWN_INSTRUCTION` only;
  - a `janissary db sqlite list` reply routes to `runCaller` with `db sqlite list`;
  - `janissary file read a.md` routes to `runWorkspace` when `file` is granted and is a refused step otherwise;
  - a bare `question ask "x"` line is extracted only when `askUser` is true;
  - twenty steps run without a cap.
  - `runToolLoop` also accepts an agent snapshot and routes an extracted command, proving the public wrapper's widened contract.
- New `src/agent/command-extract.test.ts`: move the two existing extractor cases (final command outside fenced examples, and matching tilde fences) from `src/agent/command-tools.test.ts` with the function. Leave the granted-dispatch cases in the old test file and remove its extractor import. The moved tests import directly from `command-extract.js`; `execute.ts` does likewise. Existing core driver cases must retain their primer order, eight-step cap, refusal behavior, and cancellation assertions.

## Out of scope

Switching `executeAgentRun` to the driver (subplan 13). Running an agent loop on the far side (subplans 18 and 23).

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Search for `extractAgentCommand` and confirm its consumers import the new module directly and the old module defines or re-exports none of it. Trace `executeAgentRun`'s existing `runAcpToolLoop` call to confirm the runtime switch remains deferred to subplan 13. Nothing user-visible changes, so no new browser interaction is required for this preparatory work unit.
