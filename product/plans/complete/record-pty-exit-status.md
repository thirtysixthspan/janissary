# Record the PTY's exit status in harness and ssh recordings

Complexity: 4/10

## Goal

Make every harness and ssh recording end with the `x` event its PTY reported, so the asciicast player can show `exit <code>` as the plan and the specs already promise.

## Background

A real session, stopped the way a user stops one, produced a `.cast` file that ended on an output event and carried no `x` event at all. The recorder does handle the exit event — `HarnessRecorder` subscribes to `pty` `['data', 'exit', 'resize']` and `onExit` writes `x` then disposes itself — but it never gets the chance, because something else disposes it first.

Two listeners watch `pty:exit`. `HarnessRecorder`'s is created per PTY, inside `harnessRuntime()` / `sshRuntime()` at spawn time. `HarnessRuntimes`' is created by the field initializer at `src/harness/tab-spawn.ts:23`, so it is registered when the manager is constructed — long before any recorder exists. `messageBus` keeps listeners in a `Set` and dispatches a snapshot of it in insertion order (`src/bus.ts:30`, `:84`), so on exit the registry's listener runs first. It calls `release(id)`, which disposes the runtime, which disposes the recorder — `dispose()` unsubscribes and clears `this.stream` (`src/harness/recorder.ts:51`). The recorder's listener still runs from the dispatch snapshot, but `writeEvent` opens with `if (this.failed || !this.stream) return` (`:130`), so the exit status is received and dropped.

The recorder's own test for the `x` event passes because it emits `pty:exit` with no registry listening — the passing test is what hid this.

## Approach

Let the runtime's own observers see the event that ends its PTY before the registry tears them down. The registry still releases on exit, still drops the entry, and still disposes the runtime; it just does so after the dispatch that carried the event has finished, rather than part-way through it.

Two properties must survive that change:

- A runtime released by a tab close, an `install` under a recycled id, or `dispose()` stays synchronous — only the exit path defers, and nothing about it needs to be synchronous.
- A runtime installed under the same id between the exit and the deferred release must not be dropped in its place. The listener therefore captures the entry it means to release and releases it only if the map still holds that same entry, which also keeps the existing "a late exit for an already-released runtime" behavior.

Deferring rather than removing the registry's exit subscription is deliberate: that subscription is what stops a detached remote harness's `kill` from reaching the far side, and it is the registry's reason for existing.

## Implementation steps

1. In `HarnessRuntimes`'s `pty:exit` listener, capture the entry the id currently holds, then release it from a microtask, and only when the id still holds that same entry.
2. Leave `HarnessRecorder`, `HarnessRuntime`, and both spawn paths alone — the recorder's own handling of the event is correct and needs no change.

## Tests

- A recorder behind a real `HarnessRuntimes`, with the registry constructed first as it is in production: emitting `pty:exit` leaves an `x` event as the recording's last line, carrying the status that was reported. This is the case `src/harness/recorder.test.ts` cannot reach on its own, and the one whose absence let the bug through.
- The complement, on the same wiring: a runtime released by a tab close writes no `x` event, so the deferred release does not turn into an invented status.
- A runtime installed under an id between the exit and its deferred release survives, so an attach that reuses the id is not dropped.
- The registry's existing exit behavior still holds: the entry is gone and the runtime disposed once the dispatch finishes.

Harness and ssh need no separate case: both runtimes are installed into the same `HarnessRuntimes` instance (`HarnessManager.registerSshObservers` and `HarnessTabSpawn.finishSpawn`), `src/harness/manager.test.ts` already asserts an ssh runtime is released through it, and the recorder writes the event without regard to the label or command it was built for.

## Out of scope

- Inventing an exit status for a session ended by its tab closing or by the application shutting down. The specs say none is invented, and that stays true.
- The `live` badge's meaning, which is a separate entry in the pull request backlog.
- Any change to the asciicast v3 writer beyond the exit event.