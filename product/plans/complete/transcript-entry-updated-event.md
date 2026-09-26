# Give in-place transcript rewrites their own bus event

**Complexity: 3/10** — one new variant on the transcript channel's event union, two emit sites, and one new store subscription. No new architecture; the risk is confined to which subscribers hear which event, and every subscriber has colocated tests.

The transcript channel's `BusEvent` union in `src/bus.ts` has one "entry appended" event, and two things that are not appends reuse it. `updateRunningEntry` in `src/tab/transcript/events.ts` rewrites a running entry in place and, only when `hooks.trailing && output`, emits `entry:appended` with a synthetic `{ input: '', output }` entry that is not in the log. The exit handler in `src/pseudoterminal-manager.ts` rewrites an inline terminal card's status and re-emits `entry:appended` with the entry already in the log. `TranscriptStore` saves only on `entry:appended` and `tab:cleared`, so a command that finishes with empty output (`cd`, `mkdir`) is never written back and relaunches as still running. Meanwhile the daily `TranscriptLogger` and `subscribeMonitor` treat the terminal exit's re-emit as a new line, feeding the command a second time.

## Goal

A new `{ type: 'entry:updated'; tabLabel: string; tab: Readonly<Tab> }` event on the transcript channel means "an entry already in this tab's log was rewritten". It is emitted when a running entry is finalized (whatever its output) and when an inline terminal card exits. `TranscriptStore` persists on it; the logger, monitors, and the controller's agent-state/notification subscription stay on `entry:appended` only, so they no longer hear the terminal exit as a new entry.

## Approach

1. **`src/bus.ts`**: add the `entry:updated` variant to `BusEvent`.
2. **`src/tab/transcript/events.ts`**: in `updateRunningEntry`, when `running` is false and a matching entry was found and rewritten, emit `entry:updated` after the finalize and unread hooks. The existing trailing `entry:appended` (only when `hooks.trailing && output`) stays as it is, since that is how a finished command's output reaches the daily log and monitors.
3. **`src/pseudoterminal-manager.ts`**: in `handleExit`, emit `entry:updated` in place of `entry:appended`. The direct `persist(buildAgentState(tab))` call there already covers agent state, which the controller's `entry:appended` subscription used to repeat.
4. **`src/transcript/store.ts`**: subscribe to `entry:updated` and call `save(tabLabel, tab.log)`; correct the class comment so it describes the events it persists on instead of the direct `save()` calls that no longer exist.

## Implementation steps

1. Add the event variant and the store subscription with its comment fix.
2. Emit `entry:updated` from `updateRunningEntry`.
3. Swap the PTY exit re-emit for `entry:updated`.
4. Update and add tests; run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/tab/transcript/events.test.ts`: an empty-output finalize emits `entry:updated` with the tab and no `entry:appended`; a still-running update emits no `entry:updated`; a finalize with no matching running entry emits no `entry:updated`. The existing "no trailing entry" case narrows its assertion to `entry:appended`, since the finalize now emits `entry:updated` on the channel; the `finishRunningTab` empty-output case likewise asserts no `entry:appended` and an `entry:updated`.
- `src/transcript/store.test.ts`: the store persists the full log on `entry:updated`.
- `src/pseudoterminal-manager.test.ts`: an inline terminal exit emits `entry:updated` for its tab and no `entry:appended`.
- `src/monitor/*.test.ts` and `src/transcript/logger.test.ts` hold no expectation of the exit re-emit, so they stay unchanged.

## Spec

`product/specs/state-directory.md`: the transcript relaunch record is rewritten when an entry finishes in place, so a command that finished with no output, or an inline terminal that exited, relaunches as finished.

## Out of scope

- The synthetic trailing `entry:appended` that hands a finished command's output to the logger and monitors keeps its "append that is really a completion" shape for a later increment.
- Clearing stale `running` flags on rehydrate in `src/tab/rehydrate.ts` is a separate decision.
