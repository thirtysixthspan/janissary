# Add a reset-context button to the monitor metadata line

**Complexity: 4/10** — the hard part (re-priming a session from scratch) already
exists and is reused as-is; this wires a new RPC end to end and adds one button.

## Goal

The monitor tab's metadata line (added in a prior fix) should have a right-floated
button that resets the monitor's agent context — discarding accumulated conversation
and reloading only the persona context, the same recovery already used internally when
a prompt errors.

## Background (verified)

- `src/monitor-session.ts` (`respawnMonitorSession`) already does exactly "reload only
  the persona context": kills the session, resets `contextBytes` to 0, and re-opens with
  a fresh priming prompt (persona body + suggestion format) — no batched history, no
  prior replies.
- `src/monitor-manager.ts`'s private `respawn(reg: MonitorSub)` wraps that and already
  calls `updateMonitorMeta` afterward so the tab's metadata line reflects the reset
  immediately — currently only reachable from a prompt's `onError` handler (in `flush()`
  and `monitor-ask.ts`'s `askMonitor`). This fix exposes the same path as a public,
  user-triggered action.
- The RPC pattern to follow end to end (`src/protocol.ts`'s `RpcCall` union →
  `src/message-handler.ts`'s dispatch → `src/controller.ts`'s thin wrapper →
  `managers.monitor`'s public method) is already established by `runSuggestion`
  (`{ method: 'runSuggestion'; params: { id: string } }`) and `rateSuggestion`.
- The button only has the reporting tab's own label to identify which monitor(s) to
  reset (not an owner+persona pair) — `web/src/ReportingSection.tsx`/`MonitorTab.tsx`
  only ever see the client-side `TabView`, never a `MonitorSub`. Since two different
  owners can share one reporting tab (same persona name — see
  `monitor-manager.test.ts`'s `'keeps a reporting tab fed by another owner...'` test),
  resetting must reset **every** `MonitorSub` currently feeding that persona name, not
  just one — mirroring how `closeIfUnfed`/`handleOwnerClosed` already reason over "every
  sub with this persona name" rather than a single owner.
- `web/src/theme.css`'s `.monitor-header`/`.monitor-meta` (added in the prior fix) is
  currently a single flex row with only the meta div — no actions section yet. The file
  tab's `.files-header`/`.files-actions` two-part layout (`justify-content:
  space-between`, meta flex:1, actions flex-shrink:0) is the established pattern to
  mirror for the right-floated button.

## Approach

Add a public `resetContext(name: string)` method to `MonitorManager` that respawns every
`MonitorSub` feeding that persona name. Wire it through a new `resetMonitorContext` RPC
(protocol → message-handler → controller), and add a right-floated button to
`MonitorTab.tsx`'s metadata line that sends it.

## Implementation

1. **`src/monitor-manager.ts`** — add a public method (near `rate`/`stop`):
   ```ts
   // Reset every monitor currently feeding `name`'s reporting tab to just its persona
   // context — re-primes each with a fresh session, discarding accumulated conversation.
   resetContext(name: string): void {
     for (const reg of this.monitors.values()) {
       if (!reg.inline && reg.persona.name === name) this.respawn(reg);
     }
   }
   ```

2. **`src/protocol.ts`** — add to `RpcCall`:
   ```ts
   // Reset a monitor's reporting tab to just its persona context (discards accumulated
   // conversation on its dedicated ACP session).
   | { method: 'resetMonitorContext'; params: { name: string } }
   ```

3. **`src/message-handler.ts`** — add a case:
   `case 'resetMonitorContext': { controller.resetMonitorContext(message.params.name); break; }`

4. **`src/controller.ts`** — add, alongside `runSuggestion`/`rateSuggestion`:
   ```ts
   resetMonitorContext(name: string): void {
     this.managers.monitor.resetContext(name);
   }
   ```

5. **`web/src/MonitorTab.tsx`**
   - Add an `onReset: () => void` prop.
   - Restructure the header into a two-part layout mirroring `.files-header`: wrap the
     existing meta spans in `.monitor-meta` (unchanged) and add a sibling
     `.monitor-actions` div containing the reset button:
     ```tsx
     <div className="monitor-header">
       <div className="monitor-meta">...(unchanged)...</div>
       <div className="monitor-actions">
         <button type="button" className="monitor-reset" title="Reset context" onClick={onReset}>↺</button>
       </div>
     </div>
     ```

6. **`web/src/ReportingSection.tsx`** — accept `onReset: (name: string) => void`; pass
   `onReset={() => onReset(current.tab.label)}` to `<MonitorTab>`.

7. **`web/src/App.tsx`** — pass
   `onReset={(name) => client.send({ method: 'resetMonitorContext', params: { name } })}`
   to `<ReportingSection>`.

8. **`web/src/theme.css`** — give `.monitor-header` `justify-content: space-between`
   (matching `.files-header`), and add:
   ```css
   .monitor-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
   .monitor-reset {
     background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
     padding: 0 4px; line-height: 1;
   }
   .monitor-reset:hover { color: var(--fg); }
   ```

## Tests

- `src/monitor-manager.test.ts` — add tests: `resetContext` respawns the session (new
  `AcpSession` from `spawn`, old one killed) and re-primes it (first prompt on the new
  session contains the persona body); resetting a name with no matching monitor is a
  no-op; when two owners share one reporting tab, `resetContext` respawns both.
- `web/src/MonitorTab.test.tsx` — add tests: the reset button renders in the header;
  clicking it calls `onReset`.
- `web/src/ReportingSection.test.tsx` — this file exists; every existing `render(...)`
  call passes `onClose`/`onRun`/`onRate` but not the new required `onReset`, so all of
  them need `onReset: vi.fn()` added. Add one new test asserting `onReset` is called
  with the current tab's label when the reset button is clicked.

## Verification

Manual: run the web app, start an external-mode monitor, let it accumulate some context
size, click the reset button in its metadata line, and confirm the byte count drops back
to just the priming size and the monitor keeps working afterward. Not runnable in this
environment — note as unverified manually.

## Out of scope

- Any confirmation dialog before resetting — a single click resets immediately, matching
  how other one-click tab-header actions (dock-cycle, collapse-all, close) already work.
- Any other issues in `work/issues.md`.
