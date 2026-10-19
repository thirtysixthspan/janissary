# Keep remote process resources on their owning table entry

**Complexity: 5/10** — this is a focused lifecycle refactor in one server class, with existing colocated process, browser, and detach-query tests covering the affected behaviors. The main risk is teardown ordering between explicit kill and process-exit callbacks.

## Goal

Store each remote process's writer, resizer, harness detection, and browser handle on its single `entries` record so spawning and releasing process state use one table entry.

## Design decisions

Keep resource handles optional where the process mode does not acquire them: pipe processes have no resizer, ordinary PTYs have no detector, and non-browser spawns have no browser handle. Return acquired resources from `spawnPty` and `spawnPipe`, then insert the complete record once in `spawn`.

Release detection and browser resources idempotently from `finish` and `killAll`. Keep the browser release in the PTY spawn catch because no process record exists if the spawn throws. Preserve the pipe's `ended` guard, the resize `messageBus` event, and all public queries' existing behavior.

## Implementation steps

1. Move writer, resizer, detection, and browser fields into the process record. Route input, resize, capture, busy-state, resume acknowledgment, and browser cleanup through that record.
2. Make `finish` delete the owning record and dispose its detection/browser. Make `killAll` dispose those resources for every record as it kills the processes, without relying on exit callbacks.
3. Extend process lifecycle coverage for `killAll` detection disposal. Keep the existing process, browser, lazy-browser, and detach-query tests covering spawn, input, resize, exit, browser release, and capture queries; add targeted cases only where a teardown behavior is not already pinned.
4. Remove only this item from the technical-debt ready section and move this plan through draft, ready, and complete.

## Specs and documentation

No spec or user documentation change is needed. The refactor preserves process, browser, detection, and detach-query behavior; only internal ownership and guaranteed cleanup change.

## Out of scope

- Changing remote process wire frames or spawn behavior.
- Changing detection policy, browser startup, or message-bus events.
- Resolving any other technical-debt item or altering unrelated working-tree changes.
