# Collapse the transcript module chain under src/tab/

**Complexity: 5/10** — four small modules merge into two, two misfiled functions move to the modules they belong to, and one caller updates its imports. No behavior changes, and the only consumer of the whole chain is `src/tab/manager.ts`.

## Goal

`src/tab/` currently spreads transcript handling over five files in a straight call chain: `manager.ts` → `transcript-operations.ts` → `transcript-commands.ts` → `transcript-ops.ts` → `transcript.ts`, with `transcript-text.ts` alongside. Finding where a transcript mutation actually happens means walking four hops, and the `-operations` / `-commands` / `-ops` suffixes carry no distinguishable meaning.

The middle layer earns none of those hops. `transcript-operations.ts` contributes a bare re-export (`export { finishRunningTab as finishTabRunning } from './transcript-commands.js'`) plus four one-line forwarders — `startTabRunning`, `capTabLog`, `appendTabTranscript`, and `clearTabTranscript` each just call the identically shaped function one file down. The two functions in it that *do* work, `buildTabViews` and `rehydrateTabState`, are not transcript code at all: they assemble arguments for `view.ts` and `rehydrate.ts`.

Collapse the chain to two transcript modules named for what they own, and put the two misfiled functions where they belong.

## Approach

Split along the seam architecture principle 4 already draws — pure data mutation versus effectful coordination — instead of along the meaningless `-ops`/`-commands`/`-operations` ladder:

- **`src/tab/transcript-log.ts`** — the pure layer. Merges `transcript.ts` (`capLog`, `finishRunningEntry`) and `transcript-ops.ts` (`appendEntry`, `finishEntry`, `clearLog`). Every function takes a log or a tab and returns/mutates data; no bus, no persistence.
- **`src/tab/transcript-events.ts`** — the effectful layer, renamed from `transcript-commands.ts` and otherwise unchanged. Wraps the pure mutations with the `messageBus` emits, persistence, and unread-marking that make them visible to the rest of the app.

`buildTabViews` moves to `src/tab/view.ts` beside the `buildTabView` it maps over, and `rehydrateTabState` moves to `src/tab/rehydrate.ts` beside `rehydrateTabs`. `transcript-operations.ts`, `transcript-ops.ts`, and `transcript.ts` are then deleted. `transcript-text.ts` is untouched — it is a standalone renderer with its own test and no place in the chain.

`manager.ts` drops the forwarders and calls the real functions directly: `startRunningTab`, `capLog`, `appendTab`, `clearTranscriptTab`, `finishRunningTab`.

## Implementation steps

1. Create `src/tab/transcript-log.ts` holding `capLog`, `finishRunningEntry`, `appendEntry`, `finishEntry`, and `clearLog`, with `finishEntry` calling `finishRunningEntry` directly in-module.
2. Rename `transcript-commands.ts` to `transcript-events.ts` (via `git mv`) and repoint its pure-mutation import at `./transcript-log.js`.
3. Move `buildTabViews` into `src/tab/view.ts` and `rehydrateTabState` into `src/tab/rehydrate.ts`, carrying their imports with them.
4. Update `src/tab/manager.ts` to import `markUnreadTab`, `startRunningTab`, `appendTab`, `clearTranscriptTab`, and `finishRunningTab` from `./transcript-events.js`, `capLog` from `./transcript-log.js`, `buildTabViews` from `./view.js`, and `rehydrateTabState` from `./rehydrate.js`, adjusting the call sites to the real function names.
5. Delete `transcript-operations.ts`, `transcript-ops.ts`, and `transcript.ts`.

## Tests

The chain has no direct test coverage today — only `transcript-text.test.ts` exists, and the rest is exercised indirectly through `manager.test.ts` and `controller.test.ts`. Both survivors get a colocated test file:

- `src/tab/transcript-log.test.ts` — `capLog` returns the log unchanged under the cap and drops the oldest entries over it; `finishRunningEntry` marks the most recent running entry finished and returns the same reference when nothing is running; `appendEntry` appends, resets `scrollOffset`, and returns the number of entries trimmed; `finishEntry` writes the output onto the running entry; `clearLog` empties the log.
- `src/tab/transcript-events.test.ts` — `markUnreadTab` sets `hasUnread` only for a tab that is not docked, active, or secondary; `startRunningTab` adds the label to the busy set and appends a running entry; `appendTab` emits `entry:appended`, emits `entries:trimmed` only when the cap dropped entries, and marks unread; `finishRunningTab` finishes the entry, clears busy, persists, and emits; `clearTranscriptTab` empties the log, persists, and emits `tab:cleared`.

## Out of scope

- The top-level `src/transcript/` directory (`logger.ts`, `store.ts`, `types.ts`). It is the on-disk transcript store, a different concern from these per-tab log mutations, and it already has its own tests.
- `src/tab/transcript-text.ts`.
- Splitting `src/tab/manager.ts` or removing its `max-lines` suppression — its own backlog item.
- Changing what any transcript mutation does, which events it emits, or when.

## Documentation

None. This is an internal restructure: no command, flag, default, or user-visible behavior changes, so no functional spec, `help.md` entry, or user documentation page describes anything that is now different.
