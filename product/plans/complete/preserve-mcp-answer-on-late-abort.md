# Preserve an MCP answer on late abort

**Complexity: 2/10** — About 10 added lines across two production files, with four verification scenarios (p=3.94).

## Goal

Keep a human answer when an MCP cancellation arrives after the question has settled. Send a withdrawal notification only when the caller's abort removes an outstanding question.

## Requirements

1. “Retains the original result” when the user answers or cancels from the panel before a same-turn abort.
2. “Produces no withdrawal” for an abort after the question has settled.

## Design decisions

- The question queue determines whether the incoming abort removed an entry, because it already settles the exact active or queued question synchronously.
- The executor uses the queue's result directly and supplies its withdrawal notification as an optional callback.

## Preserved behavior

1. Aborting an outstanding MCP question withdraws only that question and promotes the next one. The waiting call must never receive the successor's answer. Existing test `withdraws an aborted question, shows the next queued question, and records one notification`.
2. ACP's question registration continues to resolve to the cancellation text when its signal is already aborted. It must never queue that question. Existing test `does not register an already cancelled question` in `src/acp/plugin-session.test.ts`.

## Assumptions

1. Queue settlement removes its listener before exposing the next question. `src/questions.ts:108` calls `entry.cleanup?.()` before `this.onChange`.

## Existing functionality

1. `src/questions.ts:91` uses `cancelEntry` to remove either the active or queued entry.
2. `src/mcp/executor.ts:20` records `question-withdrawn` for the resolved tab.

## Implementation steps

Have `Questions.register` accept an optional withdrawal callback and invoke it from the existing abort listener only when `cancelEntry` removes the entry. Wire it into `createLocalExecutor` and return the result from `Questions.register`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The existing question panel still closes when the user answers or cancels, without a withdrawal notification from a later caller abort.

## Tests

- In `src/mcp/executor.test.ts`, abort synchronously after the panel settles the call. Exercise both an answer and panel cancellation. Assert the expected result and absence of a withdrawal for requirements 1 and 2.
- In `src/remote/mcp-relay.test.ts`, cancel in the same turn as answering and confirm the reply and its later replay for requirements 1 and 2. Keep the existing tests for withdrawing a pending question and promoting its successor.

## Out of scope

Remote channel teardown and link recovery retain their existing behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. In the running app, have an MCP-enabled harness ask a question. Answer it in the Janissary panel and then cancel the harness turn. The selected answer reaches the tool and the Notifications tab has no withdrawal entry for that question. Repeat by cancelling the harness turn while the panel is open and confirm the panel closes and the withdrawal entry appears. The executor and relay tests control the exact same-turn ordering.
