# Native commands: server dispatch enforcement

**Complexity: 5/10** — resolution, capture, queues, and skill-granted dispatch share behavior but have different return contracts.

## Goal

Enforce global command availability at the ordinary server dispatch boundary, including captured and deferred calls.

## Decisions and dependencies

- Depends on work units 1–3. Resolve the existing owner first, then find the longest matching declared fixed form for that owner and test its setting and parent settings. Aliases share their canonical policy key; disabled commands stay claimed and are refused, never handed to a shell or another owner.
- A disabled invocation emits the originating tab's `command-disabled` notification and returns `Command is disabled: <command>.` to captured callers independently of suppression. Already running invocations may finish. Preserve all normal replies and errors otherwise.
- Explicit shell execution is outside command policy. `help` itself is subject to policy but continues listing disabled commands when enabled.

## Existing code to reuse

`src/resolve.ts`, `src/commands.ts`, `src/command/resolve-in-tab.ts`, `src/command/manager.ts`, `src/capture/`, `src/agent/command-tools.ts`, queue and scheduler dispatch, and the service and event from earlier work units.

## Proposed changes

1. Apply availability to resolution and execution without filtering a disabled match out of owner selection. Cover direct command-manager execution, normal and captured dispatch, `dispatchLineInInvocation`, plugin capabilities, queues and schedules at actual dispatch time, and built-ins formerly answered at resolution including `help`.
2. Preserve the skill-grant check in `runGrantedAgentCommand` while returning a disabled refusal as the dispatch result. Ensure a setting disabled before a queued or scheduled invocation is checked when it runs and is attributed to the originating tab.
3. Update command, queue, scheduling, agent-command and related specs to describe the paths now enforced. Do not yet implement ACP-native agent access; that is a separate work unit.

## Tests

Cover direct and captured dispatch, resolver and `getOutput`, help, aliases, parent and subcommand decisions, shared-owner resolution, explicit shell escape, queues, schedules, plugin capability dispatch, and `src/agent/command-tools.test.ts` for both retained skill grants and refusal returned by `dispatchLineInInvocation`. Check notification attribution and suppressed delivery without losing the captured result.

## Verification

Run `$janissary/scripts/run.mjs check-diff` plus focused resolver, command-manager, queue, scheduler, plugin and agent-command tests.

## Out of scope

Client intercepts, completion, native ACP tool routing, and UI are subsequent work units; shell operating-system commands are not blocked.
