# Plan: Transcript Publish–Subscribe Bus

## Goal

Introduce a single per-`Controller` **transcript pub/sub bus** that makes every tab's transcript mutations observable by any number of independent subscribers. Transcript *producers* (the `append`, shell-display, ACP, `clear`, and tab-close paths) emit typed events; transcript *consumers* (the monitor feature, future loggers/mirrors, analytics) subscribe and react — without the producer knowing any consumer exists.

The bus is implemented as a **modular unit in its own directory** (`src/transcript/`), mirroring the existing `commands/`, `openers/`, and `recognizers/` directory conventions, and stays well under the 200-line file limit by splitting types, the bus class, and the barrel into focused modules.

Two hard requirements drive this plan:

1. **One bus, all tabs.** The `Controller` owns exactly one bus instance. Every event carries a `tabLabel`, so a subscriber sees activity across all tabs and filters to the ones it cares about. This is what "manage transcripts across all tabs" means here — the `Controller` already owns every tab, so a per-`Controller` bus is inherently cross-tab.
2. **Modular, own directory.** No new top-level `src/*.ts` god-file. The feature lives in `src/transcript/` as small, single-responsibility modules.

This is a **server-internal** change. The bus does not touch the wire protocol: the client still receives only `TabView` snapshots via `sinks.emitState()`. No `protocol.ts`, `ws.ts`, or `web/` changes.

---

## Background

### The transcript today

A tab's transcript is just `tab.log: LogEntry[]` (`src/types.ts`). It is mutated in **several** places in `src/controller.ts`, not one:

| Site | What it does | Goes through `append()`? |
| --- | --- | --- |
| `append(label, entry)` (line ~242) | Push a new `LogEntry`, cap via `capLog`, file-log, persist, `emitState` | — (this *is* the method) |
| `runShell` display push (line ~892) | Push a `running` shell entry **directly** to `tab.log` | **No** — bypasses `append()` |
| `runAcp` → `startTurn` (line ~506) | Push the ACP turn's `running` entry | Yes — calls `append()` |
| `runAcp` → `updateRunning` (line ~485) | Mutate the in-flight `running` entry with streamed text | No (in-place edit) |
| `runShell` → `update` (line ~895) | Mutate the in-flight shell entry with streamed output | No (in-place edit) |
| `finishRunning` (line ~220) | Fill a `running` entry's final output | No (in-place edit) |
| `onPtyExit` (line ~990) | Flip an inline-terminal entry to `exited` | No (in-place edit) |
| `runApp` `case 'clear'` (line ~354) | Reset `tab.log = []` | No |
| `closeTab` (line ~1087) | Tear the tab (and its transcript) down | No |

Every one of these is followed by `this.sinks.emitState()` (and sometimes `persist()`), but there is **no hook** a consumer can attach to. The only cross-tab notification today is `emitState()`, which is a full client broadcast, not a typed server-side event a feature can subscribe to.

### The `bus` name is already taken

`Controller` already declares `private bus: MessageBus` (line 78) for inter-agent messaging. The transcript bus must use a **distinct field name** — this plan uses `transcriptBus`. (The original draft of this plan proposed `readonly bus = new TranscriptBus()`, which would have collided.)

### Why a typed bus rather than the existing `MessageBus`

`MessageBus` is a per-recipient FIFO of agent-to-agent *messages* (`info`/`request`/`command`/`response`) with async draining. Transcript events are a different concern: synchronous, fan-out, typed by lifecycle (`appended`/`trimmed`/`cleared`/`removed`), with no per-recipient queue. Overloading `MessageBus` would entangle two unrelated protocols. A separate, tiny module keeps each concern in one file with one responsibility (`CODE_GUIDELINES.md`).

### The coupling problem this replaces

The companion plan `monitoring-ai.md` adds monitor state as `Controller` fields (`monitors`, `suggestions`) and calls `notifyMonitors()` *inline inside `append()`*. That does not scale: every transcript-aware feature would need its own `Controller` field and its own inline call on the mutation path, and every such feature's tests would have to stand up a full `Controller`. The bus replaces that inline hook with one `emit()` and lets each feature subscribe independently. See [Reconciling with `monitoring-ai.md`](#reconciling-with-monitoring-aimd).

---

## Approach

A `TranscriptBus` class — a small typed event emitter scoped to transcript-lifecycle events — instantiated once by the `Controller`. Each transcript-mutation site emits the event for what it did, immediately after mutating `tab.log` and **before** `emitState()`. Subscribers register with a returned `Subscription` handle and tear down via `unsubscribe()`.

Design choices that differ from the original draft:

- **Covers all new-entry paths, not just `append()`.** Because `runShell`'s display push bypasses `append()`, emitting only from `append()` would silently drop shell command entries. Both new-entry sites emit `entry:appended`, so the bus genuinely spans every tab's transcript. (See [Emission sites](#emission-sites-in-controller).)
- **Subscriber errors are isolated.** The bus now sits on the UI-critical append path (it fires just before `emitState()`). A throwing subscriber must **not** break transcript mutation or state broadcast, so `emit()` wraps each listener in `try/catch`. This is a deliberate departure from Node's `EventEmitter` "throw breaks the chain" contract.
- **Minimal surface.** The teardown mechanism is the `Subscription` handle returned by `on`/`once`/`onTab`. There is no separate `off(type, fn)` — one teardown path, less surface.
- **Synchronous fan-out.** Listeners run in the same tick as the mutation. A subscriber needing async work (e.g. an ACP prompt) schedules its own microtask; it must not block the append path.

### Phasing

- **Phase 1 (this plan's core):** the `src/transcript/` module + emission of `entry:appended`, `entries:trimmed`, `tab:cleared`, `tab:removed`. This is everything the monitor feature and a transcript logger need.
- **Phase 2 (optional, deferred):** an `entry:updated` event for in-flight streaming edits (`updateRunning`, `runShell` `update`, `finishRunning`, `onPtyExit`), for consumers that need to observe partial output. Deferred because the monitor only acts on finalized entries, and streaming emits would fire at the same high cadence as `emitState()`. Listed in [Open questions](#open-questions).

---

## Module layout

A new directory `src/transcript/`, following the `commands/` convention (a per-directory `types.ts` plus an `index.ts` barrel):

```
src/transcript/
  types.ts        TranscriptEvent union, TranscriptEventType, Subscription, Listener   (~35 lines)
  bus.ts          TranscriptBus class: on / once / onTab / emit / clear               (~75 lines)
  index.ts        Barrel: re-exports TranscriptBus + the public types                 (~6 lines)
  bus.test.ts     Vitest unit tests for the bus                                        (~120 lines)
```

Rationale for the split (each file one responsibility, all under 200 lines):

- **`types.ts`** holds only types, matching `src/commands/types.ts`. Event types live beside the bus, not in the global `src/types.ts` — the comment at the top of `src/types.ts` reserves it for top-level modules and explicitly notes subdirectories carry their own types file.
- **`bus.ts`** holds the runtime class only.
- **`index.ts`** is the single import surface for the rest of the server: `import { TranscriptBus } from './transcript/index.js'`.

---

## Event model

A discriminated union. Every variant carries `tabLabel` so any subscriber can filter by tab — the cross-tab guarantee.

```ts
// src/transcript/types.ts
import type { LogEntry, Tab } from '../types.js';

export type TranscriptEvent =
  | {
      type: 'entry:appended';
      tabLabel: string;
      entry: LogEntry;
      // Read-only snapshot of the tab *after* the append (and after any cap-driven trim).
      // Listeners must treat it as immutable — it is the live in-memory object.
      tab: Readonly<Tab>;
    }
  | {
      type: 'entries:trimmed';
      tabLabel: string;
      // How many oldest entries `capLog` dropped to honor `transcriptMaxLines`.
      count: number;
    }
  | {
      type: 'tab:cleared';
      tabLabel: string;
    }
  | {
      type: 'tab:removed';
      tabLabel: string;
    };

// The `type` discriminant, for the `on` signature.
export type TranscriptEventType = TranscriptEvent['type'];

export type Listener = (event: TranscriptEvent) => void;

// Handle returned by on/once/onTab; call unsubscribe() to detach.
export type Subscription = { unsubscribe: () => void };
```

### When each event fires

| Event | Fires when | Emission site (Controller) |
| --- | --- | --- |
| `entry:appended` | A new `LogEntry` is pushed to any tab's log | `append()`; `runShell` display push |
| `entries:trimmed` | `capLog` drops oldest entries on append (only when `count > 0`) | `append()`; `runShell` display push |
| `tab:cleared` | The `clear` command empties a tab's log | `runApp` `case 'clear'` |
| `tab:removed` | A tab (and its transcript) is closed | `closeTab()` |

`entries:trimmed` is emitted **before** `entry:appended` for the same append, so a subscriber sees the drop before the add.

---

## TranscriptBus API

```ts
// src/transcript/bus.ts
export class TranscriptBus {
  // Subscribe to one or more event types across all tabs. Returns a handle; call
  // unsubscribe() to detach.
  on(types: TranscriptEventType | TranscriptEventType[], listener: Listener): Subscription;

  // One-shot: auto-detaches after the first matching event.
  once(types: TranscriptEventType | TranscriptEventType[], listener: Listener): Subscription;

  // Convenience: subscribe but only receive events whose tabLabel === the given label.
  // Sugar over on() with a label filter — most consumers care about specific tabs.
  onTab(tabLabel: string, types: TranscriptEventType | TranscriptEventType[], listener: Listener): Subscription;

  // Dispatch synchronously to all matching listeners. Each listener is invoked in its
  // own try/catch so a throwing subscriber cannot break the caller (the append path).
  emit(event: TranscriptEvent): void;

  // Detach every listener. Called from Controller.shutdown().
  clear(): void;
}
```

No `off(type, fn)`: the `Subscription` handle is the single teardown path.

### Internal design

- Listeners are stored in a `Map<TranscriptEventType, Set<Listener>>`. `on()` with an array registers the same function reference under each type key; the returned `Subscription.unsubscribe()` removes it from every type it was registered under.
- `emit()` looks up the `Set` for `event.type`, iterates a **copy** of it (so a listener that unsubscribes — or `once` self-detaching — during dispatch doesn't disturb iteration), and calls each listener inside `try/catch`. A caught error is swallowed (optionally surfaced via the existing error-append channel) so the mutation path is never broken.
- `once()` registers a wrapper that calls `unsubscribe()` then the listener. `onTab()` registers a wrapper that early-returns unless `event.tabLabel === tabLabel`.
- No async queue, no microtask deferral, no event buffer/replay. A subscriber only receives events that fire while it is subscribed.

---

## Controller integration

All changes are in `src/controller.ts` (already `/* eslint-disable max-lines */`, so the few added lines are fine).

### Field

Add the bus as a **public readonly** field (consumers like the monitor subscribe to it), named to avoid the existing `private bus: MessageBus`:

```ts
import { TranscriptBus } from './transcript/index.js';

export class Controller {
  // Per-Controller transcript event bus — one instance spans every tab. Distinct from `bus`
  // (the inter-agent MessageBus).
  readonly transcriptBus = new TranscriptBus();
  // ...existing fields...
}
```

### Emission sites in Controller

**`append()`** — compute the cap-driven drop count from the real `capLog` (which slices), then emit trim → append before `emitState()`:

```ts
private append(label: string, entry: LogEntry): void {
  const tab = this.tabs.find((t) => t.label === label);
  if (!tab) return;
  const before = tab.log.length;
  tab.log = this.capLog([...tab.log, entry]);
  tab.scrollOffset = 0;
  this.log(label, entry.input);
  this.log(label, entry.output);
  this.persist(tab);
  const trimmed = before + 1 - tab.log.length; // entries capLog dropped (0 when under the cap)
  if (trimmed > 0) this.transcriptBus.emit({ type: 'entries:trimmed', tabLabel: label, count: trimmed });
  this.transcriptBus.emit({ type: 'entry:appended', tabLabel: label, entry, tab });
  this.sinks.emitState();
}
```

**`runShell` display push** — the new-entry path that bypasses `append()`. Emit the same events so shell command entries are observable across all tabs:

```ts
if (isDisplay) {
  const before = tab.log.length;
  tab.log = this.capLog([...tab.log, { input: command, output: '', running: true, cwd }]);
  this.log(label, command);
  const trimmed = before + 1 - tab.log.length;
  if (trimmed > 0) this.transcriptBus.emit({ type: 'entries:trimmed', tabLabel: label, count: trimmed });
  this.transcriptBus.emit({ type: 'entry:appended', tabLabel: label, entry: tab.log.at(-1)!, tab });
}
```

> Optional cleanup (recommended): extract the shared "push a new entry, cap, emit" logic into a private `pushEntry(tab, entry)` helper used by both `append()` and the `runShell` display push, so there is exactly one place that emits `entry:appended`/`entries:trimmed`. This keeps the two sites from drifting. Out of strict scope, but it is the cleanest way to guarantee the cross-tab invariant.

**`runApp` `case 'clear'`** — emit `tab:cleared` (this is inline in `runApp`, not a standalone handler):

```ts
case 'clear': {
  const tab = this.tabs.find((t) => t.label === label);
  if (tab) {
    tab.log = [];
    this.persist(tab);
    this.transcriptBus.emit({ type: 'tab:cleared', tabLabel: label });
    this.sinks.emitState();
  }
  return;
}
```

**`closeTab()`** — emit `tab:removed` once, at the top after the tab is resolved, so per-tab subscribers (monitors) can tear down before teardown proceeds:

```ts
closeTab(index: number): void {
  const tab = this.tabs[index];
  if (!tab) return;
  this.transcriptBus.emit({ type: 'tab:removed', tabLabel: tab.label });
  // ...existing teardown (shells, acp, browsers, ptys, schedules, ...)...
}
```

**`shutdown()`** — detach everything:

```ts
shutdown(): void {
  this.transcriptBus.clear();
  // ...existing teardown...
}
```

### Ordering and re-entrancy

- **Order:** mutate `tab.log` → emit transcript event(s) → `emitState()`. A synchronous subscriber that mutates other server state (e.g. the monitor storing a suggestion on another tab) has its change reflected in the very next `emitState()`.
- **Re-entrancy:** a subscriber that synchronously calls back into `Controller.append()` (same or another tab) will re-enter and trigger a nested emit + `emitState()`. That is allowed but should be avoided for the *same* tab to prevent surprising recursion; a subscriber needing to append in response to an event should defer with `queueMicrotask`/`setTimeout(…, 0)` (the pattern `MessageBus.pump` already uses).
- **`rehydrate()`** replaces `this.tabs` wholesale at startup, before any client connects and before any subscriber attaches, so it deliberately emits nothing.

---

## Reconciling with `monitoring-ai.md`

The monitor feature becomes a **subscriber**, not an inline hook. Concretely, edit `monitoring-ai.md` so that:

- **Remove** the `notifyMonitors()` call from `append()` and the "`append()` hook" bullet from its *Files to change* (§5). The transcript producer no longer references monitors.
- **Keep** monitor state (`monitors`, `suggestions`) wherever that plan lands it, but drive `feedMonitor()` from a bus subscription instead of an inline call.
- The monitor subscribes once and filters by its set of target labels; it tears down on `tab:removed` for a target (and on `unmonitor`):

```ts
// In the monitor subsystem (e.g. src/commands/monitor.ts or a MonitorManager):
startMonitor(monitorLabel: string, targetLabels: string[]): void {
  const targets = new Set(targetLabels);
  const sub = this.controller.transcriptBus.on('entry:appended', (event) => {
    if (targets.has(event.tabLabel)) this.feedMonitor(monitorLabel, event.tabLabel, event.entry);
  });
  // Auto-stop a target that closes.
  const cleanup = this.controller.transcriptBus.on('tab:removed', (event) => {
    if (targets.has(event.tabLabel)) this.stopMonitor(monitorLabel, event.tabLabel);
  });
  this.subscriptions.set(monitorLabel, { sub, cleanup, targets });
}

stopMonitor(monitorLabel: string, targetLabel?: string): void {
  const reg = this.subscriptions.get(monitorLabel);
  if (!reg) return;
  if (targetLabel) reg.targets.delete(targetLabel);
  if (!targetLabel || reg.targets.size === 0) {
    reg.sub.unsubscribe();
    reg.cleanup.unsubscribe();
    this.subscriptions.delete(monitorLabel);
  }
}
```

The monitor never appears on the append path, and its tests can subscribe to a bare `TranscriptBus` without standing up a `Controller`.

---

## Files to change

### New — `src/transcript/` (the modular unit)

1. **`src/transcript/types.ts`** — `TranscriptEvent` union, `TranscriptEventType`, `Listener`, `Subscription`. Imports `LogEntry` and `Tab` from `../types.js`.
2. **`src/transcript/bus.ts`** — `TranscriptBus` class (`on`/`once`/`onTab`/`emit`/`clear`) over a `Map<TranscriptEventType, Set<Listener>>`, with per-listener `try/catch` isolation and copy-on-iterate dispatch.
3. **`src/transcript/index.ts`** — barrel: `export { TranscriptBus } from './bus.js';` and `export type { TranscriptEvent, TranscriptEventType, Subscription } from './types.js';`.
4. **`src/transcript/bus.test.ts`** — vitest unit tests (see below).

### Changed

5. **`src/controller.ts`** — import `TranscriptBus`; add `readonly transcriptBus` field; emit at the four sites (`append`, `runShell` display push, `clear`, `closeTab`); `clear()` in `shutdown()`. (Optional: extract `pushEntry` helper.)
6. **`src/controller.test.ts`** — integration tests asserting the Controller emits the right events (see below).
7. **`docs/plans/monitoring-ai.md`** — edit per [Reconciling with `monitoring-ai.md`](#reconciling-with-monitoring-aimd): drop the `append()` hook / `notifyMonitors()`, subscribe via `controller.transcriptBus` instead.

### Explicitly unchanged

- **`src/types.ts`** — no change; event types live in `src/transcript/types.ts`.
- **`src/protocol.ts`, `web/src/ws.ts`, `web/**`** — no change; the bus is server-internal and does not alter the wire protocol or `TabView`.

---

## Testing

Vitest, colocated `*.test.ts`, `.js` imports — matching `src/message-bus.test.ts`.

### `src/transcript/bus.test.ts` (unit)

- `on` + `emit`: a listener receives the exact event object.
- Filtering by type: a listener on `'entry:appended'` is **not** called for a `'tab:cleared'` emit.
- Multi-type `on(['entry:appended', 'tab:cleared'], fn)`: receives both; `unsubscribe()` detaches from both.
- `unsubscribe()`: a detached listener is not called afterward.
- `once`: fires exactly once, then auto-detaches (a second emit does not call it).
- `onTab('agent2', …)`: receives only events with `tabLabel === 'agent2'`; ignores other tabs.
- Multiple listeners for one type all fire.
- **Isolation:** a listener that throws does not prevent later listeners from firing and does not propagate out of `emit()` (assert `emit` does not throw and a second spy still ran).
- Copy-on-iterate: a listener that calls `unsubscribe()` on another listener mid-dispatch does not corrupt iteration.
- `emit` with no registered listeners does not throw.
- `clear()` detaches everything (subsequent emits call nothing).
- Synchronous delivery: after `emit()` returns, a `vi.fn()` spy has already been called (no fake timers needed).

### `src/controller.test.ts` (integration)

Subscribe before acting, using the public `controller.transcriptBus`:

```ts
const events: TranscriptEvent[] = [];
controller.transcriptBus.on(['entry:appended', 'entries:trimmed', 'tab:cleared', 'tab:removed'], (e) => events.push(e));
```

- A command that appends (e.g. an `output`-kind command) emits `entry:appended` with the right `tabLabel` and `entry`, and the carried `tab` reflects the post-append log.
- A **shell** command emits `entry:appended` (proves the `runShell` display path is covered, not just `append()`).
- Appending past `transcriptMaxLines` (set a tiny cap via the config or a seeded log) emits `entries:trimmed` with the correct `count`, ordered before `entry:appended`.
- The `clear` command emits `tab:cleared`.
- `closeTab` emits `tab:removed` for the closed tab's label.
- **No-subscriber safety:** all existing controller tests still pass unchanged — a fresh `Controller` has zero subscribers, listeners are synchronous, and nothing is awaited after `emit()`, so post-`append()` state assertions are unaffected.

### Verify while developing

Per `CLAUDE.md`, use the fast diff-scoped loop after each change:

```bash
./scripts/run.mjs check-diff
```

(Leave `npm run check` for the human at the end.)

---

## Non-goals

- **Phase-2 streaming events** (`entry:updated` for in-flight `running` edits) — deferred; the monitor only needs finalized entries.
- **Async / queued delivery** — `emit()` is synchronous fan-out; async subscribers schedule their own work.
- **Event history / replay** — no buffer; subscribers only get events fired while subscribed.
- **Cross-process / cross-`Controller` routing** — the bus is per-`Controller` (which is already the all-tabs scope). Multi-process buses are out of scope.
- **Wire-protocol changes** — the bus is server-internal; the client contract (`TabView` via `emitState`) is untouched.
- **Replacing `emitState()`** — the bus complements the client broadcast; it does not replace it.

---

## Open questions

1. **Phase 2 `entry:updated` shape:** when added, should it carry the entry's index, a reference to the (mutated) entry, or just `tabLabel` + a "kind" (`chunk` | `finalized` | `terminal-exit`)? It fires at `emitState()` cadence during streaming, so the payload should be cheap to construct. Leaning: `{ type: 'entry:updated'; tabLabel; index; running: boolean }`.
2. **Error surfacing:** a caught subscriber error is currently swallowed. Should the bus optionally route it to a callback (e.g. append `Monitor error: …` to the offending subscriber's tab) so failures aren't silent? Leaning yes, via an optional `onListenerError` constructor hook so the bus stays dependency-free.
3. **`pushEntry` extraction:** adopt the shared `append`/`runShell` helper now (single emission site, guaranteed invariant) or keep the two emit sites explicit? Extraction is cleaner but lightly refactors the shell path. Leaning: extract.
4. **`onTab` for multiple labels:** the monitor watches a *set* of targets. Keep `onTab(label, …)` single-label (monitor filters its own set, as shown) or add `onTabs(labels[], …)`? Single-label keeps the API smaller; the monitor's own `Set.has` filter is trivial. Leaning: single-label.
