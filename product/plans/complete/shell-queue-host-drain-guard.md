# Keep the host's idle drain away from shell-tab queues

**Complexity: 2/10** — one early return in the host's queue drain plus one test and one spec sentence; the plugin's own drain is untouched.

## Goal

A shell tab's queued command-bar lines run only through the shell plugin's own drain, which sends unclaimed lines to zsh. Today a shell tab's `queueLine` entries sit in the same per-tab queue that `drainQueueOp` in `src/command/queue.ts` drains whenever a tab leaves the busy set (`TabManager`'s onIdle hook) or a route chooser is answered (`CommandManager.chooseRoute`). That drain runs every line through `CommandManager.run` without looking at the tab's view, so if a shell tab ever entered the host busy set while lines were queued (an application command dispatched from its bar that marks the tab busy, for example), those lines would run in the tab's piped background shell instead of zsh, and the client's `dequeue` would then find the queue empty.

## Approach

`drainQueueOp` returns without dequeuing when the tab at the resolved index is a plugin tab (`view === 'plugin'`). That mirrors the view check `dispatchOrRunOp` already makes before it queues anything: the host gate only ever queues for agent tabs, so the host drain has no business emptying a queue it never fills. The check is on the discriminant alone rather than `isPluginTab`, because a plugin tab whose payload was dropped is still not a tab the host should run lines in.

The `queue` command already skips `drainQueue` for a terminal-owning plugin tab, and `send` never calls it for one; both stay as they are. The guard covers the two remaining callers, the onIdle hook and `chooseRoute`.

Rejected alternative: restricting the drain to agent tabs outright. Every other non-agent view has no queue entries to drain today, so the narrower plugin check fixes the reported path without changing behavior anywhere the entry did not examine.

## Implementation steps

1. In `src/command/queue.ts`, have `drainQueueOp` look up the tab at `index` and return when its view is `'plugin'`, before checking busy state or dequeuing.
2. Update `product/specs/agent-command-queue.md` to say a shell tab's queue is never drained by the agent queue's busy-to-idle drain; only the shell tab drains it.

## Tests

In `src/command/manager.test.ts`, under "CommandManager queue gate", add a case where the tab is a plugin tab with two queued lines, enters and leaves the busy set, and asserts the queue is unchanged and the piped shell ran nothing. The existing agent-queue drain cases there and in "CommandManager drain and route chooser" must keep passing.

## Out of scope

- The shell plugin's client-side drain in `web/src/plugins/shell/`, which is the queue's real owner and is unchanged.
- Waking an idle shell when another tab queues a line, which is a separate backlog entry.
- Help and user documentation, which do not describe the host drain.
