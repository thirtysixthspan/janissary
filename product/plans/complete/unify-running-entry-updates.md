# Route every running-entry update through one choreography in the tab module

**Complexity: 6/10** — one generalized operation added to `src/tab/transcript-events.ts`, three producers redirected to it (`TabManager` finalize, `ShellManager.run`, `AcpManager`), one deleted module (`src/acp/runner.ts`), and one deliberate behavior change (ACP and finalize paths stop matching by the bare running flag) pinned by new tests. All inside the tab/shell/acp modules plus their colocated tests; no protocol, wire, or client changes.

Today three producers each hand-roll "update the running transcript entry, finalize it, persist, and emit" with divergent rules:

| Producer | Where | Match | Busy | Unread | Trailing `entry:appended` emit |
|---|---|---|---|---|---|
| Tab finalize | `finishRunningTab` (`src/tab/transcript-events.ts`) via `TabManager.finishRunning` | running flag alone | `deleteBusy` in-place | marks unread | when `output && tab` |
| Shell | inline `update` closure in `ShellManager.run` (`src/shell-manager.ts:131`) | `input === command && running` | `deleteBusy` in-place | at `onDone`, outside the closure | at `onDone`, outside the closure |
| ACP | `makeUpdateRunning` (`src/acp/runner.ts`) | running flag alone | none (`finished`/`error` handlers own it) | none | when `!running && output && t`, inside |

The flag-only matches make whatever entry happens to be last-running on a tab a clobber target: an ACP stream or a monitor/browser/question finalize rewrites a shell command's entry (and vice versa, or whichever landed last). `src/tab/transcript-events.ts` becomes the single owner.

## Goal

One operation owns the running-entry update — finding the entry, rewriting it, firing finalize hooks, the trailing emit, and the dirty broadcast — and the three producers call it with only the parameters where they genuinely differ.

## Design decisions

**One operation, `updateRunningEntry(tabs, label, match, output, running, hooks)`, in `src/tab/transcript-events.ts`.** The module is already the owner of the tab-module copy and its header comment describes exactly this role. `match` selects the entry:

- `{ command: <text> }` — matches the running entry whose `input === <text>` (what the shell already does).
- `{ markdown: true }` — matches a running entry flagged `markdown`, which is the inherent marker of ACP turns (`startTurn` appends every ACP entry with `markdown: true`; no other producer sets it).
- `undefined` — bare running-flag matching, the prior finalize semantics, kept as the default so existing tests and any caller that passes no match behave exactly as today.

`hooks` carry the per-producer steps: `finalize?: (tab) => void` runs when the entry stops running (busy clearing, persistence — ACP passes persist-only, because its `finished`/`error` handlers own `deleteBusy` and fire it later; clearing busy inside the operation would unbusy the tab between `endTurn` and the next `startTurn` of a multi-turn tool loop); `markUnread?: (label) => void`; `trailing?: boolean` gates the trailing `{ input: '', output }` `entry:appended` emit (ACP yes, the tab finalize yes, shell no — its trailing emit and unread marking stay in `onDone` within `ShellManager.run`, which is part of the shell's deliberate choreography, unchanged). The dirty broadcast is unconditional, as all three copies emit it today even for a missing tab.

**`TabManager` exposes two methods, both delegating through `transcript-operations.ts`.** `updateRunning(label, match, output, running, hooks)` is the producers' entry point (`ShellManager` and `AcpManager` call it "through Managers.tab", as the debt item asks). `finishRunning(label, output, match?)` keeps its signature and grows an optional match, which the tab module generalizes into a call to the same operation — that is the finalize choreography generalized, not a second implementation.

**The five production `finishRunning` callers pass their match text.** `src/monitor/ask.ts` (both calls), `src/connection/manager.ts`, `src/browser/tab.ts` (both calls), and `src/commands/question.ts` all hold the exact string they passed to the paired `startRunning` and pass it again — the pairing is already one-to-one in each file.

**`src/acp/runner.ts` and `src/acp/runner.test.ts` are deleted.** `makeUpdateRunning` was their only content. The behavior-change pin the debt item wanted in `src/acp/runner.test.ts` cannot live in a file for a module that no longer exists, so it lands in `src/acp/manager.test.ts` (asserting ACP's handler calls carry the `{ markdown: true }` match) and, for the no-clobber behaviors against real tab state, in `src/tab/transcript-events.test.ts`. `acp/manager.test.ts`'s existing verbose mocks of `makeUpdateRunning` are retargeted onto a `managers.tab.updateRunning` stub in its fake `Managers`.

**No comment rot:** the shared operation carries the prose comment naming the match semantics, matching this module's commenting style.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The logging wrapper chain the producers go through (`startRunningTab`, `appendTab`) | `src/tab/transcript-events.ts` |
| The pure log mutators (`capLog`, `appendEntry`, `finishRunningEntry`) | `src/tab/transcript-log.ts` |
| The delegation pattern between manager and module | `src/tab/transcript-operations.ts` |
| The trailing-emit + unread choreography being generalized | `finishRunningTab` |

## Implementation steps

1. **`src/tab/transcript-events.ts`**: add `RunningEntryMatch` (type), `updateRunningEntry`, and the hooks type; rewrite `finishRunningTab` to delegate to it (optional trailing `match` parameter, default `undefined`). `startRunningTab`, `markUnreadTab`, `appendTab`, `clearTranscriptTab` untouched.
2. **`src/tab/transcript-operations.ts`**: add the `updateRunning` passthrough; forward the optional match through `finishRunning`; re-export the `RunningEntryMatch` type.
3. **`src/tab/manager.ts`**: `finishRunning` gains the optional match parameter; add `updateRunning`.
4. **`src/shell-manager.ts`**: delete the hand-rolled `update` closure; call `managers.tab.updateRunning` with the command-text match and the deleteBusy+persist finalize hook.
5. **`src/acp/manager.ts`**: delete the `makeUpdateRunning` wiring; chunk/endTurn/error call a private `updateRunning` helper that passes the `{ markdown: true }` match, `trailing: true`, and the persist-only finalize hook.
6. **Call sites**: `src/monitor/ask.ts`, `src/connection/manager.ts`, `src/browser/tab.ts`, `src/commands/question.ts` pass their match text.
7. **Delete** `src/acp/runner.ts` and `src/acp/runner.test.ts`.

## Tests

- **`src/tab/transcript-events.test.ts`** (extended) — the central op: updates the last matching running entry in place while still running (persisted state untouched); on finalize fires the finalize hook, marks unread, emits the trailing entry, and emits `state: dirty`; emits no trailing entry when output is empty or `trailing` is unset — the four behaviors `acp/runner.test.ts` pinned, now owned by the operation.
- **`src/tab/transcript-events.test.ts`** (behavior change, new cases) — with an ACP entry and a later interleaved shell entry both running: the ACP match (`markdown`) updates the ACP entry and leaves the shell entry untouched; a command-text match finds only the entry whose input equals the command; the bare (no-match) finalize still updates the running entry as before.
- **`src/acp/manager.test.ts`** — the `makeUpdateRunning` mocks become a `managers.tab.updateRunning` stub; the error/chunk/endTurn assertions now expect that method called with `('tab1', { markdown: true }, <output>, <running>, …)`.
- **`src/shell-manager.test.ts`, `src/controller.test.ts`** (busy and queue cases), `src/message-handler-exhaustive.test.ts`, `src/tab/transcript-log.test.ts` — unchanged; they drive real managers and pin the surrounding shapes.

## Spec

`product/specs/transcript.md` gains a short subsection: the running entry each producer updates is selected by producer identity — a shell command by its command text, an ACP reply by its markdown flag — so an interleaved run from another producer is never overwritten by the wrong producer finalizing. No other spec documents the current clobbering behavior.

## Docs

No `help.md` or `documentation/user-documentation/` text describes per-entry update matching; nothing to update.

## Out of scope

- Changing the wire shape or `src/protocol.ts` (that is the coexistence-with `seq`-numbering debt item, deferred separately).
- Making the ACP path match by continuation-turn input text (turns 2+ carry no text; `markdown` is the producer marker).
- Unifying `startRunning`/`appendTab` emissions further, or touching `src/tab/transcript-log.ts`'s pure mutators.
- Reviewing whether the man's `shell` busy/queue cases pin new behaviors beyond what the tests say — the controller tests stay green as the gate.
