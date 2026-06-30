# Plan: Agent Tab Monitoring with Suggestion Panel

## Goal

Allow an agent to monitor one or more other tabs and surface AI-generated suggestions in a dedicated bottom-aligned panel below the command bar, enabling a collaborative workflow where one agent observes and advises on the activity of another.

---

## Background

### Current tab architecture

Each tab is either an `'agent'` tab (transcript + command line), a view tab (`'image'`, `'page'`, `'harness'`, `'markdown'`), or a shell/harness tab with a full-tab PTY. Agent tabs can run shell commands, connect to an **ACP** subprocess (Claude Code, opencode, etc.), and communicate among themselves via the **MessageBus**. All tab state is owned server-side; the client is a thin projection via `Controller.view()` → `TabView`.

### Current inter-agent surfaces

- **MessageBus** (`src/message-bus.ts`): `msg`/`broadcast` commands send info, requests, or commands between agents.
- **ACP tool loop** (`src/acp-loop.ts`): an agent with a live ACP session can autonomously run commands extracted from the AI's replies (capped at `maxSteps`).
- **StatusPanels** (`web/src/StatusPanels.tsx`): floating top-right overlay showing connections and schedules per tab.
- **Command bar** (`web/src/CommandInput.tsx`): bottom of the tab body, handles command submission, history, and tab-completion.

### Gap

There is no mechanism for one agent to *continuously watch* another tab's activity and proactively suggest actions. The MessageBus is pull/request-driven; the ACP loop is self-contained within one tab. A monitoring agent needs structured, ongoing context from other tabs and a dedicated UI surface for its suggestions.

---

## Approach

Introduce a **monitor subscription** system on the server and a **MonitorPanel** component on the client. An agent tab with a live ACP session can subscribe to one or more target tabs. When a target tab produces new transcript entries, the controller feeds them into the monitoring agent's ACP session. The AI's structured suggestions are extracted, stored on the target tab, and projected to the client as a new `suggestions` field on `TabView`. The client renders the MonitorPanel below the command bar whenever the active tab has pending suggestions.

### Data flow

```
Monitored tab appends LogEntry
  → Controller detects monitors for this tab
  → For each monitor: feed entry text into monitor's ACP session
    → AI responds with structured suggestion (marker format)
  → Controller parses suggestion, stores on monitored tab
    → Controller.view() projects suggestions into TabView
      → Client renders MonitorPanel for active tab
```

### Suggestion format (ACP output convention)

The AI agent outputs suggestions wrapped in a machine-parseable marker:

```
<monitor-suggestion>
  <summary>You might want to check the build output</summary>
  <command>npm run build</command>
</monitor-suggestion>
```

Or as a single-line marker for simpler parsing:

```
[SUGGESTION]: You might want to check the build output
[COMMAND]: npm run build
```

Fields:
- `summary` / `text` — Human-readable suggestion text (required)
- `command` — An optional command the user can run with one click
- `id` — Auto-generated on the server

---

### Commands

```
monitor <tab-label> [tab-label...]
```
Start monitoring one or more tabs by label. The current tab must have a live ACP session. The controller subscribes to the named tabs and begins feeding their transcript entries into this tab's ACP session.

```
monitors
```
List active monitors: for each monitored tab, show the monitoring agent's label and the count of pending suggestions.

```
unmonitor <tab-label>
```
Stop monitoring the named tab. Clears the subscription and removes pending suggestions for that tab from the monitored tab's state.

```
unmonitor --all
```
Stop all monitoring from the current tab.

### Success output

**`monitor agent2`**
```
→ Now monitoring agent2
```

**`monitors`**
```
agent2 ← janus (2 pending suggestions)
agent3 ← janus (0 pending)
```

**`unmonitor agent2`**
```
→ Stopped monitoring agent2
```

### Error cases

- No ACP session on the current tab: `No ACP agent connected on this tab. Start one with 'acp connect <name>'.`
- Target tab not found: `No tab named "<label>".`
- Target tab is the monitor itself: `Cannot monitor self.`
- Duplicate monitor subscription: `Already monitoring "<label>".`

---

### Server-side changes

#### 1. `src/types.ts` — New types

Add `Suggestion` type and add a `suggestions` field to `Tab`:

```ts
export type MonitorSuggestion = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
};

// On Tab, add:
monitors?: Map<string, Set<string>>;  // monitorLabel → Set<targetLabel>
// Or better: centralized in Controller
```

Actually, store suggestions and monitor state in the Controller to keep `Tab` lean. Add to `Controller`:

```ts
// monitorLabel → Set<targetLabel>
private monitors = new Map<string, Set<string>>();
// targetLabel → Map<monitorLabel, MonitorSuggestion[]>
private suggestions = new Map<string, Map<string, MonitorSuggestion[]>>();
```

#### 2. `src/protocol.ts` — Wire types

```ts
export type SuggestionView = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  // Which agent produced this suggestion.
  from: string;
  fromColor: string;
};

// Add to TabView:
suggestions: SuggestionView[];
```

#### 3. `src/controller.ts` — Monitor lifecycle

**`view()` method**: Project suggestions for each tab:

```ts
suggestions: this.getSuggestionsFor(t.label),
```

**New private methods**:
- `getSuggestionsFor(label)`: returns aggregated `SuggestionView[]` from all monitors watching this tab
- `startMonitor(monitorLabel, targetLabels)`: sets up subscriptions
- `stopMonitor(monitorLabel, targetLabel?)`: removes subscriptions
- `stopAllMonitors(monitorLabel)`: clears all

**Monitor as a `transcriptBus` subscriber**: Rather than hooking `append()` directly, the monitor subsystem subscribes to `controller.transcriptBus` for `entry:appended` events. This keeps the producer (`append()`) free of any monitor-specific logic. The subscription is set up in `startMonitor()` and torn down in `stopMonitor()`:

```ts
startMonitor(monitorLabel: string, targetLabels: string[]): void {
  const targets = new Set(targetLabels);
  const sub = this.controller.transcriptBus.on('entry:appended', (event) => {
    if (targets.has(event.tabLabel)) this.feedMonitor(monitorLabel, event.tabLabel, event.entry);
  });
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

No `notifyMonitors()` method and no `append()` hook are needed — the bus carries the event to any number of subscribers without `append()` knowing monitors exist.

**`feedMonitor()`**: Send the new entry's text into the monitoring agent's ACP session as a prompt, parse the response for `[SUGGESTION]` markers, and store parsed suggestions:

```ts
private feedMonitor(monitorLabel: string, targetLabel: string, entry: LogEntry): void {
  const acp = this.acp.get(monitorLabel);
  if (!acp) return;
  const prompt = `[Monitor update from "${targetLabel}"]\n${entry.input}\n${entry.output}\n\nIf you have a suggestion, respond with:\n[SUGGESTION]: <text>\n[COMMAND]: <optional command>`;
  acp.prompt(prompt, {
    onChunk: (text) => { /* accumulate */ },
    onEnd: (final) => {
      const suggestion = parseSuggestion(final);
      if (suggestion) this.addSuggestion(monitorLabel, targetLabel, suggestion);
    },
    onError: () => {},
  });
}
```

**`runApp` switch**: Add `case 'monitor':` and `case 'unmonitor':` branches (delegating to `parseMonitorCommand`, `parseUnmonitorCommand`).

#### 4. `src/commands/monitor.ts` — New command parser

```ts
export function parseMonitorCommand(input: string): { labels: string[] } | { error: string }
export function parseUnmonitorCommand(input: string): { labels: string[]; all?: boolean } | { error: string }
export function parseSuggestion(text: string): MonitorSuggestion | null
```

#### 5. `src/commands/index.ts` — Register commands

Import and register `monitor` and `unmonitor`.

#### 6. `src/completion.ts` — Tab completion

When the input starts with `monitor ` or `unmonitor ` and the cursor is on the first argument, complete against all tab labels except the current tab.

---

### Client-side changes

#### 7. `web/src/MonitorPanel.tsx` — New component

Renders as a fixed-height panel below the command bar:

```
┌──────────────────────────────────┐
│ 💡 janus suggests:               │
│ "You might want to check the     │
│  build output"              [Run] │
│──────────────────────────────────│
│ 💡 janus suggests:               │
│ "Try running linter"       [Run] │
└──────────────────────────────────┘
```

Props:
- `suggestions: SuggestionView[]`
- `onDismiss: (id: string) => void`
- `onRun: (command: string) => void`

Behavior:
- Animate in new suggestions (slide-up)
- Each suggestion shows: origin agent dot + name, suggestion text, optional "Run" button
- Clicking "Run" dispatches `onRun` with the suggestion's command (or if no command, opens a confirmation / copies text)
- "Dismiss" (×) removes the suggestion; sends RPC to server to dismiss
- Keyboard shortcut: `Ctrl+Shift+S` focuses the first suggestion
- Max 3 visible suggestions; older ones auto-collapse into a "N more" toggle
- Panel auto-hides when no suggestions exist (zero-height, `display: none`)

#### 8. `web/src/App.tsx` — Integration

- Import `MonitorPanel`
- Render it after `CommandInput`, gated on `activeTabView.suggestions.length > 0`
- Wire `onRun` to `client.send({ method: 'command', params: { text: command } })`
- Wire `onDismiss` to a new RPC method `dismissSuggestion`

**Layout adjustment**: The tab body's bottom area needs to accommodate the monitor panel. Currently the structure is:

```
div.tab-body
  div.main (transcript + overlays)
  div.command-area
    input.command
```

Add the monitor panel after the command-area:

```
div.tab-body
  div.main (transcript + overlays)
  div.command-area
    input.command
  div.monitor-panel    ← NEW
```

The `monitor-panel` sits outside `.main` so it doesn't scroll with the transcript. Its height is accounted for in the flex layout.

#### 9. `web/src/ws.ts` — New RPC method

Add `dismissSuggestion` RPC:

```ts
| { method: 'dismissSuggestion'; params: { id: string } }
```

Server-side handler removes the suggestion and emits updated state.

#### 10. `web/src/theme.css` — Styling

```css
.monitor-panel {
  background: var(--bg-secondary, #1e1f22);
  border-top: 1px solid var(--border, #2c2d30);
  padding: 8px 12px;
  max-height: 200px;
  overflow-y: auto;
  flex-shrink: 0;
}

.monitor-suggestion {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.monitor-suggestion .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}

.monitor-suggestion .text {
  flex: 1;
  color: var(--fg, #e4e5e7);
}

.monitor-suggestion .run-btn {
  /* Small button styled like a command link */
  background: none;
  border: 1px solid var(--accent, #4a9eff);
  color: var(--accent, #4a9eff);
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

.monitor-suggestion .dismiss-btn {
  background: none;
  border: none;
  color: var(--fg-muted, #888);
  cursor: pointer;
  padding: 0 4px;
  font-size: 14px;
  flex-shrink: 0;
}
```

---

## Files to change

### 1. `src/types.ts` — Add `MonitorSuggestion` type
### 2. `src/protocol.ts` — Add `SuggestionView` type, extend `TabView`, add `dismissSuggestion` to `RpcCall`
### 3. `src/commands/monitor.ts` — New file: parsers for `monitor`/`unmonitor`, suggestion extraction
### 4. `src/commands/index.ts` — Register `monitor`, `unmonitor`
### 5. `src/controller.ts` — Monitor subscription state, `feedMonitor()`, new command branches, `dismissSuggestion` handler, `view()` suggestions projection; subscribe to `controller.transcriptBus` in `startMonitor()` rather than adding an `append()` hook — the bus decouples producers from consumers
### 6. `src/completion.ts` — Tab completion for `monitor`/`unmonitor` labels
### 7. `web/src/MonitorPanel.tsx` — New component
### 8. `web/src/App.tsx` — Render `MonitorPanel`, wire events
### 9. `web/src/ws.ts` — Add `dismissSuggestion` to `RpcCall`
### 10. `web/src/theme.css` — `.monitor-panel`, `.monitor-suggestion`, sub-element styles
### 11. `src/commands/monitor.test.ts` — New file: unit tests for command parsers
### 12. `src/controller.test.ts` — Integration tests for monitor lifecycle

---

## Non-goals

- A full "agent dashboard" with live metrics — the monitor panel is text-suggestion only.
- Bi-directional monitoring loops (A monitors B, B monitors A) — explicitly detected and rejected.
- Monitoring non-agent tabs (image/page/harness/markdown) — the suggestion flow is text-driven; only agent tabs produce the transcript entries the ACP agent can reason about.
- Persisting monitor subscriptions across restarts — monitors are ephemeral session state (like scrollOffset).
- Suggestions from non-ACP agents — requires an AI subprocess capable of parsing transcript context.

---

## Open questions

1. **ACP session contention**: If the monitoring agent is also running its own ACP tool loop (db/browser commands), feeding it monitor prompts could interfere. Should monitor prompts queue until the tool loop goes idle, or should we use a separate ACP session for monitoring?
2. **Suggestion frequency**: Feed every transcript entry vs. batch entries at a fixed interval (e.g., every 5s or after input settles). Batching reduces token cost and avoids rapid-fire suggestions for multi-line output.
3. **Suggestion deduplication**: The ACP agent may suggest the same thing repeatedly. Should the server suppress duplicate suggestion text within a time window (e.g., 60s)?
4. **Async ACP prompt**: `AcpSession.prompt()` is async but the current call sites treat it as fire-and-forget. The monitor feed needs to be truly async-safe — what happens if a new entry arrives while a previous monitor prompt is still streaming?
5. **Client-side suggestion state**: Should dismissed suggestions persist across tab switches, or clear on switch? Current design: dismissed = cleared server-side (removed from `Tab.suggestions`), so they don't reappear.
