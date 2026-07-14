# Add a metadata line to the monitor tab

**Complexity: 6/10** — new fields threaded through `Tab`/`TabView.monitor` end to end
(server state → protocol → client render), plus a new byte-accounting concept
(`contextBytes`) with no existing precedent, but the metadata-line UI itself mirrors an
established pattern.

## Goal

The monitor reporting tab currently has no header at all — just the suggestion feed. It
should show a metadata line, like the file navigator's and notifications tab's headers,
displaying: the agent persona, the tab(s)/group(s) it monitors, and the ACP context size
sent to its dedicated session so far, formatted in b/kb/mb.

## Background (verified)

- `web/src/MonitorTab.tsx` renders only the suggestion feed — no header — and its own
  test (`MonitorTab.test.tsx`) asserts the tab body contains *no* persona/about text at
  all (`'renders the suggestion text without per-row meta'`), confirming there's
  currently zero metadata display anywhere on this tab.
- `src/types.ts:164` (`Tab.monitor`) and `src/protocol.ts:62` (`TabView.monitor`) are
  both just `{ suggestions: MonitorSuggestion[] / SuggestionView[] }` — no persona,
  targets, or size field exists on either side.
- `src/tab-manager.ts:373` (`view()`) does a **direct passthrough**: `monitor: t.monitor`
  — whatever shape `Tab.monitor` has flows straight to the client with no
  transformation, so extending both types identically is sufficient; no new
  serialization code is needed.
- `src/monitor-window.ts:13-19` (`makeMonitorTab`) creates the reporting tab with
  `monitor: { suggestions: [] }`. The reporting tab's **label is always the persona
  name** (confirmed: `start()` in `monitor-manager.ts` passes `personaName` straight to
  `openMonitorTab`, with no suffixing), so `persona` can be set once at creation and
  never changes.
- `src/monitor-info.ts:9` (`listMonitors`) already has the exact target-formatting logic
  needed for "tabs/groups monitored": `reg.targets.map((t) => (t.kind === 'tab' ? t.label : \`group:${t.group}\`)).join(', ')`.
  Extracting this into a shared `formatTargets` helper (in `src/monitor-targets.ts`,
  which already holds the other target-formatting helpers like `targetColor`) avoids
  duplicating it.
- **No "ACP context size" concept exists anywhere.** The closest analogue is the byte
  length of every prompt string sent to a monitor's dedicated session (persona-priming,
  each 30-second flush's batch, and `ask()` questions) plus the replies received —
  approximating how much conversational context has accumulated on that session. This
  fix tracks a new `contextBytes: number` field on `MonitorSub`
  (`src/monitor-manager.ts:20-34`), incremented at every prompt/reply, and reset to 0 on
  `respawn()` (a fresh session starts a fresh context).
- `src/monitor-session.ts` (`openMonitorSession`/`respawnMonitorSession`) is where the
  priming prompt is sent — but its own test file's fake `managers` fixtures
  (`src/monitor-session.test.ts`) have no `tabs` array at all, so **this file must only
  update `reg.contextBytes` itself, never look up or write to the tab** (that would
  throw against the existing fixtures). All tab-metadata pushes happen from
  `monitor-manager.ts`, whose own tests (`src/monitor-manager.test.ts`) already have a
  full `managers.tab.tabs` fixture.
- **Known limitation, accepted as out of scope**: two different owners can share one
  reporting tab (same persona name, confirmed by the existing test `'keeps a reporting
  tab fed by another owner when one owner closes'`). Each owner's `MonitorSub` has its
  own `targets`/`contextBytes`; whichever one updates the shared tab last "wins" the
  displayed values. This mirrors the existing `list()`/`monitorConnections()` behavior,
  which already reports per-registration state without deduplication.

## Approach

Extend `Tab.monitor`/`TabView.monitor` with `persona: string`, `targets: string`
(pre-formatted), and `contextBytes: number`. Populate `persona`/an empty `targets`/`0` at
tab creation, then have `MonitorManager` push updated `targets`/`contextBytes` onto the
tab via a new `updateMonitorMeta` helper whenever they change (start, flush, ask, a
target dropping out, respawn). Render the metadata line in `MonitorTab.tsx`, styled like
`.files-header`/`.files-meta`.

## Implementation

1. **`src/types.ts:164`** and **`src/protocol.ts:62`** — extend both identically:
   ```ts
   monitor?: { suggestions: MonitorSuggestion[] /* or SuggestionView[] */; persona: string; targets: string; contextBytes: number };
   ```

2. **`src/monitor-targets.ts`** — add:
   ```ts
   export function formatTargets(targets: MonitorTarget[]): string {
     return targets.map((t) => (t.kind === 'tab' ? t.label : `group:${t.group}`)).join(', ');
   }
   ```

3. **`src/monitor-info.ts`** — refactor `listMonitors` to call `formatTargets(reg.targets)`
   instead of repeating the inline expression.

4. **`src/monitor-window.ts`**
   - `makeMonitorTab`: initialize `monitor: { suggestions: [], persona: name, targets: '', contextBytes: 0 }`.
   - Add:
     ```ts
     export function updateMonitorMeta(managers: Managers, name: string, targets: string, contextBytes: number): void {
       const tab = monitorTabs(managers).find((t) => t.label === name);
       if (!tab?.monitor) return;
       // Mutate in place, not a spread-replaced object — code elsewhere (and a test) can hold a
       // reference to the monitor payload captured before this runs; replacing the object would
       // make that reference stale.
       tab.monitor.targets = targets;
       tab.monitor.contextBytes = contextBytes;
       messageBus.emit('state', { type: 'dirty' });
     }
     ```

5. **`src/monitor-session.ts`** — track priming bytes on `reg` only (no tab access):
   ```ts
   const primingText = `${reg.persona.body}\n\n${SUGGESTION_FORMAT}`;
   reg.contextBytes += Buffer.byteLength(primingText, 'utf8');
   reg.session.prompt(primingText, { ... }); // unchanged otherwise
   ```
   In `respawnMonitorSession`, reset before re-opening: `reg.contextBytes = 0;` before
   calling `openMonitorSession(reg, managers, spawn)`.

6. **`src/monitor-manager.ts`**
   - Add `contextBytes: number;` to the `MonitorSub` type; initialize `contextBytes: 0`
     in the `reg` literal in `start()`.
   - In `start()`, after `if (!inline) openMonitorTab(...)`, add:
     `if (!inline) updateMonitorMeta(this.managers, personaName, formatTargets(resolved), reg.contextBytes);`
   - In `flush()`: before calling `reg.session.prompt(...)`, add
     `reg.contextBytes += Buffer.byteLength(body, 'utf8');`; in `onEnd`, after computing
     `reply`, add `reg.contextBytes += Buffer.byteLength(reply, 'utf8'); if (!reg.inline) updateMonitorMeta(this.managers, reg.persona.name, formatTargets(reg.targets), reg.contextBytes);`.
   - In `ask()`: same pattern — add the question's bytes before prompting, the reply's
     bytes in `onEnd`, then `updateMonitorMeta` if `!reg.inline`.
   - In `stop()`'s target-drop-out branch (`if (target && !reg.inline) { ...; if (reg.targets.length > 0) return true; }`),
     add `updateMonitorMeta(this.managers, personaName, formatTargets(reg.targets), reg.contextBytes);`
     before that early `return true`, so the metadata line reflects the shrunk target list.
   - In the private `respawn(reg)` wrapper, after calling `respawnMonitorSession(...)`,
     add `if (!reg.inline) this.updateMonitorMeta(reg.persona.name, formatTargets(reg.targets), reg.contextBytes);`
     (reusing the same private helper, or calling the imported function directly).

7. **`web/src/MonitorTab.tsx`**
   - Accept new props: `persona: string; targets: string; contextBytes: number`.
   - Add a `formatBytes(n: number): string` helper (`< 1000` → `${n}b`; `< 1_000_000` →
     `${(n / 1000).toFixed(1)}kb`; else `${(n / 1_000_000).toFixed(1)}mb`).
   - Render a metadata line above the feed:
     ```tsx
     <div className="monitor-header">
       <div className="monitor-meta">
         <span className="monitor-persona">{persona}</span>
         <span className="monitor-targets">{targets}</span>
         <span className="monitor-context">{formatBytes(contextBytes)}</span>
       </div>
     </div>
     ```

8. **`web/src/ReportingSection.tsx`** — pass the new fields from `current.tab.monitor`
   into `<MonitorTab>`: `persona={current.tab.monitor.persona} targets={current.tab.monitor.targets} contextBytes={current.tab.monitor.contextBytes}`.

9. **`web/src/theme.css`** — add `.monitor-header`/`.monitor-meta` rules mirroring
   `.files-header`/`.files-meta` (bordered, padded, muted small text, flex-wrapped).

## Tests

- `src/monitor-targets.test.ts` — add a `formatTargets` test (mixed tab/group targets).
- `src/monitor-window.test.ts` — update the one exact-equality assertion
  (`expect(tab.monitor).toEqual({ suggestions: [] })`) to include the new default
  fields; add a test for `updateMonitorMeta` (updates targets/contextBytes on an
  existing tab; no-ops when the tab doesn't exist).
- `src/monitor-manager.test.ts` — add tests: starting an external-mode monitor sets its
  reporting tab's `persona`/`targets`/initial `contextBytes` (> 0, from priming);
  a flush increases `contextBytes` further; dropping one of two tab targets updates
  `targets` to the remaining one without closing the tab.
- `web/src/MonitorTab.test.tsx` — add tests: renders persona/targets/formatted
  context-bytes in the header; `formatBytes` boundaries (b/kb/mb) via the rendered
  output at representative byte counts.

## Verification

Manual: run the web app, start an external-mode monitor (`monitor <persona> <target>`),
open its reporting tab, and confirm the header shows the persona name, the target
label(s), and a growing byte count as monitor updates flush. Not runnable in this
environment — note as unverified manually.

## Deviations from the original plan (discovered during implementation)

- `updateMonitorMeta` mutates `tab.monitor` in place (`tab.monitor.targets = targets;
  tab.monitor.contextBytes = contextBytes;`) rather than spread-replacing it — a spread
  replacement made a captured reference to the old monitor object stale, breaking an
  existing `monitor-manager.test.ts` test that holds `const feed = ...monitor!` across a
  flush. Mutating in place keeps that reference valid.
- `src/monitor-manager.ts` was already at 200 significant lines before this change and
  went over budget (214) once the byte-tracking/updateMonitorMeta wiring landed.
  Extracted `ask()`'s body into a new `src/monitor-ask.ts` (`askMonitor`), which was
  already the single largest, most self-contained method — not part of the original
  plan's implementation list, but the same "extract into a new module" response the
  plan called for.

## Out of scope

- The "reset context" button (separate `work/issues.md` entry) — the metadata line's
  structure (a `.monitor-meta` div alongside an eventual `.monitor-actions` div,
  mirroring `.files-header`'s two-part layout) leaves room for it, but no button is
  added by this fix.
- Deduplicating metadata when two owners share one reporting tab (see "Known
  limitation" above) — pre-existing, accepted behavior.
- Any other issues in `work/issues.md`.
