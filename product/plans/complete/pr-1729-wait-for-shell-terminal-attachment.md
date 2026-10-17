# Wait for shell terminal attachment before queue draining

**Complexity: 7/10** — coordinate attachment lifecycle, FIFO gating, generation replacement, and an asynchronous integration test while preserving receipt dispatch behavior.

## Goal

Prevent the shell FIFO from dequeuing queued rows until the terminal handle for the current PTY has attached. Preserve queue order, shell busy/idle pauses, and continuation after a shell prompt.

## Approach

Extend the existing terminal lifecycle with an attachment-ready signal associated with the current PTY generation. It is true only after `onAttached` installs the terminal handle and false for a different generation or cleanup. Guard the queue's dequeue transport with that readiness so stored shell-routed and application-routed rows cannot be removed while attachment is pending. Wake the FIFO when the current attachment resolves and stored rows are available.

Keep `CommandQueue` as the only FIFO implementation and keep structured receipt pairing unchanged. A late attachment callback from a disposed generation must not make the replacement generation ready.

## Implementation steps

1. Expose current-generation terminal attachment readiness from `useShellTerminal` through `useShellTabTerminal`.
2. Gate `useShellCommandQueue`'s dequeue transport with readiness and wake it once the matching terminal is attached and stored rows are available.
3. Add a deferred-attachment ShellTab integration case proving no dequeue or write occurs before resolution, then proving one write and continued draining after zsh reports its prompt.
4. Update the command queue behavior spec for attachment-gated shell FIFO draining.

## Tests

Use the existing `ShellTab.test.tsx` fake terminal and deferred-promise helper. Queue a shell-directed row while attachment is unresolved; assert no dequeue intent and no terminal write. Resolve the attachment, verify one write, report the prompt, and verify the next row can drain in FIFO order. Run `./scripts/run.mjs check-diff` after each implementation change.

## Out of scope

- Changes to core queue semantics or structured receipt contracts.
- Scheduling, server-side queue storage, or terminal attachment retry behavior.
- Public documentation changes; this is a correction to behavior not explicitly described in user-facing docs.
