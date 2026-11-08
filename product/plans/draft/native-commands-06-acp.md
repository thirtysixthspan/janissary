# Native commands: ACP availability and dispatch

**Complexity: 5/10** — native tool routing must preserve existing outputs, cancellation, and permission checks while using the common dispatcher.

## Goal

Apply current global and agent availability to native ACP calls and route them through the ordinary command dispatcher.

## Decisions and dependencies

- Depends on inventory, settings, notifications, and server dispatch (work units 1–4); completion work unit 5 may precede it without being required by its API.
- Agent access never adds new native tools. At session launch and each `src/acp/run-prompt.ts` tool-table/primer construction, intersect existing role grants with enabled native tools. Keep existing primer group descriptions even when a command is excluded from the final allow-list.
- Check current settings on every call, before role grants, so a command both disabled and ungranted gets the disabled refusal. Existing sessions can retain their original list, but subsequent calls are refused immediately. Keep recognizable disabled command lines extractable so they return a refusal rather than becoming a final answer.
- Return `Command is disabled: <command>.` to the ACP loop regardless of notification visibility, and attribute the ambient notification to the originating tab. An invocation already running may finish.

## Existing code to reuse

`src/acp/tool-table.ts`, `src/acp/native-commands.ts`, `src/acp/run-prompt.ts`, session launch and primer logic, `src/command/manager.ts`, `src/commands/browser.ts`, `src/commands/db.ts`, `src/commands/question.ts`, and the invocation context and policy service.

## Proposed changes

1. Filter the allowed tool set at launch and prompt construction while preserving descriptions, native recognition, and role grants. Keep extraction able to recognize a now-disabled native command.
2. Replace the direct-service native tool runner with ordinary captured dispatch, adding a narrow invocation context or result contract as necessary. Preserve browser service outputs rather than opening the interactive browser path for ACP; preserve database textual output and question's abort signal, `awaitResult`, cancellation, and result timing. Avoid bypassing availability.
3. Update ACP and application-command specifications with the actual policy and response semantics.

## Tests

Cover launch and per-prompt intersections, retained primer group descriptions, role grant enforcement and disabled-first precedence, revocation in a running session, extraction and refusal of disabled lines, suppressed notifications with ACP refusal still returned, and browser, database, and question outputs and cancellation through the dispatcher.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused ACP, browser, database, question, and command-dispatch tests.

## Out of scope

New ACP tools, per-role global-setting overrides, and tab UI are excluded.
