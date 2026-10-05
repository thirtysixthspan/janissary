# Queue commands for shell tabs

## Complexity

5/10. The change connects the existing shared per-tab queue command to the shell plugin's client-side drain, including the idle-target case.

## Goal

Allow `queue <shell-tab> <command>` to add a line to the shell tab's queue and have it run through that tab's ordinary command bar behavior.

## Approach

Treat a plugin tab with a host-owned terminal as a queue-capable target. The shell client already owns FIFO draining and decides whether a line runs as an application command or reaches zsh. Wake that drain when the shared queue changes while the shell is idle; while busy, the existing prompt transition will drain it.

## Implementation steps

1. Update `queue` to accept plugin targets that own a terminal, enqueue the line, and leave draining to the plugin client; preserve agent drain behavior and reject other views.
2. Add a shell queue wake method and observe queue-state changes so externally queued work begins when an idle shell is mounted.
3. Add server and client tests for terminal ownership, unsupported tabs, FIFO wake behavior, and busy shells.
4. Update the agent queue and shell-tab specs, `help.md`, and the existing queue user guide to describe shell targets.

## Tests

- `src/commands/queue.test.ts`: shell-terminal targets enqueue without calling the agent command drain; plugin targets without terminals and other views remain rejected.
- `web/src/plugins/shell/shell-command-queue.test.ts`: an idle queue wakes and drains, a busy queue waits, and wake during an active drain does not overlap it.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Specs and docs

- `product/specs/agent-command-queue.md`: clarify shell queue targets and how their shared queue drains.
- `product/specs/shell-tab.md`: describe `queue <shell-tab> <command>` and its use of ordinary shell command routing.
- `help.md` and `documentation/user-documentation/command-bar/queue.md`: describe shell tabs as queue targets.

## Out of scope

- Queueing input to plugin tabs without an owned terminal.
- Changing `send`, `msg`, or agent-tab queue behavior.
- Adding another queue store or changing the shell's existing command routing.
