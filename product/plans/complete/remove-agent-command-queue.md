# Remove command queues from agent tabs

**Complexity: 6/10** — remove the agent dispatch gate while retaining and generalizing the shared queue used by shell tabs.

## Goal

Agent tabs dispatch all input immediately, including input delivered by send, schedules, monitor suggestions, and input during workspace provisioning. Command queues remain a core capability that any tab plugin may opt into, independently of owning a terminal or hosting a command bar. Shell tabs keep their current queue behavior.

## Approach

Core owns queue storage, mutation, FIFO execution, lifecycle, and popup handling. Core tabs can opt in with `Tab.hasCommandQueue`. A plugin requests the existing `queueLine` and `nextQueuedLine` capabilities to opt in; the host publishes queue availability in the tab view. Hosting a command bar alone does not imply a queue. Publish a generic core queue service and hook through the client plugin API. Shell supplies only transport adapters, command routing, and busy/idle signals.

The user chose immediate agent dispatch, `Usage: queue <shell-tab> <command>`, and deletion of the mixed backlog entries for ACP interruption, future harness queues, and targeting sets of tabs. Agent targets report the existing `Tab "<label>" has no command queue.` error. Bare queue and Ctrl+E do nothing on agents. Other opted-in plugin tabs also accept queue deliveries; the usage names the currently shipped consumer. Queues remain in memory and no persisted data is migrated or deleted.

## Implementation steps

1. Remove `src/command/queue.ts`, the dispatch gate and drain hook in `src/command/manager.ts`, and its idle callback in `src/tab/manager.ts` and `src/tab/runtime-operations.ts`. Delete tests/assertions solely describing agent queue behavior in `src/command/manager.test.ts`, `src/tab/manager.test.ts`, `src/controller.test.ts`, and `web/src/App.test.tsx`. Add regression tests for immediate busy-agent dispatch.
2. Generalize core queue availability in a new `src/command-queue/` module, `src/tab/view.ts`, and the shared protocol. Decouple command-bar declaration validation from queue ownership in `src/plugins/activate.ts` and remove the old validation tests. Update `src/commands/queue.ts` and its tests for opted-in targets and wording. Keep shell send delivery unchanged. Move the shell FIFO service and tests to `web/src/shared/command-queue/`, publish the generic service/hook through `web/src/plugins/api.ts`, and leave shell transport adapters in `web/src/plugins/shell/useShellCommandQueue.ts`. Update the shell component's type imports. Gate the popup in `web/src/pickers/useQueuePicker.ts`; remove agent queue props/editing and prompt wording from `web/src/agent-tabs/` and its app composition, retaining the busy dot. Update affected queue-only tests and add core queue opt-in, isolation, and popup tests.
3. Replace `product/specs/agent-command-queue.md` with `product/specs/command-queue.md`. Centralize the shell queue rules there and cross-reference them from `shell-tab.md`. Update affected sections in send, scheduling, monitoring, command-routing, keyboard-navigation, task-picker, workspaced-agent, shell, and tab-plugins specs; queue, send, shell, scheduling, workspaced-agent, remote-agents, and keyboard user documentation; plugin developer documentation; `help.md`; and the spec reference in `ai/tasks/research/find-feature-gaps.md`. Update stale comments in the ACP readiness check, agent creation, remote agent launch, tab runtime, and core queue API. Update architecture guidance only where removal changes its described mechanics. Delete the three mixed feature backlog entries and agent-queue-only documentation backlog entries. Retain docs pages, navigation, screenshots, unrelated backlog entries, completed plans, and changelog history.
4. Remove only dead code created by these changes, compare against the baseline, verify, complete this plan, and open a breaking-change pull request for human merge.

## Tests

Retain remaining-feature assertions. Move the framework-free FIFO tests to core and retain their behavior coverage. Delete agent-queue-only tests. Add tests for immediate busy-agent dispatch, opting into queues without a terminal, tabs without queues, shell preservation, and popup ownership. Existing shell routing, provisioning, send, and queue tests must stay green.

## Spec updates

`command-queue.md` is the source of truth for availability, FIFO handling, busy/provisioning behavior, cross-tab delivery, editing, empty queues, races, lifecycle, and plugin integration. Agent and automation specs describe immediate dispatch. Shell-specific routing and terminal signals remain in `shell-tab.md`.

## Verification

Baseline: typecheck and lint passed (one existing cognitive-complexity warning in `web/src/shared/fuzzy-match.ts`); 860 test files passed, 12367 tests passed, one existing skipped test.

Complete dead-code baseline:

```text
Unused exports (1)
RemoteChip  web/src/plugins/api.ts:62:10
Unused exported types (1)
TabPluginLaunchReady  type  src/plugins/api.ts:24:27
```

Run `./scripts/run.mjs check-diff` after each implementation step. Run full typecheck, lint, tests, dead-code scan, docs build, and the PR hard-check gate. Build the web client and inspect plugin chunk isolation after publishing the core queue hook. If an attached browser exists, check immediate agent dispatch, agent queue rejection, shell busy FIFO draining, cross-tab send/queue delivery, and docked popup editing in one scratch-instance batch; otherwise record the unavailable live check honestly.

Final results: `check-diff` passed. The full PR hard-check gate passed typecheck, lint, and all 865 test files: 12341 tests passed and the same one pre-existing test remained skipped. Lint reports only the baseline fuzzy-match complexity warning. The docs build and production web build passed; shell and the other tab plugins remain separate emitted chunks. No tracked build artifacts changed.

The final dead-code scan matches the baseline exactly by symbol and file. Two unused type re-exports introduced while publishing the core queue were removed; `RemoteChip` and `TabPluginLaunchReady` remain untouched.

Live agent dispatch, send, schedules, monitor suggestions, and provisioning checks: skipped because `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both unset.

Live shell FIFO, cross-tab send/queue delivery, and docked popup editing checks: skipped for the same missing browser attachment. No scratch app was started. Existing shell tests and the moved FIFO tests passed; new tests cover queue opt-in without terminals, command bars without queues, agent rejection, owner disappearance, immediate dispatch, and hook lifecycle.

## Out of scope

Enabling queues on other bundled tabs, adding a queue plugin, changing shell routing or scheduling's direct terminal delivery, command-level concurrency redesign, persistence, migration, pre-existing dead code, historical completed plans or changelog entries, unrelated cleanup, and merging the PR.
