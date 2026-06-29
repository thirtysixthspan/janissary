# Embedded AI harness (`harness` command)

## Goal

`harness <name>` (name ∈ `claude` | `opencode` | `codex`) opens a new **harness tab** whose entire body is the running harness — a PTY rendered with xterm.js, taking over the tab like an image/page view tab. **All** keys, clicks, and mouse go to the harness **except** the tab-switch chord (and clicks on the tab strip); tab switching still works. Document the feature in the README/help and add a harness spec.

```
harness claude     → new tab "claude" running the claude CLI, full-tab harness codex      → new tab "codex"
# Shift+←/→ switches tabs; the tab's × or `close` quits the harness
```

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Names → binaries + parser | `src/harness.ts` (`HARNESS_COMMANDS`, `HARNESS_NAMES`, `parseHarnessCommand`) |
| PTY spawn (write/resize/kill, onData/onExit) | `src/pty.ts` (`spawnPty`) |
| Controller PTY plumbing | `ptys` map, `openPty`, `onPtyExit`, `ptyInput/Resize/Kill`, `cols/rows`; `closeTab` kills a tab's ptys (`src/controller.ts:1015`) |
| Wire protocol | `pty`/`pty-exit` events + `ptyInput/ptyResize/ptyKill` RPCs (`src/protocol.ts`, `src/index.ts:151-155`) |
| xterm card (input fwd, resize, chord fall-through) | `web/src/TerminalCard.tsx` |
| View-tab pattern | `Tab.view` `'image'`/`'page'`, `makeImageTab`/`makePageTab`, App render branch, TabStrip title + × |

**Today's `harness` behavior:** `run()` (`src/controller.ts:309-314`) parses the name and calls `openPty(...)`, which appends an **inline terminal card to the current tab's transcript**. This plan changes `harness <name>` to open a **dedicated full-tab harness view**; the interactive-shell PTY path (vim/less via `isInteractive`, `controller.ts:320`) keeps using inline cards — unchanged.

---

## Data model

- `src/types.ts`: widen `Tab.view` to `'agent' | 'image' | 'page' | 'harness'`; add
  `Tab.harness?: HarnessView`; define:
  ```ts
  export type HarnessView = {
    name: string;     // 'claude' | 'opencode' | 'codex'
    program: string;  // launching binary
    ptyId: string;    // live PTY stream id (xterm attaches by this)
    status: 'running' | 'exited';
    exitCode?: number;
  };
  ```
- `src/protocol.ts`: add `HarnessView`, `TabView.harness`, widen `view`, re-export.
- `src/tab.ts`: `makeHarnessTab(label, dotColor, number, group, groupColor, harness)` →
  `{ ...makeTab(...), view: 'harness', title: harness.name, harness }`. Title is the name **only**,
  per [[tab-label-no-markers]].

## Controller

- **Repoint dispatch** (`src/controller.ts:312`): `harness <name>` →
  `this.openHarnessTab(parsed.name)` instead of the inline `openPty`.
- `openHarnessTab(name)` — mirror `openImageTab` (`controller.ts:592-602`):
  - `program = HARNESS_COMMANDS[name]`; `cwd` = creator tab's cwd.
  - create the tab with `makeHarnessTab` + `uniqueHarnessLabel(name)` + `distinctColor` + creator
    group/placement (`insertTabInGroup`); focus it; **in-memory, no `persist`**.
  - `spawnPty(name, program, cwd, { onData → sinks.sendPty, onExit → onPtyExit }, cols, rows)`;
    `ptys.set(id, { session, tabLabel })`; set `tab.harness.ptyId = id`, `status:'running'`;
    `emitState`.
- `uniqueHarnessLabel(name)` — `claude`, `claude-2`, … (mirror `uniqueImageLabel`,
  `controller.ts:604-612`).
- `onPtyExit` (`controller.ts:916`): **also** handle harness view tabs — find the tab whose
  `harness?.ptyId === id`, set `status:'exited'` + `exitCode`, `emitState`. Keep the existing inline
  terminal-card log update for the shell-PTY path.
- `closeTab` already kills the tab's ptys and emits — works for harness tabs (no served file to drop).
- `view()` mapping (`controller.ts:131`): add `harness: t.harness`.
- *(Optional cleanup)* the `harnessOf` map + `TabView.harness` tab-strip marker existed for the
  inline-harness case; the dedicated tab uses the view payload + title, so the marker can be dropped
  (honors [[tab-label-no-markers]]). The connections panel still lists the PTY (`terminal:<name>`,
  `controller.ts:186`).
- *(Optional consistency)* register `src/commands/harness.ts` (`name`/`match`) + a `case 'harness'`
  in `runApp`, moving the special-case out of `run()` so it classifies for tab-completion. Minimal
  path: keep the `run()` intercept and only swap `openPty` → `openHarnessTab`.

---

## Web client

### `web/src/HarnessTab.tsx` (new) — full-body terminal
Reuse `TerminalCard`'s xterm logic but as the **whole tab body** (no card head/maximize/kill chrome; optional slim "exited" banner). Factor the shared setup — create `Terminal` + `FitAddon`, `attachPty`, `onData → ptyInput`, `ResizeObserver → ptyResize` — into a `useXterm(ptyId, client)` hook used by **both** `TerminalCard` and `HarnessTab` (avoids `jscpd` duplication).

**Input routing — the key detail.** A real harness must receive `Ctrl+C`/`Ctrl+D`/`Ctrl+R`/`Ctrl+Z`, so the fall-through must be **narrow** — only the tab-switch chord bubbles to the window:

```ts
term.attachCustomKeyEventHandler((e) => {
  if (e.type !== 'keydown') return true;                 // normal: send to PTY
  const isTabSwitch = e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight');
  return !isTabSwitch;   // false → bubble to window (switch tabs); true → send to harness
});
```

> `TerminalCard` bubbles **all** Shift/Ctrl chords (`!(shift||ctrl)`) — that is too broad for a > harness and would hijack `Ctrl+C` etc. **Do not copy it here.** (Optionally also bubble > `Ctrl+←/→` for tab reorder, at the cost of the harness's own word-nav — default to switch-only.)

- **Focus** the terminal on mount/activation (a harness tab has no command line to focus), so
  keystrokes land in the harness.
- **Mouse:** xterm handles clicks and mouse reporting within the body; clicking the body focuses the
  terminal. Clicking a tab in the strip (outside the body) switches tabs.

### Preserving screen state across tab switches (decision)
If `HarnessTab` renders only while active (like the image/page early-return), switching away unmounts xterm and returning shows a blank screen until the harness redraws — full-screen TUIs use the alternate buffer and only repaint on input/`SIGWINCH`. No bytes are lost (the client buffers PTY data per id), only the static frame. Options:
- **Simple (recommended first):** remount on activation and **nudge a redraw** by sending a
  `ptyResize` (SIGWINCH) right after attach — claude/codex are Ink TUIs that repaint on resize.
- **Robust:** keep all harness terminals mounted in a layer and toggle visibility (`display:none`
  for inactive), so xterm state + the live stream persist across switches.

Start Simple; upgrade to the layer if the redraw nudge proves insufficient.

### `web/src/App.tsx`
- Add a `current.view === 'harness'` branch (mirror image/page, `App.tsx:159-169`): `TabStrip` +
  full-body `<HarnessTab harness={current.harness} client={client} />`, no command bar/transcript.
- Global key handler unchanged: **Shift+←/→** still switches tabs; `HarnessTab` lets exactly that
  chord bubble.

### `web/src/TabStrip.tsx`
- Widen the × gate (`TabStrip.tsx:23`) to include `view === 'harness'`. The name shows via
  `title ?? label` (no marker).

### `web/src/theme.css`
- `.harness-tab` fills the body (`flex:1; min-height:0`); reuse the xterm theme from
  `.terminal-card .body`.

---

## Docs (README + help)

- README "### Commands" (parsed into `help`, `src/commands.ts:26-39`): add a `harness` row —
  *"Open an AI coding harness (claude/opencode/codex) in a full-tab terminal"*.
- Add a **Harness tabs** usage subsection: open with `harness <name>`; the harness fills the tab and
  receives all input; **switch tabs with Shift+←/→ or by clicking a tab**; close with the tab's ×
  or `close` (quits the harness). Note that reorder/collapse chords aren't available while a harness
  tab is focused (switch away first), and the harness binary must be on `PATH`.
- Add `'harness'` to `availableCommands` (`src/commands.ts:9-22`).

## Harness spec — `spec/harness.md` (new)

Behavioral spec, parallel to [[image-tab]]:
- **Command:** `harness <name>`; valid names (`claude`/`opencode`/`codex`); usage + unknown-name
  errors; requires the binary on `PATH`.
- **Harness tab:** a non-agent **view tab**; created/focused/grouped like other view tabs; a live,
  in-memory PTY session — not persisted or restored on `--relaunch`.
- **Takeover:** no command bar or transcript; the body is the harness terminal.
- **Input model:** all keys, clicks, and mouse go to the harness **except** the tab-switch chord
  (**Shift+←/→**) and clicks on the tab strip; Ctrl-combinations (incl. `Ctrl+C`) reach the harness.
- **Tab strip:** name = the harness name (no marker, [[tab-label-no-markers]]); a × close button
  like other view tabs.
- **Lifecycle:** when the harness exits, the tab freezes showing `exited (code)`; closing the tab
  (× or `close`) quits the harness; closing the last tab opens a fresh default tab.
- **Connections panel** reflects the running harness PTY; **reordering/grouping** as for any tab.

## Tests

- `src/harness.test.ts` — `parseHarnessCommand` valid/invalid/unknown (extend if present).
- `src/controller.test.ts` (mock `spawnPty`): `harness claude` → harness view tab (`view:'harness'`,
  `title:'claude'`, `status:'running'`, `ptyId` set); a 2nd → unique label; PTY exit → `status:'exited'`;
  close kills the PTY; unknown name → error line; an interactive shell command still makes an inline
  card (regression).
- `web/src/test/` — `HarnessTab` mounts xterm and forwards input via `ptyInput`; its
  `customKeyEventHandler` returns `false` for `Shift+Arrow` and `true` for `Ctrl+C`; `TabStrip`
  shows the name + × for `view:'harness'`.
- `npm run check` green (use `check:diff` during dev).

## Gotchas
- **Narrow key fall-through** so `Ctrl+C` etc. reach the harness — the #1 deviation from `TerminalCard`.
- **Redraw on tab switch** for alternate-screen TUIs — resize-nudge or the persistent layer.
- **Binary on PATH:** a missing harness exits the PTY immediately; surface the exit cleanly in the tab.
- **Resize:** send `ptyResize` on mount and on container resize (FitAddon), as `TerminalCard` does.
- Keep the shared xterm logic factored (`jscpd`/`knip`).

## Checklist
- [ ] `src/types.ts` / `src/protocol.ts` / `src/tab.ts` — `HarnessView`, `view:'harness'`, `makeHarnessTab`
- [ ] `src/controller.ts` — `openHarnessTab`, `uniqueHarnessLabel`, repoint dispatch, `onPtyExit` handles harness tabs, `view()` map
- [ ] `web/src/HarnessTab.tsx` + shared `useXterm` hook, `App.tsx` branch, `TabStrip.tsx` ×, `theme.css`
- [ ] README `harness` row + **Harness tabs** section; `availableCommands`
- [ ] `spec/harness.md`
- [ ] Tests; `npm run check` green
