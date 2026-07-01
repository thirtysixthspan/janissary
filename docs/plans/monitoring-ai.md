# Plan: AI Monitoring with Personas

## Goal

Allow AI monitors — persona-driven, tool-less ACP sessions — to watch tab activity and surface suggestions, in two forms: an agent tab monitoring **itself** with suggestions reported inline in its own transcript, and a dedicated **monitor window** watching other tabs or tab groups with suggestions collected in its own view.

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

There is no mechanism for an AI to *continuously watch* tab activity and proactively suggest actions. The MessageBus is pull/request-driven; the ACP loop is self-contained within one tab. A monitoring AI needs structured, ongoing context from the watched tabs and a surface for its suggestions.

---

## Approach

### Two use cases

The `monitor` command always runs in an **agent tab** and has two modes:

**1) Inline mode — self-monitoring.**
`monitor <persona>` spawns a new ACP connection dedicated to monitoring **the current tab**. Its suggestions are reported **inline to the agent tab**: each one is appended to that tab's transcript as a suggestion entry, visible in the flow of work it comments on.

**2) External mode — monitor reporting tabs.**
`monitor <persona> <target...>` with explicit targets (tab labels or `group:<n>` tab groups) spawns a new ACP connection dedicated to monitoring the specified tabs/groups and pushes its suggestions to **that monitor's own reporting tab** — a view-only tab (`view: 'monitor'`) **named after the monitor's persona** (e.g. `security`, `quality`) and **colored after the tab it monitors** (strip dot/border and body left-border all carry the monitored tab's color). It has no command bar and accepts no commands; its only interaction is **clicking a suggested command to run it** (in the tab the suggestion is about). Because the tab itself names the monitor, suggestions flow as plain text — no per-row persona/tab/time meta, no buttons.

**Two classes of tabs.** Tabs split into **action tabs** (everything existing — they take commands, shown in the tab strip above the command bar) and **reporting tabs** (they only report, never take commands — shown in a separate **reporting section below the command bar**, with its own strip and selection, sized to **1/4 the height of the action-tab area**). Monitor tabs are the first reporting tabs; the section is hidden while no reporting tabs exist and is visible regardless of which action tab is active.

In both cases the monitor is a **brand-new ACP connection used only for monitoring** — never the tab's interactive ACP session — with **no tool access**: its only job is to collect information and make suggestions based on it.

### Personas drive the monitor

Each monitor's behavior is dictated by an **AI persona** — a markdown file in `ai/personas/`. Different monitoring styles are just different personas: one tuned to watch for security issues, another tuned to make helpful suggestions on the work at hand. The persona file is fed to the ACP on startup.

### Batching

New transcript entries from the watched tabs accumulate in a per-monitor buffer; every **30 seconds** the buffer is flushed as a single batched prompt into the monitoring session. **If no new transcript entries have accumulated, the flush is skipped entirely — the monitoring ACP is not queried or updated when there is nothing new to report.**

### Data flow

```
monitor <persona> [targets...]
  → Controller loads ai/personas/<persona>.md
  → Parses first-line directive: [//]: # <harness>:<model>:<variant>
  → Spawns a new dedicated ACP connection on that harness/model (tool-less)
  → Sends persona body as the startup prompt
  → No targets (inline mode): watches the current tab,
      suggestions go to this tab's transcript
    Targets (external mode): watches the named tabs/groups,
      suggestions go to the monitor window (opened on demand)

Watched tab appends LogEntry
  → transcriptBus 'entry:appended' → entry accumulates in the monitor's buffer
  → Every 30s: if the buffer is non-empty, flush it as one batched
    prompt into the monitor's ACP session (skip if empty or in flight)
    → AI responds with structured suggestion (marker format)
  → Controller parses suggestion and routes it:
      self-monitor → appended inline to the agent tab's transcript
      monitor window → appended to the window's suggestion feed
    → Controller.view() projects → client renders
```

### Personas (`ai/personas/*.md`)

A persona is a markdown file describing the monitor's role, focus, and tone. The filename (without `.md`) is the persona name used on the command line.

**Harness/model directive**: the first line of every persona file specifies which ACP harness and model to open the monitoring connection with, as a markdown comment:

```
[//]: # <harness>:<model>:<variant-or-effort>
```

- `opencode:model:variant` — e.g. `[//]: # opencode:DeepSeek V4 Flash:max`
- `claude:model:effort` — e.g. `[//]: # claude:Sonnet:high`

The directive drives how the monitor's ACP connection is spawned:

| Harness | Spawn | Model/variant mapping |
| --- | --- | --- |
| `opencode` | `opencode acp` (as today) | model + variant via `OPENCODE_CONFIG_CONTENT` |
| `claude` | Claude Code ACP adapter | model + thinking effort via its config/env |

A persona file with a missing or malformed first-line directive is a load error (see error cases) — the directive is required, not defaulted.

The rest of the file (everything after the directive line) is sent verbatim as the monitoring session's first prompt, followed by the suggestion-format instructions. Initial personas to ship:

- `ai/personas/security.md` — watches for security issues: leaked secrets in output, risky commands, unsafe patterns in code being written.
- `ai/personas/assistant.md` — makes helpful suggestions on the work at hand: next steps, relevant commands, things the agent seems to have missed.

Multiple monitors can run simultaneously — one per persona per owner (an agent tab self-monitor, or the monitor window) — each with its own dedicated ACP connection (possibly on different harnesses/models), buffer, and flush timer.

### Suggestion format (ACP output convention)

The AI agent outputs suggestions as single-line markers:

```
[SUGGESTION]: You might want to check the build output
[COMMAND]: npm run build
```

Fields:
- `[SUGGESTION]` — Human-readable suggestion text (required)
- `[COMMAND]` — An optional command the user can run with one click
- `id` — Auto-generated on the server

Duplicate suggestions are **not suppressed** — if the agent suggests the same thing twice, both appear. Older suggestions simply scroll down the history.

---

### Commands

All monitor commands run in agent tabs; the monitor window itself accepts none.

```
monitor <persona>
```
**Inline mode**: spawns a dedicated tool-less ACP connection per the persona's directive and watches the current tab. Suggestions are appended inline to this tab's transcript.

```
monitor <persona> <target> [target...]
```
**External mode**: watch the named targets, where each target is a **tab label** or a **tab group** (`group:<n>`). Group targets subscribe by group number, so tabs added to the group later are covered automatically. Opens the monitor window (or reuses the existing one); suggestions appear there.

```
monitors
```
List active monitors: for each monitor, show the starting tab, mode (inline/external), persona, targets, and the count of suggestions it has produced.

```
unmonitor <persona> [target]
```
Stop the named persona's monitor started from the current tab, or just remove one target from it. Removing the last target closes the monitor's ACP connection. Already-produced suggestions remain (transcript entries are permanent; reporting-tab suggestions stay in the feed until run or the tab is closed).

```
unmonitor --all
```
Stop all monitors started from the current tab, closing their ACP connections.

### Success output

**`monitor security`** (from agent tab `janus`)
```
→ Now monitoring janus (persona: security)
```

**`monitor assistant agent2 group:2`** (external mode — opens the monitor window)
```
→ Now monitoring agent2, group 2 (agent2, agent3) (persona: assistant)
```

**`monitors`**
```
security: janus ← janus (inline, 2 suggestions)
assistant: agent2, group:2 ← janus (external, 4 suggestions)
```

**`unmonitor security`**
```
→ Stopped security monitor
```

### Error cases

- Persona not found: `No persona "<name>" (looked in ai/personas/<name>.md).`
- Missing/malformed harness directive: `Persona "<name>" has no harness directive. First line must be: [//]: # <harness>:<model>:<variant>.`
- Unknown harness in directive: `Unknown harness "<harness>" in persona "<name>" (expected opencode or claude).`
- Monitoring ACP connection fails to start: `Could not start monitoring agent: <reason>.`
- Target tab not found: `No tab named "<label>".`
- Target group not found: `No group <n>.`
- `monitor` on a non-agent tab: monitor commands only run in agent tabs (the monitor window has no command bar at all).
- Duplicate: same persona already running from this tab: `Already monitoring with persona "<persona>".`

---

### Server-side changes

#### 1. `src/types.ts` — New types

```ts
export type MonitorTarget =
  | { kind: 'tab'; label: string }
  | { kind: 'group'; group: number };

export type MonitorSuggestion = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  persona: string;
  // The tab whose activity prompted the suggestion.
  about: string;
};
```

Add `'monitor'` to the tab `view` union. The monitor window tab carries the suggestion feed:

```ts
// On Tab, present only when view === 'monitor':
monitor?: { suggestions: MonitorSuggestion[] };
```

Monitor subscription state lives in the Controller, keyed by owner + persona (owner = agent tab label for self-monitors, or the monitor window's label):

```ts
// `${ownerLabel}:${persona}` → subscription
private monitors = new Map<string, MonitorSubscription>();
```

`MonitorSubscription` holds:
- `owner: string` — the tab that started it (agent tab, or the monitor window)
- `inline: boolean` — true for self-monitors (suggestions go to the owner's transcript)
- `persona: string` — persona name (resolves to `ai/personas/<persona>.md`)
- `targets: MonitorTarget[]` — the watched tabs/groups (for self-monitors, just the owner tab)
- `buffer: { tabLabel: string; entry: LogEntry }[]` — entries accumulated since the last flush
- `timer` — 30-second interval driving the flush
- `session` — the monitor's own ACP connection, spawned fresh per the persona directive with tools disabled and primed with the persona body; never shared with the tab's interactive session
- `inFlight: boolean` — true while a flush prompt is still streaming

#### 2. `src/protocol.ts` — Wire types

```ts
export type SuggestionView = {
  id: string;
  text: string;
  command?: string;
  timestamp: number;
  persona: string;
  about: string;
};

// On TabView, present only when view === 'monitor':
monitor?: { suggestions: SuggestionView[] };
```

Self-monitor suggestions need no wire type — they arrive as ordinary transcript entries (`BufferLine`s) in the owner tab.

#### 3. `src/controller.ts` — Monitor lifecycle

**New private methods**:
- `startMonitor(ownerLabel, persona, targets, inline)`: loads the persona (directive + body), spawns a fresh tool-less ACP connection on the directive's harness/model, sends the persona body as the startup prompt, sets up subscriptions, starts the 30s flush timer
- `stopMonitor(ownerLabel, persona, target?)`: removes a target subscription; closes the monitor's ACP connection and timer when no targets remain
- `stopAllMonitors(ownerLabel)`: clears every persona's monitor for this owner
- `flushMonitor(key)`: sends the buffered entries as one prompt (see below)
- `openMonitorWindow()`: creates (or returns) the `view: 'monitor'` tab, labeled `monitor`
- `runSuggestion(id)` (RPC): runs a suggestion's command in its `about` tab, then removes it from the feed (internal `dismissSuggestion(id)` helper)

The monitor's ACP connection appears in the connections panel as its own row (e.g. `monitor:security (claude/Sonnet)`), distinct from any interactive ACP row, and is torn down when the monitor stops or its owner tab closes.

**Monitor as a `transcriptBus` subscriber**: Rather than hooking `append()` directly, the monitor subsystem subscribes to `controller.transcriptBus` for `entry:appended` events. Matching is by tab label *or* by the tab's group number, so group targets automatically cover tabs added to the group later. Entries are **buffered**, not fed immediately:

```ts
startMonitor(ownerLabel: string, personaName: string, targets: MonitorTarget[], inline: boolean): void {
  // Throws on missing file / missing or malformed harness directive.
  const persona = loadPersona(personaName);
  // A brand-new ACP connection just for this monitor: spawned on the harness/model from the
  // persona's directive (opencode acp with OPENCODE_CONFIG_CONTENT, or the Claude Code ACP
  // adapter with model/effort config), tools disabled, primed with the persona body as its
  // first prompt.
  const session = spawnMonitorSession(persona);
  const key = `${ownerLabel}:${personaName}`;
  const reg: MonitorSubscription = { owner: ownerLabel, inline, persona: personaName, targets, buffer: [], session, inFlight: false, timer: undefined };
  reg.sub = this.controller.transcriptBus.on('entry:appended', (event) => {
    if (this.matchesTargets(reg.targets, event.tabLabel)) {
      reg.buffer.push({ tabLabel: event.tabLabel, entry: event.entry });
    }
  });
  reg.cleanup = this.controller.transcriptBus.on('tab:removed', (event) => {
    // Only tab targets are removed; group targets persist (the group may gain new tabs).
    this.stopMonitor(ownerLabel, personaName, { kind: 'tab', label: event.tabLabel });
  });
  reg.timer = setInterval(() => this.flushMonitor(key), 30_000);
  this.monitors.set(key, reg);
}

stopMonitor(ownerLabel: string, persona: string, target?: MonitorTarget): void {
  const key = `${ownerLabel}:${persona}`;
  const reg = this.monitors.get(key);
  if (!reg) return;
  if (target) reg.targets = reg.targets.filter((t) => !sameTarget(t, target));
  if (!target || reg.targets.length === 0) {
    reg.sub.unsubscribe();
    reg.cleanup.unsubscribe();
    clearInterval(reg.timer);
    reg.session.close(); // kills the dedicated monitoring ACP subprocess
    this.monitors.delete(key);
  }
}
```

`matchesTargets(targets, tabLabel)` returns true when a target names the tab directly or when a group target's number equals that tab's current `group`. For a self-monitor, `targets` is `[{ kind: 'tab', label: ownerLabel }]` — the same matching path, no special case.

No `notifyMonitors()` method and no `append()` hook are needed — the bus carries the event to any number of subscribers without `append()` knowing monitors exist.

**`flushMonitor()`** — the 30-second batch: sends everything buffered since the last flush as a single prompt, then parses the response for `[SUGGESTION]` markers. **An empty buffer means no flush — the ACP is not queried when there are no new transcript entries.** If a previous flush prompt is still streaming (`inFlight`), the flush is skipped and the buffer keeps accumulating until the next tick — at most one monitor prompt is in flight per monitor, which resolves the async-safety concern:

```ts
private flushMonitor(key: string): void {
  const reg = this.monitors.get(key);
  // No new transcripts → no ACP query at all; also skip while a prompt is streaming.
  if (!reg || reg.inFlight || reg.buffer.length === 0) return;
  const batch = reg.buffer;
  reg.buffer = [];
  const body = batch
    .map(({ tabLabel, entry }) => `[${tabLabel}]\n${entry.input}\n${entry.output}`)
    .join('\n\n');
  const prompt = `[Monitor update]\n${body}\n\nIf you have a suggestion, respond with:\n[SUGGESTION]: <text>\n[COMMAND]: <optional command>`;
  reg.inFlight = true;
  reg.session.prompt(prompt, {
    onChunk: (text) => { /* accumulate */ },
    onEnd: (final) => {
      reg.inFlight = false;
      const suggestion = parseSuggestion(final);
      // No dedup: identical suggestions are delivered as-is.
      if (suggestion) this.deliverSuggestion(reg, batch.at(-1)!.tabLabel, suggestion);
    },
    onError: () => { reg.inFlight = false; },
  });
}
```

**`deliverSuggestion()`** — routes by use case:

```ts
private deliverSuggestion(reg: MonitorSubscription, about: string, s: MonitorSuggestion): void {
  if (reg.inline) {
    // Use case 1: append to the owner agent tab's transcript, e.g.
    //   💡 security: You might want to check the build output
    //      → npm run build
    this.appendSuggestionEntry(reg.owner, reg.persona, s);
  } else {
    // Use case 2: push onto the monitor window's feed.
    this.monitorWindowTab().monitor!.suggestions.push(s);
  }
  this.render();
}
```

**`runApp` switch**: Add `case 'monitor':` and `case 'unmonitor':` branches (delegating to `parseMonitorCommand`, `parseUnmonitorCommand`). The `monitor` branch decides the use case: no targets on an agent tab → inline self-monitor; targets given → `openMonitorWindow()` and register there.

**Monitor window is view-only**: it renders like the other view tabs (image/page/markdown) with no command bar, so no command gating is needed — commands simply cannot be typed there. The "Run" button dispatches the suggestion's command into the tab the suggestion is `about`, not into the monitor window.

#### 4. `src/commands/monitor.ts` — New command parser

```ts
// First arg is the persona name; targets (optional) accept tab labels and `group:<n>` forms.
export function parseMonitorCommand(input: string): { persona: string; targets: MonitorTarget[] } | { error: string }
export function parseUnmonitorCommand(input: string): { persona?: string; target?: MonitorTarget; all?: boolean } | { error: string }
export function parseSuggestion(text: string): MonitorSuggestion | null
```

#### 5. `src/personas.ts` — New module: persona loading

```ts
export type PersonaHarness = {
  harness: 'opencode' | 'claude';
  model: string;
  // opencode: variant (e.g. "max"); claude: thinking effort (e.g. "high").
  variant: string;
};

export type Persona = {
  name: string;
  harness: PersonaHarness;  // parsed from the first-line [//]: # directive
  body: string;             // everything after the directive line
};

// Reads and parses ai/personas/<name>.md; throws on missing file, missing/malformed
// directive, or unknown harness. `listPersonas()` lists names for completion/errors.
export function loadPersona(name: string): Persona
export function listPersonas(): string[]
```

The directive grammar is `[//]: # <harness>:<model>:<variant>` on line 1. `model` may contain spaces (e.g. `DeepSeek V4 Flash`), so the parser splits on the *first* and *last* colon after the `[//]: # ` prefix, not naively on every colon.

#### 6. `src/monitor-acp.ts` — New module: harness→spawn mapping

`spawnMonitorSession(persona)` opens the dedicated monitoring ACP connection per the persona's directive: `opencode acp` with model/variant via `OPENCODE_CONFIG_CONTENT`, or the Claude Code ACP adapter with model/effort config. Tools disabled in both cases.

#### 7. `src/commands/index.ts` — Register commands

Import and register `monitor` and `unmonitor`.

#### 8. `src/completion.ts` — Tab completion

When the input starts with `monitor ` or `unmonitor `: the first argument completes against persona names (`listPersonas()`); later arguments complete against all tab labels except the current tab, plus `group:<n>` for each existing group number.

---

### Client-side changes

#### 9. `web/src/MonitorTab.tsx` + `web/src/ReportingSection.tsx` — New components

`ReportingSection` renders the reporting-tab area below the command bar (own mini strip, client-side selection, hidden when empty, `flex: 0 0 20%` so it is 1/4 the height of the action area). `MonitorTab` renders one monitor's suggestion feed inside it, **newest at the top** — new suggestions push older ones down, the scroll position rests at the top, and scrolling down walks back through the history:

```
┌──────────────────────────────────────┐
│ That curl pipes straight to sh —     │
│ inspect the script first             │
│                                      │
│ Try running the linter               │
│ npm run lint            ← clickable  │
│                                      │
└──────────────────────────────────────┘
```

Props:
- `suggestions: SuggestionView[]`
- `onRun: (id: string) => void`

Behavior:
- Suggestions flow as plain text — no row chrome, no per-row persona/tab/time meta, no buttons
- A suggestion that carries a command shows it as a clickable line; clicking dispatches `onRun` with the suggestion's id (the server runs the command in the `about` tab and removes the suggestion from the feed)
- Suggestions without a command are informational only

#### 10. Inline suggestions (use case 1) — no new component

Self-monitor suggestions arrive as ordinary transcript entries in the agent tab (rendered through the existing transcript pipeline), styled as a suggestion line (`💡 <persona>: <text>`, with the optional command on a follow-up line). No layout change to agent tabs.

#### 11. `web/src/App.tsx` — Integration

- Split tabs into action entries and reporting entries (`isReportingTab`: `view === 'monitor'`); the main `TabStrip` shows only action tabs (indices mapped back to the server's full list)
- Render `ReportingSection` at the bottom of the app column, after the tab bodies/command bar
- Wire `onRun` to the new `runSuggestion` RPC (the server executes the command in the tab the suggestion is about, then removes the suggestion)

#### 12. `src/protocol.ts` — New RPC method (shared with the client via `@shared`)

```ts
| { method: 'runSuggestion'; params: { id: string } }
```

Server-side handler runs the suggestion's command in its `about` tab, removes it from the feed, and emits updated state.

#### 13. `web/src/theme.css` — Styling

```css
/* Reporting section: second class of tabs, below the command bar, 1/4 the height of
   the action area. */
.reporting-section {
  flex: 0 0 20%; min-height: 0; display: flex; flex-direction: column;
  border-top: 1px solid var(--border);
}
.reporting-strip .tab { padding: 2px 10px 4px; font-size: 12px; }
.reporting-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

/* Monitor feed: plain text flow, newest at top; suggested commands are clickable. */
.monitor-view { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }
.monitor-suggestion { margin-bottom: 10px; font-size: 13px; color: var(--fg); }
.monitor-suggestion .cmd {
  display: block; margin-top: 2px; padding: 0;
  background: transparent; border: none; text-align: left;
  color: var(--accent); font-family: var(--mono); font-size: 12px; cursor: pointer;
}
.monitor-suggestion .cmd:hover { text-decoration: underline; }

/* Inline suggestion entries in agent transcripts */
.transcript .suggestion-line {
  color: var(--accent, #4a9eff);
}
```

---

## Files to change

### 1. `src/types.ts` — Add `MonitorSuggestion`, `MonitorTarget`; add `'monitor'` to the tab `view` union with a `monitor` payload (suggestion feed)
### 2. `src/protocol.ts` — Add `SuggestionView`; add `monitor` payload to `TabView`; add `runSuggestion` to `RpcCall`
### 3. `src/commands/monitor.ts` — New file: parsers for `monitor`/`unmonitor` (persona + optional tab/`group:<n>` targets), suggestion extraction
### 4. `src/commands/index.ts` — Register `monitor`, `unmonitor`
### 5. `src/personas.ts` — New file: `loadPersona()` (including first-line harness directive parsing), `listPersonas()` over `ai/personas/`
### 6. `src/monitor-acp.ts` — New file: harness→spawn mapping per the persona directive, tools disabled
### 7. `src/controller.ts` — Monitor subscription state keyed by `${ownerLabel}:${persona}` (buffer, 30s flush timer with empty-buffer skip, dedicated tool-less ACP connection primed with the persona body), `flushMonitor()`, `deliverSuggestion()` routing (inline transcript vs. reporting tab), `openMonitorTab()`, new command branches, `runSuggestion` handler, monitor row in the connections panel; subscribe to `controller.transcriptBus` in `startMonitor()` rather than adding an `append()` hook — the bus decouples producers from consumers
### 8. `src/completion.ts` — Completion for `monitor`/`unmonitor`: personas first, then targets (labels + `group:<n>`)
### 9. `ai/personas/security.md`, `ai/personas/assistant.md` — Initial persona files (each starting with its harness directive)
### 10. `web/src/MonitorTab.tsx`, `web/src/ReportingSection.tsx` — New components: view-only suggestion feed + the reporting-tab section below the command bar
### 11. `web/src/App.tsx` — Split action/reporting tabs, render `ReportingSection`, wire `runSuggestion` RPC; style inline suggestion entries
### 12. (protocol shared with client via `@shared` — no `ws.ts` change needed)
### 13. `web/src/theme.css` — `.monitor-view`, `.monitor-suggestion`, inline `.suggestion-line` styles
### 14. `src/commands/monitor.test.ts` — New file: unit tests for command parsers, persona arg handling
### 15. `src/personas.test.ts` — New file: unit tests for persona loading/listing and directive parsing (multi-colon models, missing/malformed directives)
### 16. `src/controller.test.ts` — Integration tests for monitor lifecycle (both delivery modes: inline and monitor-window, dedicated connection spawn/teardown, persona priming, flush batching, empty-buffer skip)

---

## Implementation steps

Ordered so every step leaves the tree compiling and testable (`./scripts/run.mjs check-diff` after each). Given the 200-line file limit, the monitor subsystem is built as its own manager module (like `AcpManager`) rather than inlined into `controller.ts`.

**Phase 1 — foundations (no behavior change)**

1. **Types** (`src/types.ts`): add `MonitorTarget`, `MonitorSuggestion`; add `'monitor'` to the tab `view` union with the `monitor?: { suggestions: MonitorSuggestion[] }` payload.
2. **Wire types** (`src/protocol.ts`): add `SuggestionView`, the `monitor` payload on `TabView`, and `runSuggestion` in `RpcCall` (shared with the web client via the `@shared` alias — no mirror needed).
3. **Persona loader** (`src/personas.ts` + `src/personas.test.ts`): `loadPersona()` with first-line directive parsing (first/last-colon split for multi-colon models, missing/malformed/unknown-harness errors) and `listPersonas()`. Tests first — this is pure parsing.
4. **Persona files** (`ai/personas/security.md`, `ai/personas/assistant.md`): each starting with its harness directive, body text per the personas section.
5. **Command parsers** (`src/commands/monitor.ts` + `src/commands/monitor.test.ts`): `parseMonitorCommand` (persona + optional targets incl. `group:<n>`), `parseUnmonitorCommand` (`--all`, optional target), `parseSuggestion` (`[SUGGESTION]`/`[COMMAND]` markers). Also pure — test alongside.

**Phase 2 — server wiring**

6. **Harness spawn** (`src/monitor-acp.ts`): `spawnMonitorSession(persona)` mapping the directive to `connectAcp` settings — `opencode acp` + `OPENCODE_CONFIG_CONTENT` (model/variant) or the Claude Code ACP adapter (model/effort), tools disabled.
7. **Monitor manager** (new `src/monitor-manager.ts`): subscription registry keyed by `${ownerLabel}:${persona}` (targets, buffer, 30s timer, session, `inFlight`), `startMonitor`/`stopMonitor`/`stopAllMonitors`, `transcriptBus` subscriptions with tab/group matching, `flushMonitor` with empty-buffer and in-flight skips, `deliverSuggestion` routing (inline transcript entry vs. monitor-window feed).
8. **Controller integration** (`src/controller.ts` + `src/commands/index.ts`): register `monitor`/`unmonitor`/`monitors` command branches, mode dispatch (no targets → inline self-monitor; targets → `openMonitorTab()` + external delivery), `runSuggestion` RPC handler, connections-panel row for monitor sessions, teardown on owner-tab close.
9. **Completion** (`src/completion.ts`): persona names for the first arg, tab labels + `group:<n>` for targets.
10. **Controller integration tests** (`src/controller.test.ts`): both delivery modes, spawn/teardown, persona priming, flush batching, empty-buffer skip.

**Phase 3 — client**

11. **MonitorTab + ReportingSection** (`web/src/MonitorTab.tsx`, `web/src/ReportingSection.tsx` + `web/src/theme.css`): view-only plain-text feed, newest at top, clickable commands, inside the reporting section below the command bar (1/4 height, own strip/selection, monitored-tab colors, hidden when empty).
12. **App integration** (`web/src/App.tsx`): split action/reporting tabs, render `ReportingSection`, wire command clicks → `runSuggestion` RPC; style inline `.suggestion-line` transcript entries.

**Phase 4 — verify**

13. End-to-end pass with `./scripts/run.mjs check-diff`; manual smoke: `monitor security` on an agent tab (inline suggestions), `monitor assistant agent2 group:2` (reporting-tab feed, clickable command run). Human runs `npm run check` once at the end.

---

## Non-goals

- A full "agent dashboard" with live metrics — the monitor window is a text-suggestion feed only.
- Bi-directional monitoring loops (A monitors B, B monitors A) — explicitly detected and rejected.
- Monitoring non-agent tabs (image/page/harness/markdown) — the suggestion flow is text-driven; only agent tabs produce the transcript entries the ACP agent can reason about.
- Persisting monitor subscriptions across restarts — monitors are ephemeral session state (like scrollOffset).
- Merged suggestion feeds — each monitor reports into its own reporting tab; there is no combined "all monitors" view.

---

## Resolved design decisions

1. **ACP session contention** → The monitoring ACP session is **separate and tool-less**. Its only job is to collect information and make suggestions based on it; it never runs commands, so it cannot interfere with the tab's interactive session or tool loop.
2. **Suggestion frequency** → Transcript entries **accumulate in a buffer and are flushed as one batched prompt every 30 seconds**. No per-entry prompting. **If no new transcript entries are available, the flush is skipped — the monitoring ACP is not queried or updated at all.**
3. **Suggestion deduplication** → **No suppression.** Repeated suggestions are delivered as-is; older ones scroll down the history.
4. **Async ACP prompt** → At most **one monitor prompt in flight per monitor**: if the 30s flush fires while a previous prompt is still streaming, the flush is skipped and the buffer keeps accumulating until the next tick.
5. **Two use cases / suggestion destination** → `monitor <persona>` from an **agent tab** self-monitors that tab and reports suggestions **inline in its transcript**; `monitor <persona> <targets...>` reports suggestions **into that monitor's own reporting tab** (opened on demand). Reporting-tab suggestions stay in the feed until run or the tab is closed; inline suggestions are ordinary transcript entries.
6. **Monitoring scope** → Targets can be individual **tabs or entire tab groups** (`group:<n>`); group targets track membership dynamically, covering tabs added to the group after the monitor starts.
7. **Personas** → Monitoring behavior is dictated by an **AI persona**: a markdown file in `ai/personas/` fed to the monitoring ACP session as its startup prompt. Different monitoring styles (security watch, work-at-hand assistant, …) are just different persona files; one monitor per persona per owner.
8. **Dedicated connection** → Each monitor spawns a **new ACP connection used only for monitoring**, never reusing the tab's interactive session; it is closed when the monitor stops.
9. **Harness/model per persona** → The persona file's **first line** is a required directive `[//]: # <harness>:<model>:<variant>` (e.g. `[//]: # opencode:DeepSeek V4 Flash:max`, `[//]: # claude:Sonnet:high`) that determines which ACP harness, model, and variant/effort the monitoring connection is opened with.
10. **Monitor tabs are view-only** → Only for viewing suggestions: no command bar, no commands accepted, no buttons. Opened by executing an external-mode `monitor` command in an agent tab. The only interaction is clicking a suggested command, which runs it in the tab the suggestion is about (via a `runSuggestion` RPC routed server-side) and removes it from the feed.
11. **Two tab classes** → **Action tabs** (take commands) live in the strip above the command bar; **reporting tabs** (report-only) live in a separate reporting section **below the command bar**, sized to **1/4 the height of the action-tab area**, with its own strip and selection. The section hides when no reporting tabs exist.
12. **One reporting tab per monitor** → Each monitor gets its own reporting tab **named after its persona** (e.g. `security`) and **colored after the monitored tab** (strip dot/border, body left-border). Feed rows show just the suggestion text and optional command — no persona/tab/time columns.
