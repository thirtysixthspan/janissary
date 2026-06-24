# Janissary: Ink → Web App migration

Status: **foundation landed and runnable.** Janissary now runs as a local-only React web app
backed by a Node server; the legacy Ink TUI still exists at `src/cli.tsx` (`npm run start:ink`)
during the transition (strangler-fig).

## Run it

```bash
npm run build          # tsc (server) + vite (web)
npx janus              # boots the server on 127.0.0.1:<random>, opens a frameless Chromium app window at the token URL
# flags: --no-open  (print URL only)   --port=<n>   --relaunch (restore tabs from .janissary/state)
```

Dev loop: `npm run dev:web` (Vite dev server) + `npm run start:ink` is unrelated; for the server
use `tsx src/server/main.ts` after a `npm run build:web`.

## Architecture

```
Browser (React SPA, web/)                    Node server (src/server/)
  TabStrip / Transcript / CommandInput         http + ws (localhost only)
  inline xterm.js terminal cards   ◄── pty ──►   PtyManager (node-pty)
  JSON-RPC over one WebSocket       ──rpc──►     Controller  ──► reuses src/ domain layer:
                                                   shell, resolve, recognizers, db,
                                                   harness, agent-state, tab, config
```

- **One WebSocket, JSON messages.** Client → server: `{ t:'rpc', id, method, params }`. Server →
  client: `{ t:'state', tabs, activeTab }` snapshots, `{ t:'pty', id, data }` streams, and
  `{ t:'pty-exit', id, exitCode }`. See `src/server/protocol.ts` (mirrored in `web/src/protocol.ts`).
- **The server owns rendering data.** It runs `flattenBuffer` and ships `BufferLine[]` per tab, so
  the client never needs the transcript logic. Collapse (Ctrl+T) is a server-side per-tab toggle.

## Decisions baked in

| Decision | Choice |
|---|---|
| Backend | Node server reusing the existing TS domain layer (no Rust/Tauri) |
| Reach | **Local-only**: bound to `127.0.0.1`, per-session token + Host/Origin allowlist |
| Entry point | `npx janus` boots the server and opens a frameless Chrome app window (`--app`, no nav bar) at the token URL — using the user's installed system Chrome/Chromium, falling back to the default browser if none is found. Uses a dedicated `.janissary/chrome` profile (clean, independent instance) |
| Terminal model | **Hybrid** — DOM transcript for scraped/agent output, xterm.js for PTY programs |
| Terminal placement | **Inline terminal cards** in the transcript, with a maximize→full-window toggle |

### Security (local-only)

`src/server/security.ts`: requests must have a loopback `Host` and (when present) a loopback
`Origin`, and carry the session token on the WS upgrade. This is the DNS-rebinding / stray-tab
guard. Verified by `src/server/index.test.ts` (bad token rejected) and a 403 on a spoofed Host.

### Hybrid rendering / terminal cards

The structured transcript (`LogEntry` → `BufferLine`) renders as styled DOM, preserving the
metadata that recognizers/messaging/acp depend on. Interactive programs (`isInteractive`) and AI
harnesses (`harness <claude|opencode|codex>`) instead spawn a PTY that appears as an inline
`TerminalCard` (`web/src/TerminalCard.tsx`): an xterm.js pane with maximize, kill, and
freeze-on-exit. App-level chords (Shift+←/→ to switch tabs, Ctrl+T to collapse) bubble past the
terminal via `attachCustomKeyEventHandler` so tab switching works while a card is focused. This
replaces the Ink TTY-takeover + repaint hacks entirely.

## What's done

- Server: security, WS/RPC, PTY manager, controller reusing `shell` (scrape), `resolve`,
  `recognizers` (auto-route), `db`, `harness`, `agent-state` persistence, tab management.
- Commands working in the web UI: shell, interactive programs, `harness`, `agent`, `next`,
  `close`, `clear`, `db`, `help`, `msg`, `broadcast`, `acp`, `schedule` (with a server-side 1s
  tick), `profile`, `connection`, `state`, and unprefixed auto-recognition.
- Cross-agent messaging (`MessageBus`, a non-hook port of `useMessaging`): info/response shown in
  the recipient's transcript, command run in its shell, request run-and-replied.
- `acp` autonomous tool loop: reuses `connectAcp` + `runAcpToolLoop`, streaming the agent's reply
  into the transcript and auto-running both its `db` and `browser` tool steps (primer =
  `DB_PRIMER` + `BROWSER_PRIMER`). The connection shows as `acp:opencode` in the connections panel.
- `browser`: per-tab Playwright, ported from the `cli.tsx` glue into `src/server/browser-tab.ts`
  (`BrowserManager`). Supports `open [--headed]` / `list` / `use` / `goto` / `eval` / `content` /
  `shot` / `close` / `window close`, auto-launching a headless browser + window for page actions.
  Async actions show a running entry that fills on resolve. Open windows appear in the connections
  panel (`browser:<id> (<mode>)`) and `connection close browser:<id>` closes one.
- `agent --workspace`: creates a `git clone --shared` workspace (reuses `src/workspace.ts`) and
  removes it on tab close / shutdown; normal launch clears the workspace dir, `--relaunch` preserves
  it. The tab's shell starts in that workspace — `getShell` `cd`s a freshly spawned shell into the
  tab's cwd (and sets `JANUS_AGENT_NAME`), which also restores the saved cwd for `--relaunch`'d tabs.
- Append-only log (`spec/append-only-log.md`): `main.ts` calls `initLogDir`, and the controller's
  `log()` helper writes every committed transcript content event — command inputs, shell output,
  messages, ACP turns, browser/connection results — as `{timestamp,agent,text}` JSON lines to
  `.janissary/log/<YYYY-MM-DD>.json` (reusing `src/logger.ts`; capture-only shell runs aren't logged).
- App lifecycle: `quit` / `exit` close the app window and stop the server — the controller's `exit`
  sink broadcasts a `bye` event (the web client calls `window.close()`) then closes the server, and
  the launcher kills the spawned Chrome process group on process exit. `close` is tabs-only; closing
  the last tab resets to a fresh `janus` tab (just like launch).
- Tab naming & grouping: bare `agent` draws a random unused name from the `agent-names.json` pool
  (`resolveAgentName`), with name-exhaustion and duplicate handling; a created agent joins its
  creator's group (number + fixed bar color) via `insertTabInGroup` and does not steal focus, and
  a launched profile forms its own group — matching the Ink behavior. Group color renders as the
  tab's top border.
- Persistence: `--relaunch` rehydrates tabs (label/color/history/log/cwd/schedule/group) from
  `.janissary/state` via `controller.rehydrate()`.
- Frontend: tab strip, DOM transcript (collapse + messages, empty-state placeholder, yellow
  `Running...` indicator, stick-to-bottom auto-scroll), command input with history, inline
  xterm.js terminal cards (maximize / freeze-on-exit), floating connection + schedule status
  panels (ports of `ConnectionWindow`/`ScheduleWindow`, top-right, active tab), theme as CSS vars.
- Navigation (per spec): Shift+←/→ switch tabs, Ctrl+←/→ reorder within group, Ctrl+T collapse,
  ↑/↓ command history, mouse wheel + Ctrl+↑/↓ (Ctrl+P/N) line scroll, PageUp/Down half-screen,
  Escape jumps to the bottom. The transcript scroll container is owned by `App` so the keyboard
  handlers can drive it; the `running` flag rides on `BufferLine` from the shared `flattenBuffer`.
- Command history (`spec/history.md`): per-tab `cmdHistory` (dedup + 100-cap + persistence) is
  recorded by the controller and sent in `TabView`; ↑/↓ recall entries with the cursor at the end;
  `Ctrl+R` (or the `hist` command, intercepted client-side) opens a modal **history picker** of the
  tab's most-frequent entries (`getFrequentHistory`) — ↑/↓ move, Return/click runs, Escape closes,
  suppressed when empty.
- Tab completion: since `completeCommandLine` does filesystem I/O it runs server-side via a
  request/response RPC (`complete` → `{ newInput, newCursor, matches }`); the client added a
  `JanusClient.request()` (a pending-reply map keyed by rpc id). Tab fills the input (single match)
  or the common prefix and lists the candidates above the prompt (multiple). Completes paths,
  `msg`/`broadcast` agent names, `connection close` targets, and `browser` subcommands / window ids.
- Launcher `npx janus`, `npm run build`/`build:web`. Tests: server 32; suite total 400 green.

## Remaining parity work (honest list)

Every command is ported (the `UNPORTED` set is gone) and the major UI surfaces are in. What's left:

- Route chooser UI for genuinely ambiguous unprefixed commands (server auto-routes the confident
  case and otherwise prints guidance instead of presenting a picker).
- Multi-client cursor sync (cosmetic; the state model already supports multiple clients).

## File map

- `src/server/protocol.ts` — wire types (mirrored in `web/src/protocol.ts`).
- `src/server/security.ts` — token + Host/Origin guard.
- `src/server/pty.ts` — node-pty session manager.
- `src/server/controller.ts` — server-side tab/agent state + command dispatch (reuses `src/`).
- `src/server/index.ts` — http static + WS server.
- `src/server/main.ts` — boot, dirs, open browser (`npx janus` entry).
- `web/` — Vite React app (`App`, `TabStrip`, `Transcript`, `TerminalCard`, `CommandInput`, `ws`).
