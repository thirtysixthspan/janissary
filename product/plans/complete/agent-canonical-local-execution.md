# Connect the canonical agent command to local task execution

**Complexity: 8/10** — The command must bind run ownership, task and skill snapshots, authorized nested dispatch, ACP completion, question cancellation, and cleanup into one awaited result while preserving the shared command path.

## Goal

Make `agent ... execute <task> [parameters...]` launch an autonomous local ACP task and return its final status, response, and cleanup warnings after the run releases its resources.

## Decisions and scope

Use the existing launch parser, task/skill resolver, run manager, canonical command registry, structured result dispatch, question service, ACP connection, and tool loop. The caller's captured local working directory is the execution workspace; this repair does not provision a clone or select a remote host. Resolve model and effort before prompting, and keep model configuration explicit. A skill grants only exact canonical command names. Extract only the final nonempty `janissary <command>` line outside code fences, authorize its resolved command name, then dispatch it through the canonical command manager with the run's caller and abort context. Await question answers so they become ACP tool results.

The run owns its ACP process and ends on caller termination, normal completion, or failure. Never let a late prompt, command, or resource result continue the run after termination. Cleanup warnings remain separate from task status and response. The parser's `in a tab` clause remains parsed but does not add a monitoring surface in this repair.

## Implementation steps

1. Add the local autonomous ACP adapter and command-tool helpers under `src/agent/`. Reuse `connectAcp` and `runAcpToolLoop`; add only the ACP configuration and permission hooks needed to apply model, effort, and autonomous approvals without changing existing ACP consumers.
2. Add `src/commands/agent.ts` and register the single canonical command. Resolve and snapshot task/skills/grants, create a run with the provided invocation context, start its local session, await execution and cleanup, and return the structured result.
3. Make `question` return an awaited answer when invoked with an agent signal while preserving its direct-user pending-question transcript behavior. Thread abort through that existing command path.
4. Add focused command and tool tests for headless success, exact grant denial, question answer and cancellation, provider failure, caller termination, cleanup warnings, and overlapping dispatch output. Preserve existing command and ACP behavior, and keep the transcript-cap test's input outside the newly registered `agent` namespace.
5. Update `product/specs/agent-command.md`, the alphabetical command row in `help.md`, the application-command guide, and the existing ACP user guide with the new autonomous command behavior.

## Tests

Add colocated tests for the registered command's structured result and lifecycle, command extraction and exact canonical-name authorization, awaited question outcomes, provider errors, abort races, cleanup warnings, and invocation-isolated nested output. Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Do not implement monitoring UI or an agent-monitor plugin, remote execution or remote protocol changes, workspace cloning, child-agent policy, a new command dispatcher, or changes to ordinary ACP tool policy.
