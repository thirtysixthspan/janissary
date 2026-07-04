# SSH tab (`ssh` command)

**Complexity: 4/10** — reuse-heavy: the harness-tab machinery already provides the full-tab PTY view, exit-closes-tab, and close-kills-PTY lifecycle. New work is a small parser + manager, one dispatch intercept, and the connections-panel wiring (new `ssh` kind, un-suppressing the panel over ssh tabs, `connection close ssh:` support).

## Goal

`ssh <destination> [ssh args…]` opens a new **ssh tab** — a full-tab PTY terminal running the real `ssh` binary, exactly like `harness <name>` opens a harness tab.

```
ssh devbox                  → new tab "devbox", full-tab ssh session
ssh -p 2222 admin@10.0.0.5  → new tab "10.0.0.5", args passed to ssh verbatim
```

Requirements (from `docs/todo-features.md`):

1. The connection is listed in the connections window (as `ssh:<destination>`).
2. The ssh connection is closed when its tab is closed and when the application exits.
3. The `ssh` command opens the connection in a **new tab**, the way `harness` does.
4. When the ssh process exits (logout, `exit`, connection drop), its tab closes.

## What already exists (reuse, don't rebuild)

| Piece | Where | Notes |
|---|---|---|
| Full-tab PTY view tab (`view: 'harness'` + `HarnessView` payload) | `src/types.ts:56` (`export type HarnessView`), `src/tab.ts:54` (`makeHarnessTab`), `src/protocol.ts:7` (re-export) | Tab body is a live xterm terminal, no command bar/transcript |
| Harness launch flow: unique label, group placement, focus, PTY spawn | `src/harness-manager.ts` (`open`, `uniqueLabel`, `resolveCwd`) | The template `SshManager` mirrors |
| **PTY exit → tab closes** | `src/controller.ts:56-59` (`tab.harness?.ptyId === event.id` → `closeTab`) — any tab whose `harness.ptyId` matches the exited PTY is closed | Requirement 4 is free once the ssh tab carries a harness payload |
| **Tab close → PTY killed** | `TabManager.closeTab` → `closeTabResources` (`src/tab-cleanup.ts:16`, `managers.pty.closeTab(tab.label)`) | Requirement 2 (tab close) is free |
| **App exit → all PTYs killed** | `Controller.shutdown` (`src/controller.ts:177`, `this.managers.pty.closeAll()`) | Requirement 2 (app exit) is free |
| Web rendering: persistent harness layer, terminal focus on tab switch | `web/src/App.tsx:96-102, 134-144`, `web/src/HarnessTab.tsx`, `useXterm` | Renders any `view === 'harness'` tab — ssh tabs ride along with zero new components |
| Command intercept ahead of `resolveCommand` | `src/command-manager.ts:46-51` (the `harness` branch) | The `ssh` branch copies this shape |
| Connections panel plumbing | `src/connection-manager.ts` (`connectionsFor`), `src/protocol.ts:10` (`ConnectionView`), `web/src/StatusPanels.tsx`, `web/src/theme.css:126-130` (`.conn-*` colors) | Add an `ssh` kind |
| `connection close <kind>:<id>` | `src/connection-parsing.ts` (`KINDS`), `src/connection-close.ts`, `ConnectionManager.completionConnections` | Add an `ssh` case |
| PTY spawn runs an arbitrary command string via `shell -lc` | `src/pty.ts:36` | The raw typed `ssh …` line can be spawned verbatim — no argv assembly |

**Today's `ssh` behavior:** `ssh` is listed in `INTERACTIVE_PROGRAMS` (`src/interactive.ts:9`), so `shell ssh host` opens an **inline terminal card** in the current tab's transcript; a bare `ssh host` resolves as `unknown` and goes through the route chooser. This plan intercepts the bare form and gives it a dedicated tab; the explicit `shell ssh …` inline-card path stays unchanged as an escape hatch (and `ssh` stays in `INTERACTIVE_PROGRAMS` for pipelines).

---

## Design

### Reuse the harness tab shape (no new view kind)

An ssh tab **is** a harness-view tab: `view: 'harness'` with payload `{ name: 'ssh', program: 'ssh', ptyId, status }`. This is what makes requirements 2 and 4 free — the controller's PTY-exit handler, `closeTabResources`, the App.tsx harness layer, and focus handling all key off `view === 'harness'` / `tab.harness` and need no changes. The tab-strip × needs none either: it renders unconditionally for every tab (`web/src/TabItem.tsx:61`, `className="tab-close"`).

To carry the connection identity, `HarnessView` gains one optional field (in both `src/types.ts` and re-exported via `src/protocol.ts` — same type):

```ts
export type HarnessView = {
  name: string;
  program: string;
  ptyId: string;
  status: 'running' | 'exited';
  exitCode?: number;
  // Present only on ssh tabs: the destination as typed (e.g. 'admin@10.0.0.5').
  // Drives the connections-panel row `ssh:<destination>`.
  destination?: string;
};
```

An ssh tab is recognized by `harness.name === 'ssh'` (equivalently: `destination` present). A new `view: 'ssh'` kind was considered and rejected — it would duplicate the harness branch in App.tsx, the focus effect, the controller exit path, and the TabStrip gate for no behavioral difference.

### `src/ssh.ts` (new) — parser

`parseSshCommand(input): { command: string; destination: string; label: string } | { error: string }`

- `command` — the input verbatim (trimmed), **including the leading `ssh` token**, spawned as-is via `pty.spawn(shell, ['-lc', command])` (`src/pty.ts:36`), so every ssh flag, `user@host`, ports, jump hosts, and even a trailing remote command work without us modeling ssh's CLI.
- `destination` — the first token after `ssh` that is not an option: skip tokens starting with `-`; when a token is one of OpenSSH's value-taking flags (`-B -b -c -D -E -e -F -I -i -J -L -l -m -O -o -p -Q -R -S -W -w`), also skip the following token. Accept an `ssh://user@host[:port]` form by stripping the scheme.
- `label` — the host part of `destination`: strip a leading `user@` and a trailing `:port`. Per [[tab-label-no-markers]] the tab label is the host name only — no `ssh:` marker; connection status belongs in the connections panel.
- `ssh` with no destination → `{ error: 'Usage: ssh <destination> [ssh options].' }`.

Keep the token scan a plain loop with literal string checks — no complex regexes (`security/detect-unsafe-regex`).

**Non-goals:** no `as <label>` clause (anything after the destination is a *remote command* in ssh's own grammar — `ssh host as label` must keep meaning "run `as label` on host") and no `-w/--workspace` (`-w` is a real ssh flag, and a remote session has no use for a local clone).

### `src/ssh-manager.ts` (new) — mirrors `HarnessManager`

`SshManager.run(input): string | undefined` (error to surface in the creator's transcript, or undefined once the tab is open):

1. `parseSshCommand(input)`; return the error if any.
2. Unique label from `parsed.label` (same `uniqueLabel` walk as `HarnessManager.uniqueLabel` — `devbox`, `devbox-2`, …).
3. `makeHarnessTab(label, distinctColor(…), tabs.length + 1, creator group/groupColor, { name: 'ssh', program: 'ssh', ptyId: '', status: 'running', destination })` — no workspaceDir.
4. `insertTabInGroup`, focus the new tab, `pty.spawn(label, 'ssh', parsed.command, cwd)`, set `harness.ptyId`, emit `state: dirty` — step-for-step the tail of `HarnessManager.open` (`src/harness-manager.ts:35-46`). `cwd` is the creator tab's cwd, `cwdOf(creator.label) ?? process.cwd()`, exactly the non-workspace branch of `resolveCwd` (`src/harness-manager.ts:54`).

The `uniqueLabel` helper is currently private to `HarnessManager` (`src/harness-manager.ts:61`); extract it to `src/tab-utils.ts` (41 lines today, ample room; already re-exported through `src/tab.ts`) and use it from both managers rather than duplicating (`sonarjs/no-duplicate-string`/`jscpd`).

Register the manager: add `ssh: SshManager` to `Managers` (`src/managers.ts`) and construct it in the `Controller` constructor next to `harness` (`src/controller.ts:40`).

### Dispatch — `src/command-manager.ts`

In `run()`, add an intercept next to the harness one (`command-manager.ts:46-51`):

```ts
if (/^ssh\b/i.test(input)) {
  this.managers.tab.append(label, { input, output: '' });
  const error = this.managers.ssh.run(input);
  if (error) this.managers.tab.append(label, { input: '', output: error });
  return;
}
```

As with `harness`, the command is recorded in the **creator's** transcript before the spawn, so the launch stays visible even if ssh exits (and its tab closes) immediately — e.g. host unreachable, auth failure.

This intercept covers **every** dispatch path: `dispatch` (typed input), `dispatchTo` (`send` to an agent tab, monitor suggestions), and route-chooser picks all funnel through `run()`; `resolveCommand` has no other caller (`src/command-manager.ts:52` is the only call site outside tests). `src/recognizers/bash.ts:9` lists `ssh` as a shell indicator for unknown-command routing — leave it; inputs starting with `ssh` no longer reach the recognizers, and the entry stays harmless for other inputs.

Add `'ssh'` to `availableCommands` (`src/commands.ts:6`) — note this only feeds the fallback help string (`commands.ts:35`); the real `help` output is parsed from the README's `### Commands` section (`README.md:18`), which the Docs step updates.

### Connections window

- `ConnectionView.kind` (`src/protocol.ts:10`): add `'ssh'`.
- `ConnectionManager.connectionsFor(label)` (`src/connection-manager.ts:10`): look the tab up by label (`managers.tab.tabs.find`); when `tab.harness?.destination` is set, push `{ text: `ssh:${destination}`, kind: 'ssh' }` and **skip the `pty.terminalsFor` loop** (`connection-manager.ts:20`) for that tab — its only PTY is the ssh process itself, and a duplicate `terminal:ssh` row would be noise. Non-ssh tabs keep their `terminal:` rows exactly as today (the existing harness-tab test at `src/controller.test.ts:799` guards this).
- **Show the panel over ssh tabs.** The App.tsx harness layer currently suppresses connections over harness tabs (`<StatusPanels tab={t} scheduleOnly />`, `App.tsx:142`) because a harness tab's terminal *is* the connection. For ssh tabs the listing is the point (requirement 1), so pass `scheduleOnly={t.harness!.name !== 'ssh'}` — the floating panel over the ssh terminal shows `ssh:admin@10.0.0.5`.
- `connection list` (`ConnectionManager.run`, list branch at `connection-manager.ts:29`): append a global `ssh:<destination>` row for every open ssh tab (precedent: the sqlite rows there are already global via `database.listOpen()`). Connections are otherwise per-tab, but ssh tabs have no command bar, so listing/closing them must be possible from other tabs.
- `connection close ssh:<id>`: add `'ssh'` to `ConnectionKind` (`src/types.ts:315`) and `KINDS` (`src/connection-parsing.ts:3`); add a `case 'ssh'` to `closeConnection` (`src/connection-close.ts:12`) that resolves the id and calls `managers.pty.kill(harness.ptyId)` — the existing exit path then closes the tab. **Id resolution:** match the ssh tab whose (unique) **label** equals the id first; failing that, the first tab in tab order whose **destination** equals it (two `ssh devbox` tabs share destination `devbox` but have labels `devbox` / `devbox-2`). No match → `No open connection ssh:<id>.` matching the other kinds' message shape.
- Completion: add `ssh:<label>` rows (labels, being unique, are unambiguous close targets) to `completionConnections` (`connection-manager.ts:48`) so `connection close ss<Tab>` completes.
- `web/src/theme.css`: add a `.panel-row.conn-ssh` color next to the other `.conn-*` rows (`theme.css:126-130`); use `var(--accent)` like `conn-terminal`.

### Lifecycle summary (how each requirement is met)

| Requirement | Mechanism | New code? |
|---|---|---|
| Listed in connections window | `connectionsFor` ssh row + panel un-suppressed over ssh tabs | yes |
| Closed on tab close | `closeTabResources` → `pty.closeTab(label)` kills the ssh PTY | no |
| Closed on app exit | `Controller.shutdown` → `pty.closeAll()` | no |
| New tab, like `harness` | `SshManager` mirroring `HarnessManager` | yes |
| ssh exit closes the tab | `controller.ts:56-59` closes the tab whose `harness.ptyId` exited | no |

### Free rides worth keeping (and specifying)

- `send <ssh-tab> <text>` and `schedule … in <ssh-tab> …` already deliver keystrokes to harness-view PTYs — `deliverTo` (`src/commands/send.ts:16`, branch `if (target.view === 'harness')` writes `${text}\r` to the PTY) and the scheduler's `fire` (`src/schedule-manager.ts:86`, same `view === 'harness'` check) — so agents can type into a remote session. `send` addresses tabs by label **or** display title (`send.ts:38`), so a renamed ssh tab stays reachable. No code change; mention in the spec.
- Like harness tabs, ssh tabs are live and in-memory: not persisted, not restored on `--relaunch` (the scheduler already skips persisting schedules for harness-view tabs, `schedule-manager.ts:64`).

---

## Tests

- `src/ssh.test.ts` (new; mirror `src/harness.test.ts` style):
  - `ssh` alone → usage error.
  - `ssh devbox` → destination/label `devbox`, command verbatim.
  - `ssh admin@10.0.0.5` → destination `admin@10.0.0.5`, label `10.0.0.5`.
  - `ssh -p 2222 -i ~/.ssh/id admin@host` → value-flag skipping finds `admin@host`.
  - `ssh -v host` → boolean flag skipped, destination `host`.
  - `ssh ssh://root@host:2222` → scheme stripped, label `host`.
- `src/controller.test.ts` — add a `describe('Controller ssh tab')` block modeled on `describe('Controller harness view')` (`controller.test.ts:717`); `spawnPty` is already module-mocked there ("Mock spawnPty so harness tests never spawn real processes", `controller.test.ts:20`):
  - `ssh devbox` → new tab `view: 'harness'`, label `devbox`, `harness.name === 'ssh'`, `destination` set, `spawnPty` called with the verbatim `ssh devbox` command; tab focused.
  - `view()` for that tab contains `{ text: 'ssh:devbox', kind: 'ssh' }` and no `terminal:` row.
  - Second `ssh devbox` → label `devbox-2`.
  - PTY exit → tab closed.
  - `closeTab` on the ssh tab kills the PTY.
  - `connection close ssh:devbox` from another tab kills the PTY.
  - `ssh` with no destination → usage error in the transcript, no tab, `spawnPty` not called (mirror the unknown-harness test at `controller.test.ts:791`).
  - Regressions: `shell ssh host` still opens an inline terminal card; the harness connections-panel test (`'harness tab appears in the connections panel as terminal:<name>'`, `controller.test.ts:799`) still passes.
- `src/connections.test.ts` / parsing tests: `connection close ssh:devbox` parses with kind `ssh`; the unknown-kind error message now includes `ssh`.
- `web/src/StatusPanels.test.tsx` (new; follow the `HarnessTab.test.tsx` conventions): a tab with an ssh connection row renders the panel with a `conn-ssh` class row; with `scheduleOnly` the connections list is dropped.

## Docs and spec

- README `### Commands` (`README.md:18` — the section `buildHelp` parses into `help`, `src/commands.ts:24-37`): add an `ssh` row — *"Open an SSH session to a remote host in a full-tab terminal"*.
- `spec/ssh-tab.md` (new, parallel to `spec/harness.md`): command grammar and errors; label derivation ([[tab-label-no-markers]]); tab is a harness-style view tab (input model, focus, tab strip per `spec/harness.md`); lifecycle (exit/×/app-quit all end the session); connections panel row and `connection close ssh:<id>`; `send`/`schedule` delivery; not persisted across `--relaunch`.
- `spec/connection.md` — the `ssh` kind touches five places: the "four kinds" intro sentence (→ five), the Kinds table (id: tab label or destination; scope: global — the tab is its own scope), `### connection list` (global ssh rows), `### connection close <kind>:<id>` (kill semantics + id resolution), Validation (known-kind list), and the Connection window section (the panel shown over ssh tabs).
- On completion, drop the feature block from `docs/todo-features.md` (lines 37-41, "## support sshing to other computers in an agent tab").

## Verification

- `./scripts/run.mjs check-diff` after each step; all server + web tests green.
- Manual end-to-end: run the app, type `ssh localhost` (or any reachable host) → a new tab labeled with the host opens, focused, with the live session and a floating connections panel showing `ssh:localhost`; type `exit` in the session → the tab closes. Open another session, close it with the tab's × → verify the ssh process is gone (`ps`). Open a third, and from a different tab run `connection list` (shows the ssh row) and `connection close ssh:<label>` → the ssh tab closes. Finally, `shell ssh localhost` still opens an inline terminal card in the current tab (regression).

## Out of scope

- `as <label>` and `-w/--workspace` clauses (see parser non-goals: both collide with ssh's own grammar).
- Reconnect/persistence across `--relaunch` — sessions die with the app, like harness tabs.
- Parsing `~/.ssh/config` aliases, known-hosts handling, or any auth UX — the real ssh binary owns all of that in its PTY.
- Echoing ssh's exit code back to the creator's transcript (noted in Gotchas as a possible refinement).
- `scp`/`sftp`/`mosh` — `ssh` only.

## Gotchas

- **Destination parsing is best-effort, execution is not.** The spawned command is the verbatim input, so a mis-detected destination only mislabels the tab/connection row — it can never break the actual ssh invocation. Keep the parser simple on that basis.
- **Instant exit.** Bad host/auth makes ssh exit within a second; because tab creation appends the command to the creator's transcript first, the user still sees what happened, but ssh's own error output dies with the tab (same trade-off `spec/harness.md` documents for missing binaries). Acceptable for the draft; a future refinement could echo the exit code back to the creator's transcript.
- **`connection close ssh:` id ambiguity.** Panel text shows the destination (`ssh:admin@host`), tab label is the host, and destinations can repeat across tabs. Resolution order is decided above (label first, then first destination match); completion offers the unique labels.
- **`sonarjs`/file-size:** `connection-manager.ts` (57 lines) and `command-manager.ts` (77 lines) have room under the 200-line limit; the new `controller.ts` manager construction is one line. New logic goes in the two new `src/ssh*.ts` modules, with `.js` extensions on all relative imports (NodeNext).

## Checklist

- [ ] `src/types.ts` / `src/protocol.ts` — `HarnessView.destination?`, `ConnectionView` + `ConnectionKind` gain `'ssh'`
- [ ] `src/ssh.ts` — `parseSshCommand` (+ `src/ssh.test.ts`)
- [ ] `src/ssh-manager.ts` — `SshManager`; shared `uniqueLabel` extracted; registered in `managers.ts` + `controller.ts`
- [ ] `src/command-manager.ts` — `ssh` intercept; `src/commands.ts` — `availableCommands`
- [ ] `src/connection-manager.ts` — ssh row in `connectionsFor` / `list` / `completionConnections`; `connection-parsing.ts` + `connection-close.ts` — close support
- [ ] `web/src/App.tsx` — `scheduleOnly` off for ssh tabs; `web/src/theme.css` — `.conn-ssh`
- [ ] Tests (server + web); `./scripts/run.mjs check-diff` green
- [ ] README row; `spec/ssh-tab.md`; `spec/connection.md`; remove the todo block
