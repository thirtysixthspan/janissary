# Notifications Tab for Background Tab Events

**Complexity: 6/10** — breadth-driven rather than hard: a new `notifications` view kind on both server and client, a new singleton owner module (`notifications-tab.ts`), a new React component (`NotificationsTab.tsx`), an event-detection module wired at four existing hook points, two new commands, a config type, and a protocol-level dock-RPC generalization (`fileTreeSetDock` → `setDock`) that ripples through ~6 files plus tests — all landing across specs, help, and public docs. What holds it out of the 7+ band is heavy reuse: notifications are ordinary transcript entries riding the existing `TabManager.append` → `entry:appended` broadcast and per-tab `bufferLines` sync (no new server-push channel, no toast), docking already works generically server-side (`TabManager.setDock`), and the tab mirrors two working precedents (monitor singleton + file-tree docking). No concurrency or state-machine reasoning; the risk is coordinating many small edits so typecheck/tests stay green at each step (hence the explicit ordering).

## Summary

Add a dedicated **notifications tab** — a singleton, view-only tab labeled `notifications` that receives every notification-worthy background event as a line in its own scrollable transcript. Events that notify: a harness/agent finishes running, an agent starts a turn, a scheduled command fires, or an incoming `msg`/`broadcast` arrives — each fired only for a **background** tab (the focused tab never notifies about its own activity), and each independently togglable in `.janissary/config.json`.

The notifications tab behaves like the file navigator tab (see `file-tree-tab.md`): it can sit as a normal tab in the central strip **or** be docked into the left or right sidebar, sharing the sidebar system with the file navigator under the same one-tab-per-sidebar displacement rules (see `sidebars.md`). Unlike an agent tab it has **its own scrollable transcript but no command bar** — it accepts no typed input; its only content is the notification feed.

## Decisions (to be confirmed with user)

1. **Delivery model: a dedicated notifications tab, not toasts.** All notifications land as transcript entries in one singleton tab. There is no transient toast banner and no net-new server→client push channel — the tab's transcript is broadcast to the client exactly like every other tab's (`TabView.bufferLines`), so a docked notifications tab renders its feed even though it is never the active tab. (This supersedes the earlier toast + `Sinks.showNotification` design; see Superseded design below.)
2. **Singleton, explicitly opened only.** There is only ever **one** notifications tab, and it is **never created automatically** — it appears only when the user runs the `notifications` command. Opening it when it already exists focuses (or re-docks) the existing one — mirroring "one tree per root" for file tree tabs. Its label is always `notifications`; per [[tab-label-no-markers]] no type or status marker is appended.
   - **Events fired while the tab is closed are dropped, not buffered.** A notification is recorded only if the notifications tab is currently open at the moment the event fires; there is no backlog that fills the tab when it is later opened. This keeps the tab a live in-memory view (consistent with the file tree tab) and avoids an unbounded queue of stale events. Closing the tab and reopening it starts a fresh, empty feed.
3. **Sidebar-capable, like the file navigator.** The notifications tab can live in the central strip or be docked into either sidebar. It obeys the same docking mechanics as the file tree tab: at most one docked tab per sidebar, docking into an occupied sidebar non-destructively displaces the current occupant back to center, a docked tab is never the active tab, and dock placement/sidebar width are never persisted (see `sidebars.md`). Because docking is already generic server-side, the notifications tab and the file navigator can each occupy a different sidebar simultaneously, and docking one into a side already holding the other displaces that other back to center — the same interaction as any two dockable tabs.
4. **No command bar; own transcript.** The tab renders a scrollable transcript of notification lines and nothing else — no command line, no completion, no history. It is a view tab (`view: 'notifications'`), so the command bar is suppressed the same way it already is for image/page/files tabs; but unlike those views its body is the standard `<Transcript>` component fed by the tab's own `bufferLines`.
5. **Event types that can notify** (unchanged from the prior analysis): `state-change` (an agent tab's busy flag clears — busy → idle), `incoming-message` (a `msg`/`broadcast` received by a non-focused tab, detected via `LogEntry.from`), `schedule-fire` (a scheduled command fires in a non-focused tab), `agent-start` (an ACP session's first `startTurn`, busy false → true). Each is independently togglable; all default OFF (opt-in).
6. **Focus suppression.** An event on the **currently active** tab never generates a notification. Only background tabs feed the notifications tab. (The notifications tab itself is a view tab that produces no such events, so it never notifies about itself.)
7. **Agent-triggered notifications.** A `notify <message>` command lets an agent (or a user) push a custom notification line into the feed from any tab — the deliberate counterpart to the four ambient events. Because it is an explicit, intentional signal rather than ambient activity, it is treated as a fifth event type (`manual`) that **bypasses focus suppression and the per-event opt-in toggles** (an agent that calls `notify` always means to signal, even about the focused tab), subject only to the **drop-if-closed rule** (it never opens the tab; if the notifications tab is closed, the message is dropped, consistent with Decision 2). The line is attributed to the issuing tab (e.g. `build-agent: deploy finished`).

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| A singleton, view-only feed tab that is reused on demand and appended to over time | Monitor reporting tabs: `openMonitorTab` reuses the existing tab by label or creates one; the tab carries `view: 'monitor'` and a payload array. The notifications tab mirrors the singleton open-or-reuse shape, but with `view: 'notifications'`, a transcript body instead of a suggestion feed, placement in the strip/group rather than the reporting section, and — unlike monitor's `pushSuggestion` — appends **never auto-open** the tab (see Decisions). | `src/monitor-window.ts:13-19` (`makeMonitorTab`), `:40-48` (`openMonitorTab`) |
| A dockable, sidebar-capable view tab with a dock-cycle button and a docked close button | File tree tab: `view: 'files'` (`makeFilesTab`), docked via `TabManager.setDock`, redocked from the client with the `fileTreeSetDock` RPC and a header dock-cycle/close button pair that render **only while docked** (`{dock && …}`) — note `nextDock` toggles left↔right only, never center; center placement is reached via the bare command, not the button | `src/tab.ts:60-65`, `src/file-tree-manager.ts:47,55`, `web/src/FileTreeTab.tsx:24,29,108-144`, `src/message-handler.ts:62` |
| Docking mechanics (one-per-sidebar, displacement, active-tab invariant) — already generic, not files-specific | `TabManager.setDock(index, dock)` operates on any tab index: displaces the prior occupant, moves focus off a docked tab, undock makes active | `src/tab-manager.ts:185-208` |
| Rendering a docked tab's body in a sidebar | `Sidebar.tsx` renders the docked tab's label strip + close button, then the body — today hard-coded to `view === 'files'` → `<FileTreeTab>`. Extend with a `view === 'notifications'` branch rendering `<NotificationsTab>` (§4). | `web/src/Sidebar.tsx:34-58` |
| Suppressing the command bar for a view tab | `App.tsx`'s `isViewTab` list gates both the transcript+command-bar block (`!isViewTab && …`) and search; adding `'notifications'` to that list suppresses the command bar. The notifications view then renders its own transcript via `ViewTabBody`. | `web/src/App.tsx:80,175`, `web/src/ViewTabBody.tsx` |
| Getting a tab's transcript to the client without it being active | The server builds `TabView.bufferLines` for **every** tab from its own `log` (`this.tabs.map((t) => ({ … bufferLines: flattenBuffer(t.log, …) }))`), consumed by `<Transcript lines={…}>`. `App.tsx` feeds the **active** tab's `bufferLines`; the notifications view feeds **its own** `tab.bufferLines`, so a docked (never-active) notifications tab still renders its feed. | `src/tab-manager.ts:349-361`, `src/protocol.ts:43`, `web/src/App.tsx:76,187`, `web/src/Transcript.tsx:7` |
| Appending a line to a tab's transcript, marking unread, broadcasting | `TabManager.append(label, entry)` records the `LogEntry`, calls `markUnread` (already a no-op for the active tab — `if (label === this.activeLabel()) return;`), and emits `messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry, tab })` — the single funnel every transcript write already uses | `src/tab-manager.ts:296-305` (`append`, emit at :304), `:157-161` (`markUnread`) |
| Reading typed config at an event hook | `getConfig()` returns the parsed `Config`; the notification event toggles are read-only at runtime (`getConfig().notifications`), set by the user editing `.janissary/config.json` directly — there is no runtime writer (mute was removed), so `updateConfig` is **not** needed and no config-mutation command or RPC is added. | `src/config.ts:44` (`getConfig`) |
| Distinguishing an incoming cross-agent message from any other transcript entry | `LogEntry.from` is set only for `msg`/`broadcast` deliveries; both funnel through `AgentCommunicationManager.handle` → `append`, so one check covers both | `src/types.ts:16`, `src/agent-communication-manager.ts:53-77` |
| Busy/idle transition for `state-change` and `agent-start` | `TabManager.isBusy/addBusy/deleteBusy` (the `busy` Set); ACP calls `addBusy` on `startTurn` (agent-start) and `deleteBusy` on `finished`/`error` (state-change) | `src/tab-manager.ts:22` (`busy` Set), `:46,58,62` (`isBusy`/`addBusy`/`deleteBusy`), `src/acp-manager.ts:109,114,119` |
| Schedule dispatch point | `ScheduleManager.fire()` — the only place a scheduled command is delivered, for both harness (PTY write) and agent (`command.dispatchTo`) targets | `src/schedule-manager.ts:71-98` |
| A view-only command that opens/docks a tab and mirrors `left`/`right` keyword parsing | `files [left|right] [path]` → `command: files` dispatches to `FileTreeManager.open`, which parses the leading `left`/`right` keyword and calls `setDock` | `src/commands/files.ts`, `src/file-tree-manager.ts:32-56` |

## Verified codebase facts that shape the design

- **`TabView.bufferLines` already carries every tab's transcript to the client** (`src/protocol.ts:43`). This is why the notifications tab needs no new push channel: appending to it and letting the existing state broadcast run is sufficient, even when it is docked and never active. The earlier plan's net-new `Sinks.showNotification` field is therefore dropped.
- **Docking is generic, not files-specific.** `TabManager.setDock` (`src/tab-manager.ts:185`) takes any tab index; the only files-specific piece is the client wiring (`Sidebar.tsx` render branch, `fileTreeSetDock` RPC). The notifications tab reuses `setDock` and needs its own client wiring.
- **The command bar is suppressed by the `isViewTab` list** (`web/src/App.tsx:80`), not by a per-tab flag. Adding `'notifications'` there is the whole "no command bar" mechanism; the transcript is then rendered by the view-tab path, not the command-bar path.
- **There is no `MessageHandler`/`AgentManager` domain class** for the event sources: message delivery is `AgentCommunicationManager` (`managers.communication`); ACP is `AcpManager` (`managers.acp`).
- **The real config test file is `src/config.test.ts`** (there is no `config-manager.test.ts`).
- **Monitor tabs sit in the reporting section (group 0), not the strip.** The notifications tab is **not** a reporting tab — it is a strip/sidebar tab like the file tree tab, so it must NOT be caught by `isReportingTab` (`web/src/ReportingSection.tsx:8`) and must be created with a normal group/color, not group 0.

## Proposed changes

### 1. Config type

Add `notifications?: NotificationConfig` to `Config` (`src/types.ts`):

```typescript
type NotificationConfig = {
  events: {
    stateChange: boolean;
    incomingMessage: boolean;
    scheduleFire: boolean;
    agentStart: boolean;
  };
};
```

All `events.*` default to `false` (opt-in). There is intentionally **no `events` toggle for the `manual` event** — an agent-triggered `notify` is always eligible (subject only to the tab being open), because the caller opted in by invoking the command. (The prior `sound` field is deferred — see Out of scope.)

### 2. The notifications tab (server)

- New tab kind: `view: 'notifications'`. Add `'notifications'` to the `Tab.view` union (`src/types.ts:146`) and the `TabView.view` union (`src/protocol.ts:48`). No new payload field is needed — the feed is just the tab's ordinary `log`/`bufferLines`.
- New `makeNotificationsTab(label, dotColor, number, group, groupColor)` in `src/tab.ts`, mirroring `makeFilesTab` but with `view: 'notifications'`, `title: 'notifications'`, and an empty initial log. Like file tree / markdown / image tabs it is a **live, in-memory view** — not persisted, not restored on `--relaunch`.
- New `src/notifications-tab.ts` (mirrors `src/monitor-window.ts`), the singleton owner:
  - `NOTIFICATIONS_LABEL = 'notifications'`.
  - `notificationsTab(managers): Tab | undefined` — the single tab with `view === 'notifications'`, if open.
  - `openNotificationsTab(managers, dock?): Tab` — **called only from the `notifications` command**, never from the event path. Reuse the existing tab (re-docking it if a `dock` argument is given) or create one. On create, place it like a file tree tab: contiguous at the **start** of the active tab's group, inheriting that group's number/color with a distinct dot color (reuse `addFilesTab`'s placement approach via a sibling `addNotificationsTab` in `src/tab-creators.ts`). Then optionally `setDock`.
  - `appendNotification(managers, entry: LogEntry): void` — append **only if the notifications tab is already open** (`notificationsTab(managers)` returns a tab); otherwise it is a **no-op** — the event is dropped, not buffered, and the tab is not created. When open, it calls `managers.tab.append(NOTIFICATIONS_LABEL, entry)`, reusing the existing append→broadcast funnel (unread badge, `entry:appended`, `bufferLines` sync) with no bespoke plumbing.

### 3. Event detection → append to the tab

- New `src/notifications.ts`:
  - `NotificationEventType = 'state-change' | 'incoming-message' | 'schedule-fire' | 'agent-start' | 'manual'`.
  - `shouldNotify(config, event, tabLabel, activeLabel): boolean` — false if `tabLabel === NOTIFICATIONS_LABEL` (defensive; never let the tab feed itself). For the four **ambient** events, also false if the event's `events.*` toggle is off or if `tabLabel === activeLabel` (focus suppression, mirroring `TabManager.markUnread`). The **`manual`** event (from the `notify` command, see §5) skips both the per-event toggle and focus suppression — an explicit trigger always fires — so for it `shouldNotify` is always `true` (subject only to the tab-open check enforced in `notify`).
  - `notify(managers, event, tabLabel, message?): void` — first returns immediately if the notifications tab is not open (`notificationsTab(managers)` is undefined), so the event path costs nothing while the tab is closed and never creates it. Otherwise reads `getConfig().notifications`, checks `shouldNotify` against `managers.tab.cur().label`, and on pass builds the line text and calls `appendNotification`. For the four ambient events the text is derived from the event type (e.g. `Agent 'deploy-agent' finished`, `deploy-agent → reviewer: <preview>`, `Scheduled: <command> in build-agent`, `Agent 'reviewer' started`); for the `manual` event the text is the caller's `message`, attributed to the issuing tab (e.g. `build-agent: <message>`). The `LogEntry` records `input: ''` and `output: <text>`; clicking a notification's referenced tab is a v2 nicety (see Out of scope).
- Hook points (using the real managers/hooks):
  - `incoming-message`: in `Controller`'s existing `messageBus.on('transcript', 'entry:appended', …)` subscriber (`src/controller.ts:57-60`) — the event carries `entry`, `tabLabel`, and `tab` (`src/tab-manager.ts:304`), so when `event.entry.from` is set (and the source tab isn't the active one), call `notify(managers, 'incoming-message', event.tabLabel)`. Covers both `msg` and `broadcast`.
  - `state-change` / `agent-start`: `AcpManager.run()`'s `startTurn`/`finished`/`error` hooks (`src/acp-manager.ts:109,114,119`) — first `startTurn` fires `agent-start`; `finished`/`error` fire `state-change`. These already sit next to `addBusy`/`deleteBusy`.
  - `schedule-fire`: after a successful `ScheduleManager.fire()` (`src/schedule-manager.ts:85-98`), call `notify(managers, 'schedule-fire', tab.label)`.

### 4. Web UI — render the notifications view (no command bar)

- Add `'notifications'` to `App.tsx`'s `isViewTab` list (`web/src/App.tsx:80`) — a single string literal added to the existing array, no new lines (App.tsx is ~234 raw lines, near the 200 non-blank limit, so keep the change to this token; put all new logic in the new module below). This suppresses the command bar and transcript-search for the tab; the body is rendered by the view path instead.
- **New component `web/src/NotificationsTab.tsx`**, structured like `web/src/FileTreeTab.tsx` (`:34,108-144`): a header (`notifications-header`) carrying the dock-cycle and close buttons that render **only while docked** (`{dock && …}`, matching FileTreeTab), and a body of `<Transcript lines={bufferLines} … />`. This is the decision that resolves "where do the header controls live": both the center and docked renders go through this one component, so `ViewTabBody`/`Sidebar` each need only a one-line branch. Read-only — no `CommandArea`; `<Transcript>`'s prompt-click/collapse handlers are passed as no-ops (a notification feed has no tool steps or clickable prompts). Props mirror `FileTreeTab`: `{ lines, client, index, dock? }`.
- `ViewTabBody.tsx`: add a `view === 'notifications'` branch rendering `<NotificationsTab lines={tab.bufferLines} client={client} index={index} />` inside the standard `.tab-body` wrapper (same left-border-by-dotColor convention as the other branches).
- `Sidebar.tsx`: extend the docked-body render (`web/src/Sidebar.tsx:55-57`) with a `view === 'notifications'` branch rendering `<NotificationsTab lines={entry.tab.bufferLines} client={client} index={entry.index} dock={entry.tab.dock} />`; keep `view === 'files'` → `<FileTreeTab>`. The label strip already shows `entry.tab.title ?? entry.tab.label` and a close button generically, so it needs no per-view change.
- Dock RPC: rename `fileTreeSetDock` → `setDock` (`src/protocol.ts:129`, handled in `src/message-handler.ts:62` calling `controller.fileTreeSetDock` → `TabManager.setDock(index, dock)`, which has nothing files-specific) and have both the file tree header and `NotificationsTab` use it. Lift `nextDock`/`dockTooltip` (module-local in `web/src/FileTreeTab.tsx:24,29`) into a shared helper module (e.g. `web/src/dock-cycle.ts`) imported by both tab components. Note `nextDock` toggles **left↔right only, never center** — center placement is reached via the bare `notifications` command, not the button (identical to file tree behavior). Renaming the RPC also touches `web/src/FileTreeTab.tsx:120` and its test expectations (`web/src/FileTreeTab.test.tsx:168,176`); if the rename feels too broad for one change, the fallback is a parallel `notificationsSetDock` RPC — but the rename is preferred since the handler is already generic.

### 5. Commands — `notifications` and `notify`

- New `src/commands/notifications.ts` (mirrors `src/commands/files.ts`): `match: /^notifications\b/i`. Parse an optional leading keyword:
  - `notifications` → open/focus the tab (undocking it to center and making it active if it was docked — focusing must make it visible, mirroring bare `files`).
  - `notifications left` / `notifications right` → open-and-dock (or move an existing tab) into that sidebar, via `openNotificationsTab(managers, 'left'|'right')`.
  - The command records a transcript entry in the issuing tab (`append(tab.label, { input: command, output: '' })`) before opening, matching `files`.
- New `src/commands/notify.ts`: `match: /^notify\b/i` (distinct from `notifications` — `notify\b` does not match `notifications`, since `y`→`c` is not a word boundary). `run: (command, tab, managers)` takes the rest of the line as the message text and calls `notify(managers, 'manual', tab.label)` with that text (extend `notify()` to accept an explicit message for the `manual` event). It records a confirmation entry in the issuing agent tab (`append(tab.label, { input: command, output: '' })`) like other commands, and — per Decision 7 — appends the attributed line to the notifications feed only if the tab is open. An empty `notify` (no message) appends an error line to the issuing tab and does nothing else.
- **Registration is in `src/commands/index.ts`** (the `Command[]` registry), *not* `src/commands.ts`: add `import { command as notifications } from './notifications.js';` and `import { command as notify } from './notify.js';`, then append both to the exported `commands` array. Dispatch matches by `match` regex against this registry **before** `getOutput`/`availableCommands` are ever consulted (`src/resolve.ts:28-34` iterates `commands` first), so no `getOutput` branch is needed and the two regexes don't shadow each other regardless of array order. No dedicated tab-completion is required — `notify` takes free text and `notifications` takes a `left`/`right` keyword; completing those keywords is out of scope for v1 (unlike `files`, which piggybacks on generic filesystem path completion). `notify` is available from any tab, including agent tabs (agents dispatch it exactly like any other command).

### 6. Protocol

- `Tab.view` / `TabView.view`: add `'notifications'` (§2).
- Dock RPC: rename `fileTreeSetDock` → `setDock` and share it across both tab kinds (§4 has the file list and the fallback). No other protocol change — **no new push message type and no new `Sinks` field**; the feed rides `bufferLines` in the existing `state` broadcast.

### 7. Specs

- New `specs/notifications.md`: the notifications tab (singleton, explicitly-opened, view-only, no command bar, own transcript), the five event types (four ambient + `manual`), config model, focus suppression, drop-if-closed, and the `notifications [left|right]` and `notify <message>` commands.
- `specs/sidebars.md`: update "Today only the file navigator … can dock" — now the notifications tab docks too; describe the two dockable kinds sharing the one-per-sidebar rule.
- `specs/file-tree-tab.md`: cross-reference that the dock/location-cycle mechanism is now shared with the notifications tab.
- `specs/tabs.md` / `specs/application-state.md`: add the `notifications` view kind alongside the existing view tabs.
- `specs/application-config.md`: add the `notifications` config block.
- `specs/application-commands.md`: add the `notifications` and `notify` commands.

### 8. In-app help

- `help.md` (repo root) is the **real** help source — `buildHelp()` in `src/commands.ts:28-36` reads it and `help` renders it. Add a `notifications` row and a `notify` row to its **Commands** table. This is the primary help change.
- `src/commands.ts`: add `'notifications'` and `'notify'` to the `availableCommands` array. This array is *not* used for dispatch (that's the registry in §5) — it only feeds the fallback help string used when `help.md` is unreadable (`src/commands.ts:34`). No `getOutput` branch is needed. `src/commands/commands.test.ts` asserts only that help contains `Commands`, `connection`, and key bindings (`:5-10`), so adding rows won't break it — no test change required unless a new assertion is desired.

### 9. Public documentation

- New `public-documentation/tab-types/notifications.md` — a user-facing page mirroring the existing `public-documentation/tab-types/file-navigator.md`: what the notifications tab is, that it is opened only via `notifications` and can be docked into a sidebar, the events it reports, and the `notify` command. Add it to the VitePress sidebar/nav config (`public-documentation/.vitepress/config.*`) in the **Tab types** group.
- `public-documentation/command-bar/commands.md`: add the `notifications` and `notify` commands to the command reference.
- `public-documentation/tab-types/file-navigator.md`: add a cross-link noting the sidebar is now shared with the notifications tab.
- Follow the doc conventions in `ai/guidelines/user-documentation.md` and `ai/guidelines/documentation.md`.

### 10. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/notifications.test.ts`: `shouldNotify` — for the ambient events: fires for a background tab, suppressed for the active tab, suppressed when the event toggle is off, suppressed for the notifications tab's own label; for the `manual` event: fires regardless of focus and regardless of the per-event toggles.
- `src/commands/notify.test.ts`: `notify <message>` appends an attributed line when the tab is open, is a no-op (drops, creates nothing) when the tab is closed, fires even when the issuing tab is active, and appends an error line for an empty message.
- `src/notifications-tab.test.ts`: `openNotificationsTab` creates exactly one tab and reuses it on a second call; `appendNotification` appends when the tab is open and is a **no-op (creates nothing) when the tab is closed**; docking via the `dock` argument places it in the requested sidebar.
- `src/config.test.ts` (existing): default `notifications` config + round-trip serialization.
- Hook-point integration: `Controller`'s `entry:appended` subscriber appends a notification when `entry.from` is set and the source tab isn't active (`src/controller.test.ts`); `AcpManager.run` fires `agent-start`/`state-change` at the right points (`src/acp-manager.test.ts`); `ScheduleManager.fire` fires `schedule-fire` (`src/schedule-manager.test.ts`).
- `web/src/NotificationsTab.test.tsx` (new): renders `bufferLines` as a transcript with no `CommandArea`; when `dock` is set, shows the dock-cycle and close buttons and the dock-cycle button sends `setDock` with `nextDock(dock)`; when undocked, shows neither button.
- `web/src/ViewTabBody.test.tsx`: a `notifications` tab renders its `bufferLines` as a transcript and shows no command bar.
- `web/src/Sidebar.test.tsx` (existing): a docked `notifications` tab renders its transcript body and a close button; docking displaces a file tree already in that sidebar.
- Dock RPC rename: update `web/src/FileTreeTab.test.tsx:168,176` expectations from `fileTreeSetDock` to `setDock` (part of step 3's self-contained refactor).

## Out of scope

- **Toasts, sounds, and OS-level notifications.** The tab is the only delivery surface. (The prior toast + Web Audio design is superseded; see below.) A `notifications.sound` toggle and click-to-activate-the-referenced-tab are deferred to v2.
- Per-event or per-sound command toggles beyond the config file (`notifications <event> on|off` deferred to v2). There is no mute command or global on/off switch; per-event opt-in via `.janissary/config.json` (and closing the tab) is the only suppression.
- Notification history beyond the tab's own transcript, or persisting the feed across relaunch (the tab is a live in-memory view, like the file tree tab).
- Changing `TabManager.markUnread` — the notifications tab gets the standard unread badge for free via `append`.

## Superseded design (prior draft)

The earlier draft delivered notifications as **transient toast banners** (a new `web/src/Toast.tsx` with auto-fade/stacking) plus an optional Web Audio sound, pushed over a **net-new `Sinks.showNotification` server→client channel** (`broadcast({ t: 'notification', … })`) and a `case 'notification':` in `web/src/ws.ts`. That is replaced by the notifications tab because the tab reuses the existing per-tab transcript broadcast (`bufferLines`) and the existing `append` funnel, needs no new push channel, and gives a durable, scrollable, reviewable feed instead of a banner that vanishes after five seconds. The event-source analysis (four event types, the four hook points, focus suppression, config model) carries over unchanged.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end: enable `notifications.events.incomingMessage` in `.janissary/config.json`. First, with **no** notifications tab open, `msg` between two background tabs — confirm nothing is recorded and no tab appears (events dropped while closed). Then run `notifications right` to open and dock the feed, and `msg` from one tab to another while a third tab is focused — confirm a line appears in the docked notifications feed and its unread badge lights. Focus the target tab and repeat — confirm no new line (focus suppression). From the focused tab run `notify hello` — confirm the line **does** appear (manual trigger bypasses focus suppression). Run `notifications` (bare) and confirm the tab undocks to center and becomes active. Finally, close the notifications tab and run `notify hi` — confirm nothing is recorded and the tab does not reopen (drop-if-closed).

## Implementation order

1. Config type: `NotificationConfig` + defaults, tests. No dependency on later steps.
2. Tab kind + singleton owner: `view: 'notifications'` in both view unions, `makeNotificationsTab`, `addNotificationsTab`, `src/notifications-tab.ts` (`openNotificationsTab`/`appendNotification`), tests. Depends on nothing but the view-union edit.
3. Dock RPC rename: `fileTreeSetDock` → `setDock` across `src/protocol.ts`, `src/message-handler.ts`, `src/controller.ts`, `web/src/FileTreeTab.tsx`, and its tests — a self-contained refactor that keeps typecheck/tests green on its own. Do this first so step 4 can consume `setDock`. (Skip only if taking the fallback parallel-RPC route.)
4. Web view: `isViewTab` += `'notifications'`, new `web/src/NotificationsTab.tsx` + shared `dock-cycle.ts` helper, `ViewTabBody` + `Sidebar` one-line branches, tests. Depends on steps 2–3.
5. Event detection: `src/notifications.ts` (`NotificationEventType`, `shouldNotify`/`notify`), tests. Depends on step 1 (config) and step 2 (`appendNotification`).
6. Hook points: wire `notify()` into `Controller`'s `entry:appended` subscriber (`src/controller.ts:57-60`), `AcpManager.run` (`:109,114,119`), `ScheduleManager.fire` (`:85-97`), tests. Depends on step 5.
7. `notifications` command: `src/commands/notifications.ts` + registration in `src/commands/index.ts`, tests. Depends on step 2 (open/dock).
8. `notify` command: `src/commands/notify.ts` + the `'manual'` event type and `notify(..., message)` extension + registration in `src/commands/index.ts`, tests. Depends on step 5 (`notify`) and step 2 (`appendNotification`).
9. In-app help: `help.md` rows + `availableCommands` in `src/commands.ts` for `notifications` and `notify`. Depends on steps 7–8.
10. Specs: new `notifications.md` + amendments to `sidebars.md`, `file-tree-tab.md`, `tabs.md`/`application-state.md`, `application-config.md`, `application-commands.md`.
11. Public documentation: new `tab-types/notifications.md` + VitePress nav, `command-bar/commands.md`, and the `file-navigator.md` cross-link.

Run `./scripts/run.mjs check-diff` after each step.
