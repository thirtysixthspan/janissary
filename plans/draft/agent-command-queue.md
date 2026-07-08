# Agent Command Queue

**Complexity: 6/10** — no new state machine (the existing `busy` flag is the correct gate), but it touches the command dispatch seam (`CommandManager`), reroutes one busy-clearing path (`finishRunning`), adds a drain loop with real re-entrancy/ordering reasoning, a new per-tab queue with persistence, two new RPCs plus a new `TabView` field, a new `enqueue` command module, a fifth picker overlay (pattern well established), and a novel edit-in-place interaction between the popup and the command line.

## Requirements source

The authoritative requirement list is the "Agent command queue" section of `plans/todo-features.md` (lines 8–30), plus one addendum from the user: **the `queue` command opens the queue popup** (the command-line equivalent of `Cmd+E`, exactly as `hist` is to `Ctrl+R`). Every behavioral sentence maps to a test row below. Note the entry that used to live in `todo-features.md` ("Agent task queue" / `task add`) has been replaced by this requirements block; the `Enqueue <agent> <command>` requirement subsumes the old `task add` idea.

## Summary

Give every **agent** tab a command queue. While a tab's agent is busy, anything submitted on its command line is appended to that tab's queue instead of executing immediately. When the agent finishes its current work, the queue drains FIFO, one command at a time. `Cmd+E` or the `queue` command opens a `queue` popup (same shape as the `hist` popup) over the command line of the exposed tab, letting the user browse, edit in place via the command line, and delete queued commands. A new `enqueue <agent> <command>` app command appends a command to another agent's queue. Only agent tabs (`TabView.view` undefined or `'agent'`) have queues.

## Design decisions

1. **Queue is per-tab, FIFO, unbounded.** One array per label, appended on submit-while-busy, drained front-first on every busy → idle transition. No cap is specified in the requirements and none is added (contrast with `cmdHistory`'s specified 100-entry cap, `recordHistory` at `src/tab-manager.ts:272` `slice(-100)`). If a cap is wanted later it is a one-line change in `enqueue`.
2. **"Busy" is the existing `TabManager.busy` Set — reused, not reinvented.** The requirement text maps exactly onto the current `isBusy`/`addBusy`/`deleteBusy` machinery (`src/tab-manager.ts:43-61`) plus `startRunning`/`finishRunning` (`src/tab-manager.ts:216-238`). No second busy concept is introduced.
3. **`deleteBusy` becomes the single drain point — which requires one rerouting fix.** Verified: `shell-manager.ts:83` and `acp-manager.ts:114,119` already call `deleteBusy`, but `finishRunning` clears the flag inline via `this.busy.delete(label)` at `src/tab-manager.ts:228` — it does **not** call `deleteBusy`. Since browser (`browser-tab.ts:96,99`), connection (`connection-manager.ts:57`), and monitor (`monitor-manager.ts:173,176`) completions all route through `finishRunning`, the drain hook would miss them as originally planned. Fix: replace the inline `this.busy.delete(label)` in `finishRunning` with a call to `this.deleteBusy(label)`. A grep for `busy.delete` confirms these are the only two clearing sites, so after this one-line change `deleteBusy` really is the single funnel.
4. **The drain is deferred by a microtask and loops until blocked.** `deleteBusy`, after clearing the flag, schedules the drain callback with `queueMicrotask` when the label's queue is non-empty. Deferral matters: `finishRunning` persists state and emits transcript/state events *after* clearing busy, and a synchronous drain would interleave the next command's `startRunning` append into the middle of the previous command's completion events. The drain itself (owned by `CommandManager`, see change 2) must **loop**: dequeue and run entries until the tab is busy again, the queue is empty, or a route chooser became pending. The loop is required because a dequeued command can complete synchronously without ever setting busy (an `output`-kind command like `help`, or an `app` command) — without the loop the queue would stall forever behind such a command, since no busy → idle transition would follow.
5. **Two additional drain triggers prevent stalls.** (a) `dispatch`/`dispatchTo` enqueue not only when the tab is busy but also when the tab is idle with a **non-empty** queue — the new command goes to the back and the drain is invoked, preserving FIFO order. This is what un-stalls a queue restored by `--relaunch` (decision 8) on the first user input, and it prevents a newly typed command from jumping ahead of queued ones. (b) `chooseRoute` (`src/command-manager.ts:21-29`) ends by invoking the same drain, covering the case where a dequeued command opened the route chooser and the chosen (or cancelled) route resolved synchronously without setting busy.
6. **Server-authoritative editing.** Per architecture principle 1, queue contents live on the server (`TabManager`); the client sends intents (`editQueuedCommand`, `deleteQueuedCommand`) rather than mutating a local copy. Both RPCs are index-based against the active tab's queue and no-op server-side when the index is out of range; a keystroke racing a concurrent dequeue can therefore patch at a stale index in the worst case — accepted at local-only latency, and noted in the spec. Per-keystroke edit RPCs ride the same full-state broadcast the app already does per shell keystroke (principle 8's known trade-off).
7. **Selection/edit/delete key model (reconciles requirement lines 22–26, which conflict on Backspace).** While the popup is open: moving the selector with Up/Down *or* clicking a row **selects** that row, and selecting copies the row's text into the command line, overwriting whatever is there (requirement line 23 sanctions the overwrite). Typing in the command line then patches the selected row via `editQueuedCommand` on every change (line 24) — including Backspace while the line is non-empty, which is ordinary text editing. Delete/Backspace remove the selected row (line 26) **only when the command-line textarea is empty**; the removal clamps the selector, leaves the command line empty (the next row's text is *not* copied in, so repeated Backspace deletes row after row), and keeps the popup open. This empty-line rule is the only reading that lets Backspace serve both line 24 (edit) and line 26 (delete); backspacing a row's text to empty and pressing Backspace once more deletes the row, chip-style. Enter/Return is an explicit no-op (line 25) — it must not submit, run, or close. Escape closes with no side effect. An empty-string row (text backspaced away but not deleted) is legal; when drained it resolves to `resolveCommand`'s `empty` kind and the drain loop moves on.
8. **Persistence across `--relaunch`: the queue persists; the tab restores idle.** `commandQueue?: string[]` is added to `AgentState` (`src/types.ts:189-204`), emitted from `buildAgentState` (`src/tab-manager.ts:85-100`) so every existing persist call site carries it, and restored in `rehydrate` beside the existing `if (s.cwd)` / `if (s.context)` restores (`src/tab-manager.ts:380-382`). The busy flag is persisted today as `AgentState.active` but is never restored into the `busy` Set, so a relaunched tab is always idle; a restored non-empty queue sits waiting and drains on the first `dispatch` into that tab (decision 5a) — no startup auto-run, so a relaunch never fires commands unprompted.
9. **Only agent tabs have command queues (requirement line 28).** The gate in `dispatch`/`dispatchTo` and the `enqueue` command both apply only when the target tab is an agent tab, using the same predicate `send` already uses (`target.view === undefined || target.view === 'agent'`, `src/commands/send.ts:26`). Non-agent tabs dispatch exactly as today. The `Cmd+E` opener no-ops when the active tab is not an agent tab (mirroring how `canSearch` gates `Cmd+F`, `web/src/App.tsx:72`); the command bar already renders only for non-view tabs, so this guard is belt-and-braces.
10. **`enqueue <agent> <command>` always enqueues, then drains.** It appends to the target's queue regardless of the target's busy state (that is its point — explicit queueing), then invokes the drain, so an idle target with nothing else queued runs the command immediately while a busy target keeps it queued. It does not write the target's `cmdHistory` (the issuing tab's history records the full `enqueue …` line through normal dispatch). See change 4 for the module contract.
11. **What never queues.** (a) Commands the client intercepts before dispatch — `hist`, `nav`, `syntax theme`, `quit`, the `close`/`exit` guards (`web/src/App.tsx:207-215`), and the new `queue` — never reach the server, so they work while busy and never queue; the spec should say so.
12. **The `queue` command mirrors `hist` in both halves.** Client: intercepted in `App.tsx`'s `onSubmit` beside `if (trimmed === 'hist') openPicker()` (`App.tsx:208`), calling `openQueue()` — always opens, like `hist` ("Always open" comment at `App.tsx:92`), not a toggle like `nav`. Server: a no-op command module `src/commands/queue.ts` modeled on `src/commands/hist.ts` (exact-match `queue`, `run` is a server-side no-op with the same "interactive, client-side" comment rationale), registered in `commands/index.ts` — so a `queue` that reaches the server non-interactively (scheduled dispatch, `send`, a drained queue entry) resolves to a harmless app command instead of an unknown-command route prompt. (b) `msg`/`broadcast` delivery does not pass through `dispatch`/`dispatchTo` at all: `AgentCommunicationManager.handle` routes `command`/`request` messages through `CaptureManager.run` (`src/agent-communication-manager.ts:65-77`, `src/capture-manager.ts:9-29`), which calls managers directly. Messaging keeps its own per-recipient FIFO (`pump`, `src/agent-communication-manager.ts:33-43`) and is deliberately untouched — do not conflate the two queues. (c) Everything else that funnels through `dispatch`/`dispatchTo` **is** gated, which is a deliberate behavior change for the three programmatic dispatchers: scheduled commands (`schedule-manager.ts:96`), the `send` command (`commands/send.ts:27`), and accepted monitor suggestions (`monitor-window.ts:86`) now queue instead of running concurrently when the target is busy — this is the requirements' "single command may be processed at a time" applied uniformly, and each affected spec gets a sentence (change 8).

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Busy/idle state per tab | `TabManager.busy: Set<string>`, `isBusy`/`addBusy`/`deleteBusy` | `src/tab-manager.ts:22,43-61` |
| Busy-clearing paths | `deleteBusy` calls at `shell-manager.ts:83`, `acp-manager.ts:114,119`; inline `this.busy.delete(label)` in `finishRunning` (`tab-manager.ts:228`) — rerouted by this plan | see decision 3 |
| Single entry point for typed commands | `CommandManager.dispatch` (`:31-35`) / `dispatchTo` (`:37-43`) → private `run` (`:45-76`) | `src/command-manager.ts` |
| Per-label state maps + persist + restore pattern | `cwd`/`context` maps, `buildAgentState`, `rehydrate`'s `if (s.cwd)` restores | `src/tab-manager.ts:21,23,85-100,380-382` |
| Tab-strip busy dot blink | `.tab .dot.busy` rule + shared `dot-blink` keyframes (600ms on/off) | `web/src/theme.css:101-103`; behavior spec'd in `specs/tabs.md` "Busy indicator" |
| Command-line dot + prompt glyph | `<span className="dot">●</span>` and `<span>❯</span>` in `CommandInput` | `web/src/CommandInput.tsx:134-135` |
| Modal popup above the command line | `HistoryPicker.tsx` (`.picker`/`.picker-title`/`.picker-row` markup, `data-doc-shot` attr) | `web/src/HistoryPicker.tsx` |
| Picker mutual exclusion (render) | priority chain `route` → theme → nav → hist | `web/src/PickerOverlays.tsx:35-40` |
| Picker mutual exclusion (keys) | `dispatchModalKey` chain, same order | `web/src/useWindowKeys.ts:47-65` |
| Picker key handling (clamped Up/Down `Math.max`/`Math.min`, no wraparound; Enter; Escape) | `handlePickerKey` | `web/src/keyboard-handlers.ts:20-35` |
| Chord openers pattern | `Ctrl+R`/`Ctrl+G` handlers; `Cmd+F` shows the `metaKey` precedent | `web/src/useWindowKeys.ts:90-97` |
| "Split picker state out of App.tsx" pattern | `useThemePicker.ts` (comment: "split out to keep App.tsx under the file-size limit"), `useTabNav.ts` | `web/src/useThemePicker.ts`, `web/src/useTabNav.ts` |
| Callback-through-ref between App and a child | `guardRef` (`useRef<((index) => boolean) | null>`) assigned by `CloseSaveGuard` | `web/src/App.tsx:99`, `web/src/CloseSaveGuard.tsx` |
| Command targeting another tab by label/alias, agent-tab check, transcript confirmation | `send` command | `src/commands/send.ts` |
| Pure parser + command module registration | `parseSendCommand`; `commands` array picked up by `resolveCommand` (`resolve.ts:28-30`) | `src/commands/send.ts:6-14`, `src/commands/index.ts` |
| Agent-name tab completion for a command's first argument | `completeSendTarget` (`if (argumentIndex !== 1 || command !== 'send')`) | `src/completion-handlers.ts:24-35` |
| Simple RPC routing | `RpcCall` union → `message-handler.ts` switch → thin `Controller` delegate (`renameTab`, `toggleCollapse`) | `src/protocol.ts:87-120`, `src/message-handler.ts`, `src/controller.ts:145-151` |
| One wire contract, shared | `src/protocol.ts` is imported by the web client via the `@shared` alias — **there is no web mirror anymore** (header comment `src/protocol.ts:2`, alias in `web/vite.config.ts:13` and `web/tsconfig.json:13`) | `src/protocol.ts` |

## Verified codebase facts that shape the design

- `busy` is already a `TabView` field (`src/protocol.ts:35`) and already drives the tab-strip dot blink. The command-line dot/prompt are new *consumers* of the existing signal; the tab strip needs no change.
- `CommandManager.run` handles `harness`/`ssh` short-circuits and then a switch over `resolveCommand(input).kind` (`empty`/`shell`/`output`/`unknown`/`app`, `src/command-manager.ts:45-76`). The queue gate sits in `dispatch`/`dispatchTo` **before** `run`, so every command kind queues uniformly. `chooseRoute` and `resolveUnknownCommand`'s re-entry callback call `run` directly — correctly bypassing the gate, since they fire only for a command already accepted for execution.
- `recordHistory` runs at the top of `dispatch`/`dispatchTo` (`src/command-manager.ts:32,40`) and stays before the gate: a queued command enters history (and global history) at submit time, exactly once — the later drain calls `run` directly and records nothing, so there is no double entry.
- `recordHistory` returns the comment-stripped text and can return an empty string; the gate must not enqueue an empty `trimmed` (mirror `run`'s `empty` short-circuit) — otherwise submitting whitespace while busy would queue no-ops.
- The `Managers` construction order supports the wiring: `managers.tab` is created before `managers.command` (`src/controller.ts:34,48`), so `CommandManager`'s constructor can register the drain hook on `TabManager`.
- `closeTabResources` deletes the label's `context` entry (`src/tab-cleanup.ts:30`) but nothing today clears `busy` on close; the queue must not copy that leak — see change 1.
- `plans/todo-features.md` lines 8–30 are this feature's requirements; the previously planned separate "Agent task queue" (`task add`) entry no longer exists — `enqueue` replaces it.

## Proposed changes

### 1. Server: queue storage on `TabManager`

- Add `private queue = new Map<string, string[]>()` to `TabManager`, mirroring the existing `cwd`/`context` per-label maps. `tab-manager.ts` already carries a file-level `max-lines` disable (line 1), so the ~30 added lines trip no lint rule; a standalone-module extraction is not warranted for five small methods that must interlock with `deleteBusy` anyway.
- New methods, next to `isBusy`/`addBusy`/`deleteBusy`:
  - `queueFor(label): string[]` — the array (empty when absent).
  - `enqueue(label, text): void` — pushes, persists the tab's `AgentState`, emits the `state` `dirty` bus event (same pair `renameTab` uses at `tab-manager.ts:196-197`).
  - `dequeue(label): string | undefined` — shifts the front entry; persists and emits when it removed something.
  - `editQueued(label, index, text): void` — in-place replace; silently no-ops when `index` is out of range; persists and emits.
  - `deleteQueued(label, index): void` — splices; silently no-ops when out of range; persists and emits.
- `deleteBusy(label)` change: after clearing the flag, if `queueFor(label)` is non-empty, schedule the registered drain hook via `queueMicrotask` (decision 4). The hook is a `(label: string) => void` callback registered once through a new `setOnIdle` setter, called from `CommandManager`'s constructor. `deleteBusy` never executes commands itself — it only notifies.
- `finishRunning` change: replace `this.busy.delete(label)` (`tab-manager.ts:228`) with `this.deleteBusy(label)` (decision 3).
- `closeTab`: delete the label's queue entry alongside the existing per-label cleanup (`closeTabResources` already receives and clears the `context` map, `src/tab-cleanup.ts:30`; pass the queue map the same way so all label-keyed cleanup stays in one place — principle 6).
- `view()` (`src/tab-manager.ts:293-326`): add `commandQueue: this.queue.get(t.label) ?? []` next to `cmdHistory` (`:312`).
- `buildAgentState`: add `commandQueue: this.queue.get(tab.label)`; `rehydrate`: restore with `if (s.commandQueue)` beside the `cwd`/`context` restores (`:380-382`).

### 2. Server: gate and drain in `CommandManager`

- `dispatch`/`dispatchTo`: after `recordHistory`/`recordGlobalHistory` (unchanged), gate before `run`: when the target tab is an agent tab (decision 9 predicate) **and** `trimmed` is non-empty **and** (`isBusy(label)` **or** `queueFor(label)` is non-empty), call `enqueue(label, trimmed)`; if the tab was idle, also invoke the drain (decision 5a). Otherwise call `run` exactly as today. No transcript entry is appended on enqueue — the blinking dot, `queue ❯` prompt, and popup are the feedback.
- New private drain method (the `onIdle` hook target): loop — while the label's tab exists, is not busy, has no pending route (`this.pendingRoute`), and `dequeue(label)` yields a command, call `run(command, label, index)`, re-resolving `index` via `findIndex(label)` on each iteration (tab positions shift). A command that sets busy synchronously (shell via `addBusy` at `shell-manager.ts:72`, ACP via `startTurn`, browser/connection/monitor via `startRunning`) exits the loop; its completion re-enters through `deleteBusy`.
- `chooseRoute`: after its existing body, invoke the same drain (decision 5b).
- Register the hook in the constructor: `this.managers.tab.setOnIdle(...)` pointing at the drain method.

### 3. Protocol and routing

- `src/protocol.ts`: add `commandQueue: string[]` to `TabView` (next to `cmdHistory`, `:44`). **No mirror update** — the client imports these types via `@shared/protocol` (`src/protocol.ts:2`); architecture principle 7's "mirrored types" debt has been retired, so the single edit covers both sides.
- Add to the `RpcCall` union (`src/protocol.ts:87-120`), modeled on `renameTab`:
  - `{ method: 'editQueuedCommand'; params: { index: number; text: string } }`
  - `{ method: 'deleteQueuedCommand'; params: { index: number } }`
- `src/message-handler.ts`: two new switch cases delegating to `Controller`.
- `src/controller.ts`: two thin delegates beside `renameTab`/`toggleCollapse` (`:145-151`), resolving the **active** tab's label via `this.managers.tab.cur().label` and calling `editQueued`/`deleteQueued`. Active-tab targeting matches `dispatch` and the requirement that the popup shows only the exposed tab's queue.

### 4. Server: `enqueue` and `queue` command modules

- New `src/commands/enqueue.ts`, modeled line-for-line on `src/commands/send.ts`:
  - Pure parser `parseEnqueueCommand` (principle 4) accepting `enqueue <agent> <command…>`; missing agent or empty command returns `{ error: 'Usage: enqueue <agent> <command>' }`.
  - `run`: resolve the target by label or display alias exactly as `send` does (`send.ts:41-42`); no match → `No tab named "<label>".`; non-agent target → `Tab "<label>" has no command queue.`; otherwise `managers.tab.enqueue(target.label, text)`, invoke the drain (decision 10) via a small public `drainQueue(label)` on `CommandManager`, and append the confirmation `→ <label> (queued): <text>` to the issuing tab (same shape as `send`'s `→ <label>: <text>`).
  - Register in `src/commands/index.ts`; `resolveCommand` picks it up automatically (`resolve.ts:28-30`). Import with the `.js` extension per the NodeNext rule.
- Tab completion: extend `completeSendTarget`'s predicate (`src/completion-handlers.ts:33`) to also match `enqueue`, so the agent argument completes like `send`'s.
- New `src/commands/queue.ts`: the server-side no-op half of the `queue` command (decision 12) — exact lowercase match on `queue`, empty `run`, registered in `src/commands/index.ts`.

### 5. Web: busy-state consumers (command line)

- Tab strip: no change — the dot blink already reads `TabView.busy`.
- `CommandArea.tsx` → `CommandInput.tsx`: new `busy: boolean` prop from the active tab's `TabView.busy` (`current.busy` in `App.tsx`).
- Prompt: when `busy`, render `queue ❯` in place of the bare `❯` (`CommandInput.tsx:135`). The requirement's literal `queue >` maps onto the app's existing `❯` glyph — keep the glyph, prefix the word.
- Dot: when `busy`, add the `busy` class to the existing dot span (`CommandInput.tsx:134`) and add a `.command .dot.busy` CSS rule reusing the **existing** `dot-blink` keyframes — the keyframes at `theme.css:103` are already global; only the `.tab`-scoped selector at `:102` needs a sibling rule, no extraction required.
- Busy does not disable typing or submission; the server decides queue-vs-run (principle 1) — no client-side branching on busy in the submit path.

### 6. Web: `QueuePicker` overlay, `Cmd+E`, and the `useQueuePicker` hook

- New `web/src/QueuePicker.tsx`, structurally parallel to `HistoryPicker.tsx`: props `{ items: string[]; selected: number; onSelect: (index: number) => void }`; title `queue`; empty state `(no commands queued)`; rows are display-only plain text (the command line is the sole edit surface, decision 7); row click calls `onSelect(index)`; carry a `data-doc-shot="queue-overlay"` attribute mirroring `HistoryPicker.tsx:10` for the docs screenshot tooling.
- New `web/src/useQueuePicker.ts` hook owning `queueOpen`/`queueIndex` state, `openQueue`, selection, and the RPC-sending callbacks — App.tsx is at ~190 effective lines (234 raw) and cannot absorb another picker's state inline; this mirrors exactly why `useThemePicker.ts` exists (its own header comment says so). The hook also clamps `queueIndex` whenever the items array shrinks (drain or deletion racing the open popup).
- `openQueue`: reached from both `Cmd+E` and the client-intercepted `queue` command (decision 12); no-op unless the active tab is an agent tab (decision 9); otherwise always open (matching `openPicker`'s "always open" comment, `App.tsx:91-95`), selector on index 0 — the front of the queue, i.e. the next command to run (unlike `hist`, whose bottom-most highlight is "most recent"; the queue's item of interest is the front). Items render in queue order, front at top. Opening **selects** row 0, which per decision 7 copies its text into the command line; with an empty queue nothing is copied.
- Selection → command line: selecting must overwrite `CommandInput`'s local `value`. There is **no existing mechanism** for this — `hist`'s `pick()` runs the command outright (`App.tsx:96`), it never sets the input text. Add one: `CommandInput` accepts a `setTextRef: React.RefObject<((text: string) => void) | null>` prop and assigns its internal `recall` into it (the `guardRef` pattern, `App.tsx:99`). The queue hook calls `setTextRef.current?.(text)` on every selection change and refocuses the input (`inputRef.current?.focus()`), so keyboard flow continues through the textarea even after a row click.
- `PickerOverlays.tsx`: add `queueOpen` (+ items/index/onSelect props) to the render chain after `hist`.
- `useWindowKeys.ts`: add `Cmd+E` (`e.metaKey && e.key.toLowerCase() === 'e'`) beside the `Ctrl+R`/`Ctrl+G` handlers (`:96-97`), calling `cb.openQueue()`. Extend `StateSnapshot` (`:8-25`) with `queueOpen`/`queueIdx`/`queueItems` and `Callbacks` (`:27-43`) with the queue callbacks. Add a queue branch to `dispatchModalKey` (`:47-65`) after `pickerOpen`, calling a new `handleQueueKey` in `keyboard-handlers.ts` (see change 7). During implementation, manually confirm `Cmd+E` is not swallowed by the target browsers (Safari binds it to "use selection for find") — verification step, not an assumption.
- `App.tsx`: compose the hook, pass `current.commandQueue ?? []` as items, wire `PickerOverlays` and `CommandArea`. Do **not** OR `queueOpen` into the `pickerOpen` prop at `App.tsx:220` — that prop fully mutes `CommandInput`'s key handling (`CommandInput.tsx:75`), and the queue popup needs live typing; pass a separate `queueOpen` prop through `CommandArea` instead. Do fold `queueOpen` into the `useCmdW` guard (`pickerOpenRef`, `App.tsx:102,137`) so `Cmd+W` no-ops while the popup is open, keeping `specs/keyboard-navigation.md` line 15 true.

### 7. Key handling while the queue popup is open

Split between the window handler (navigation) and `CommandInput` (text-adjacent keys), per decision 7:

- New `handleQueueKey` in `web/src/keyboard-handlers.ts`, called from `dispatchModalKey`: **Up/Down** move the selector with the same `Math.max`/`Math.min` clamping as `handlePickerKey` (`:29-30`), each move triggering the select-copies-text behavior; **Enter** `preventDefault`s and does nothing (do not reuse `handlePickerKey`, whose Enter runs the entry); **Escape** closes the popup only. Unlike `handleTabNavKey` (`:63-67`), it must **not** swallow printable keys or Backspace — those fall through to the textarea so typing and editing keep working.
- `CommandInput.tsx`, while the new `queueOpen` prop is true: skip its own `Enter` (no submit — the window handler no-ops it), `ArrowUp`/`ArrowDown` (no history recall — the window handler moves the selector), and when `value` is empty, intercept `Backspace`/`Delete` to call a new `onDeleteQueued` callback instead of editing. All other keys behave normally. Its `onChange`, while `queueOpen` and the queue is non-empty, additionally calls a new `onEditQueued(text)` callback (App wires it to the `editQueuedCommand` RPC with the current `queueIndex`).
- Requirement-by-key summary: Up/Down = move selector + copy selected text to command line; click row = same; typing = patch selected row live; Backspace/Delete with text = edit text (patches row); Backspace/Delete with empty line = remove selected row, clamp selector, stay open, line stays empty; Enter = nothing; Escape = close.

### 8. Specs

- New `specs/agent-command-queue.md`: the queue model and agent-tab-only scope, the single-drain-point design at the behavior level (busy → idle drains FIFO, one at a time), the two stall-prevention rules (dispatch-into-non-empty-queue enqueues behind and drains; relaunch restores the queue idle and drains on first dispatch), the `queue ❯` prompt and command-line dot blink, the `enqueue <agent> <command>` command with its error messages, the popup opened by `Cmd+E` or the `queue` command (word it like `specs/history.md:23`'s "`Ctrl+R` (or the `hist` command)") with the full key table from change 7 (including the empty-line Backspace rule and the index-race caveat from decision 6), and what never queues (client-intercepted commands; `msg`/`broadcast`'s separate FIFO). Cross-reference `specs/tabs.md` "Busy indicator" and `specs/history.md` rather than re-explaining.
- `specs/keyboard-navigation.md`: add a `Cmd+E` row to the chord table (`:15-21`) — this is the file that lists `Ctrl+R`/`Ctrl+G`.
- One-sentence amendments where behavior changes: `specs/scheduling.md` (a due command firing into a busy agent tab now queues instead of running concurrently), `specs/send.md` (same for `send` into a busy agent tab), `specs/monitoring.md` (same for an accepted suggestion). `specs/messaging.md` and `specs/tabs.md` need no change.

### 9. Public documentation

- New page `public-documentation/command-bar/queue.md`, modeled on `command-bar/history.md` (How-to first: queue commands while an agent is busy, use `enqueue` to queue for another agent; then Reference: `Cmd+E` / the `queue` command, the key table, `enqueue` syntax). Sidebar entry in `public-documentation/.vitepress/config.mts` under the command-bar section, after "Command history" (`config.mts:70`).
- Cover: submitting while busy, the `queue ❯` prompt and blinking dot, opening the popup with `Cmd+E` or `queue`, the popup interactions (browse/select/edit/delete, Escape), `enqueue <agent> <command>`, and that the queue survives a relaunch. No implementation leakage (no `TabManager`, no file paths) per `ai/guidelines/user-documentation.md`.
- Visuals per that guideline's "use them with intent": one still screenshot of the open popup (via the `data-doc-shot="queue-overlay"` hook), and a short silent looping clip for the edit-in-place interaction — it is genuinely motion (typing in the command line while the corresponding row updates).

## Test cases (requirement-line traceability)

Requirement lines refer to `plans/todo-features.md`. Server tests colocated as `src/**/*.test.ts`, client as `web/src/**/*.test.tsx`, run via `check-diff`.

| # | Requirement | Test |
| --- | --- | --- |
| 1 | Commands entered go into the queue; idle+empty-queue runs directly (l.10) | `command-manager.test.ts`: dispatch while idle with empty queue → `run` path executes, queue stays empty |
| 2 | While busy, submissions queue (l.14) | `command-manager.test.ts`: `dispatch`/`dispatchTo` while `isBusy` → enqueued, not run; empty input while busy is **not** enqueued |
| 3 | Single command at a time; FIFO (l.11-12) | `command-manager.test.ts`: two commands while busy → both queued in order, neither runs; after `deleteBusy`, the first runs |
| 4 | When free, the queue is checked (l.11) | `tab-manager.test.ts`: `deleteBusy` with non-empty queue invokes the drain hook (microtask-deferred); with empty queue it does not |
| 5 | All completion paths drain | `tab-manager.test.ts`: `finishRunning` now routes through `deleteBusy` (drain fires after browser/connection/monitor-style completion) |
| 6 | Queue never stalls behind a synchronous command | `command-manager.test.ts`: drain runs consecutive `output`-kind commands until a busy-setting one; stops while a route is pending and resumes via `chooseRoute` |
| 7 | Dispatch into an idle tab with a non-empty queue keeps FIFO | `command-manager.test.ts`: new command enqueues behind existing entries and the front entry runs first |
| 8 | Busy makes the agent busy until completion (l.13) | existing `addBusy`/`deleteBusy` coverage — regression only |
| 9 | Tab dot blinks when busy (l.16) | existing tab-strip coverage — `TabView.busy` unchanged |
| 10 | Command-line dot blinks when exposed tab busy (l.17) | `CommandInput.test.tsx`: `busy` prop → dot has the blink class |
| 11 | `queue ❯` prompt when busy (l.18) | `CommandInput.test.tsx`: prompt text `queue ❯` when busy, `❯` when not |
| 12 | `Cmd+E` opens the popup (l.19); `queue` command opens it too (addendum) | `useWindowKeys.test.ts`: Cmd+E calls `openQueue`; `App.test.tsx`: submitting `queue` opens the popup instead of dispatching; hook test: no-op on non-agent tab; `commands/queue.test.ts`: server module matches `queue` and no-ops (mirrors `hist`) |
| 13 | Titled `queue`; empty state (l.20) | `QueuePicker.test.tsx`: `.picker-title` is `queue`; `(no commands queued)` when empty |
| 14 | Escape closes (l.21) | `handleQueueKey` test: Escape closes, nothing else happens |
| 15 | Up/Down move the selector, clamped (l.22) | `handleQueueKey` test: bounds-clamped, no wraparound; printable keys and Backspace are not swallowed |
| 16 | Selecting copies to the command line, overwriting (l.23) | hook/App test: selection (arrow move and row click) sets the command-line text via `setTextRef` |
| 17 | Editing the command line patches the selected row (l.24) | integration: with popup open, `onChange` sends `editQueuedCommand(queueIndex, text)`; `tab-manager.test.ts`: `editQueued` replaces the right index, no-ops out of range |
| 18 | Enter/Return does nothing (l.25) | `CommandInput.test.tsx`: Enter while `queueOpen` does not submit; `handleQueueKey` test: Enter prevented, popup stays open |
| 19 | Delete/Backspace removes the selected row (l.26) | `CommandInput.test.tsx`: Backspace with empty value calls `onDeleteQueued`; with text it edits normally; `tab-manager.test.ts`: `deleteQueued` splices, no-ops out of range; hook test: selector clamps, popup stays open |
| 20 | `enqueue <agent> <command>` (l.27) | `commands/enqueue.test.ts`: parser (usage errors), unknown tab, non-agent tab, happy path appends + confirmation output; idle target runs immediately via drain |
| 21 | Only agent tabs have queues (l.28) | `command-manager.test.ts`: gate skipped for a non-agent tab; `enqueue` refuses non-agent targets |
| 22 | Queue survives `--relaunch` | `tab-manager.test.ts`: `buildAgentState` includes `commandQueue`; `rehydrate` restores it; restored tab is idle and does not auto-run; first dispatch drains front-first |
| 23 | Lifecycle | `tab-manager.test.ts`: `closeTab` clears the label's queue entry |
| 24 | `Cmd+W` guard | `useCmdW` test: no-op while the queue popup is open |

## Out of scope

- A cap on queue length (not specified).
- Reordering queued commands (spec asks only for edit and delete).
- Running a queued command out of order (strictly FIFO).
- Any change to `msg`/`broadcast` delivery or its per-recipient FIFO (`AgentCommunicationManager`) — a different mechanism, untouched (decision 11b).
- Clearing the `busy` Set entry on tab close (pre-existing gap, unrelated to this feature; the queue map *is* cleaned).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end: start `sleep 5` in a tab, submit two more commands while busy — confirm both queue (dot blinks in tab strip and command line, prompt reads `queue ❯`), `Cmd+E` shows both in order with the front selected and copied into the command line (close it, then reopen by submitting `queue` to confirm the command path too), arrow to the second and edit it via the command line (row updates live), backspace the first's text to empty then once more to delete it, Escape closes; when the sleep finishes, the surviving (edited) command runs automatically and the blinking stops. Then from another tab run `enqueue <that-tab> echo hi` while it is busy and confirm it lands at the back of the queue; run it again while idle and confirm it executes immediately. Finally `--relaunch` with a non-empty queue and confirm it restores idle and drains on the next submitted command.

## Implementation order

1. Server storage + drain plumbing: `TabManager` queue map and methods, `setOnIdle` + microtask-deferred notify in `deleteBusy`, `finishRunning` rerouted through `deleteBusy`, `closeTab` cleanup, `AgentState.commandQueue` + `buildAgentState` + `rehydrate`; tests (rows 4, 5, 17, 19 server halves, 22, 23).
2. Server gate + drain loop in `CommandManager` (`dispatch`/`dispatchTo` gate, drain loop with route-pending stop, `chooseRoute` re-drain, public `drainQueue`); tests (rows 1–3, 6, 7, 21).
3. Protocol + routing: `TabView.commandQueue`, the two `RpcCall` members, `message-handler.ts` cases, `Controller` delegates (single-file protocol change — no mirror).
4. `enqueue` command module + `queue` no-op module + registration + `completeSendTarget` extension; tests (rows 12 server half, 20).
5. Web busy consumers: `busy` prop through `CommandArea` into `CommandInput`, `queue ❯` prompt, `.command .dot.busy` CSS rule; tests (rows 10, 11).
6. Web popup: `QueuePicker.tsx`, `useQueuePicker.ts`, `setTextRef` mechanism in `CommandInput`, `handleQueueKey`, `dispatchModalKey`/`PickerOverlays`/`useWindowKeys` wiring, `Cmd+E`, the `queue` interception in `App.tsx`'s `onSubmit`, `useCmdW` guard; tests (rows 12–19, 24). Manually verify the edit-in-place interaction against the requirement text — it is the highest-risk piece — and confirm `Cmd+E` reaches the app in the target browsers.
7. Specs: `specs/agent-command-queue.md`, `specs/keyboard-navigation.md` chord row, one-line amendments to `specs/scheduling.md` / `specs/send.md` / `specs/monitoring.md`.
8. Public documentation: `public-documentation/command-bar/queue.md` + sidebar entry + visuals.

Run `./scripts/run.mjs check-diff` after each step.
