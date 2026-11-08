# Native commands: server dispatch enforcement

**Complexity: 5/10** — enforcement must preserve owner resolution across direct, captured, queued, plugin, and skill-granted dispatch paths with different result contracts.

## Goal

Enforce global command availability at the ordinary server dispatch boundary, including captured and deferred calls.

## Decisions and dependencies

- Depends on completed work units 1–3 (`product/plans/complete/native-commands-01-inventory.md`, `-02-settings.md`, and `-03-notifications.md`). Reuse `listApplicationCommands` / `resolveApplicationCommand` in `src/application-commands.ts` and the `nativeCommandSettings` snapshot in `src/native-commands/manager.ts`; do not add another inventory, settings reader, notification event, config field, or wire event.
- Keep owner selection independent from policy: resolve with the existing ordered registry/plugin rules, then select the longest matching fixed form from that owner's inventory metadata and apply its canonical setting and effective parent settings. Aliases share the canonical policy key. A policy-disabled match remains claimed and is refused, never handed to another owner or a shell. Preserve existing capability-based `Command.available` behavior; it is a separate execution constraint, not the global setting.
- A disabled invocation emits `notify(managers, 'command-disabled', originatingLabel, message)` and returns exactly `Command is disabled: <canonical-command>.` to captured callers regardless of notification suppression or delivery. Already-running invocations may finish; settings are checked at dispatch, not retroactively. Preserve normal replies and errors otherwise.
- Explicit shell execution (`!…`) is outside command policy. `help` is policy-controlled, but when enabled continues to list disabled commands; the policy refusal must not be mistaken for help output or an unknown command.

## What already exists (reuse, don't rebuild)

| Need | Existing implementation (reuse, don't rebuild) |
| --- | --- |
| Canonical names, aliases, fixed forms, owner-sensitive lookup | `src/application-commands.ts` (`listApplicationCommands`, `resolveApplicationCommand`) and `src/commands/index.ts` (`findCommand`); select the matched owner before applying its declared form metadata. |
| Settings and effective parent availability | `src/native-commands/manager.ts` (`current`, `refresh`) and `src/native-commands/settings-types.ts` (`effectiveEnabled`); use the service snapshot rather than reading files in dispatch. |
| Ordinary resolution, output, capture, and direct execution | `src/command/resolve-in-tab.ts` (`resolveInTab`), `src/resolve.ts` (`resolveCommand`), `src/commands.ts` (`getOutput`), and `src/command/manager.ts` (`run`, `dispatchLine`, `executeCommandWithContext`). `dispatchLine` has distinct output, core-response, structured-result, and captured-output contracts. |
| Notification policy and delivery | `src/notifications/index.ts` (`notify`); the event, toggle, alert default, and generic wire delivery already exist from work unit 3. |
| Plugin and queue entry points | `src/plugins/line-capabilities.ts` (`dispatchLineWithOutput`), `src/plugins/queue-capabilities.ts` (`dispatchQueuedCommand`), and `src/schedule/system/firing.ts` (`fireSystemBatch`, `appendSystemBatch`) with `src/plugins/queue-capabilities.ts` dispatching the enqueued system-schedule lines. |
| Skill-granted agent commands | `src/agent/command-tools.ts` (`runGrantedAgentCommand`) checks grants before `dispatchLineInInvocation`; retain that check and surface the dispatch refusal as the tool result. |
| Captured command output | `src/capture/execute-and-capture.ts` (`executeAndCapture`), called by `CommandManager.dispatchLine`; preserve result/output separation and capture timeout behavior. |

## Proposed changes

1. Centralize the policy decision at the server dispatch boundary in `src/command/manager.ts`, using the resolved command owner's canonical fixed-form inventory row and `nativeCommandSettings.current()`. Do not pass a policy-filtered predicate into `resolveCommand`: its existing availability callback in `src/resolve.ts` participates in registry matching, and filtering a match there risks changing owner selection. Keep `resolveInTab`'s tab/capability availability checks intact, then ensure global-disabled commands are distinguishable from unavailable owners and cannot fall through to `getOutput`'s unknown/help response. Preserve the existing `shell` `!` escape.
2. Apply the same refusal before effects in `executeCommandWithContext` as well as `dispatchLine`; direct `executeCommand` callers (including `src/message/tabs.ts`, `ask reset`) bypass the line-dispatch path. Recheck existing `Command.available` semantics, including its current redispatch behavior, so policy refusal does not recurse or execute a different owner.
3. Cover all line-dispatch wrappers: `dispatchLineWithOutput` (used by plugin line capabilities), `dispatchQueuedLine` (used by plugin queue capabilities and system-schedule firing), and `dispatchLineInInvocation` (used by `runGrantedAgentCommand`). Check settings when each wrapper actually dispatches, not when a queue/schedule row is created. Retain skill grants as a separate gate; a granted command disabled by settings returns the refusal without losing the dispatch result to capture suppression.
4. Handle `help`, which is answered by `getOutput` outside the command registry, through the completed inventory's canonical `help` row. When enabled, preserve bare and named help; when disabled, return the canonical refusal and do not list-filter help output. For any disabled match, notify using the originating invocation label and exact refusal string, but do not let notification delivery affect dispatch output/result.
5. Update `product/specs/application-commands.md` and the existing command, plugin, queue/scheduling, and agent-command specs to specify the newly enforced paths and exact refusal. Do not add ACP-native agent-access filtering; that is a separate unit.

## Tests

Add or extend colocated server tests: `src/command/manager.test.ts` for direct `executeCommand`, normal dispatch, each capture/result contract, resolver ownership and help; `src/application-commands.test.ts` for owner-first fixed-form resolution where needed; `src/plugins/shell-capabilities.test.ts`, `src/plugins/shell/activate.test.ts`, and `src/command-queue/provenance.integration.test.ts` for the line and queue dispatch adapters; `src/schedule/system/manager.test.ts` for scheduled execution; and `src/agent/command-tools.test.ts` for retained skill grants plus the refusal returned by `dispatchLineInInvocation`. Cover aliases, disabled parents and children, shared-owner resolution, explicit `!` shell escape, `help`/`getOutput`, settings changing before queued/scheduled execution, originating-tab attribution, suppressed notification delivery, and refusal preservation when output capture times out or captures nothing. Tests must prove a disabled command is not rerouted to a competing owner or shell and enabled behavior/replies remain unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development plus the focused tests listed above. Manually disable a canonical command and a parent, invoke each from its owning tab and through plugin, queued, scheduled, captured, and skill-granted paths; confirm the exact refusal and originating-tab notification where eligible, then suppress notification delivery and confirm the refusal is unchanged. Re-enable them and verify ordinary replies, help output, shared-owner resolution, and explicit `!` shell execution remain unchanged.

## Out of scope

Client intercepts, completion, native ACP tool routing, and UI are subsequent work units; shell operating-system commands are not blocked.
