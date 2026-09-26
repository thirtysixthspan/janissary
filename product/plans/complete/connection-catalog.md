# Build a tab's connections once, as one catalog every connection surface reads

**Complexity: 6/10** — one new pure module in `src/connection/`, three existing enumerations rewritten to derive from it, `closeConnection` gains a monitor and a terminal path and loses its unreachable fallback, the parser learns one kind, `PseudoterminalManager` gains one small method, and three test files have assertions deliberately changed. No wire or client change: the panel keeps consuming `ConnectionView` unchanged.

The connection layer enumerates a tab's connections in three places and resolves them a fourth way when closing, and the four have drifted:

- `ConnectionManager.connectionsFor` in `src/connection/manager.ts` (the panel) names the tab's ACP session `acp:<provider/model>`, lists monitor and editor-persona rows, and scopes SQLite to the databases this tab opened.
- `listLines` in `src/connection/list.ts` (`connection list`) hard-codes `acp:opencode`, never shows monitor or persona rows, names ssh by destination, lists `terminal:` rows, and lists every SQLite connection.
- `listCompletionConnections` in the same file (completion at `connection close`) hard-codes `acp:opencode`, offers ssh by tab label, and offers no terminals.
- `closeConnection` in `src/connection/close.ts` always answers `Closed connection acp:opencode.` for the tab's session, cannot close a monitor (an `acp:<monitor>` target falls through and closes the tab's own session instead), and `parseConnectionCommand` rejects `terminal`, so the `terminal:` rows `connection list` prints cannot be closed and the `default` branch of `closeConnection` is unreachable.

A user copying a name from `connection list` or the panel into `connection close` gets "No open connection" or closes something else, and each new kind has to be added in four places.

## Goal

One function returns a tab's connections as typed entries. The panel, `connection list`, and completion all derive from it, and every entry's `<kind>:<id>` is accepted by `connection close` and closes exactly that connection. A test walks the catalog and pins that round trip, so a kind added without a close path fails.

## Approach

New `src/connection/catalog.ts` exports:

```ts
type ConnectionEntry = { kind: ConnectionKind; id: string; display: string; scope: 'tab' | 'global'; detail?: string; acpRef?: AcpRef };
function connectionCatalog(managers: Managers, label: string): ConnectionEntry[];
```

`id` is what `connection close <kind>:<id>` accepts, `display` is the panel text, `scope` says whether the entry belongs to the issuing tab (`'tab'`, shown in its panel) or only to the app-wide list (`'global'`), and `detail` is an optional parenthetical the text list appends. Entries in order:

- `shell` — id is the shell basename, display `<shell>:<cwd>` (unchanged panel text). Tab.
- `acp` (tab session) — id is `managers.acp.label(label)`, the session's real `provider/model`; display `acp:<name>`; `acpRef` `{ scope: 'tab' }`. Included only once the name is known, which is what the panel already does. Tab.
- `acp` (monitors, editor personas) — taken from the monitor and editor-ACP managers' existing `ConnectionView` rows, id from the row's `acpRef` (monitor name or persona), display and `acpRef` unchanged. Tab.
- `browser` — id is the window id, display `browser:<id> (<mode>)`. Tab.
- `ssh` — for every tab that is an ssh harness with a destination, or a remote tab: id is the tab's label, display `ssh:<destination or address>`, detail the destination. Tab for the issuing tab, global for every other tab.
- `terminal` — this tab's live PTYs by program, skipped on an ssh harness tab (its only PTY is the ssh session). Tab.
- `sqlite` — the databases this tab opened (`openDbs`) as tab entries, then every other open database (`listOpen`) as global entries.

Derivations:

- `connectionsFor(label)` maps the tab-scoped entries to `{ text: display, kind, acpRef? }` — the same rows the panel shows today, same order, same shape.
- `listLines` prints every entry as `<kind>:<id>`, followed by ` (<detail>)` when present, so an ssh row reads `ssh:bastion (admin@host)`.
- `listCompletionConnections` returns every entry's `<kind>:<id>`.

Close changes in `src/connection/close.ts`:

- `acp`: try the editor persona `id`, then the tab's monitor named `id` (`managers.monitor.stop`), then the tab's own session. The tab-session messages use the session's real name, read before closing: `Closed connection acp:<name>.`, and `No open connection acp:<id>.` when nothing matched. The session fallback stays permissive about the id, as today, so a session still connecting (no name yet) can be closed.
- New `terminal` case: `managers.pty.killTerminal(label, id)` kills this tab's first live, non-transport PTY running that program; its exit flows through the normal PTY-exit path. `Closed connection terminal:<program>.` or `No open connection terminal:<program>.`.
- The `kind` parameter becomes `Exclude<ConnectionKind, 'browser'>` (browser stays async in `ConnectionManager.run`), and the unreachable `default` branch is deleted.

`ConnectionKind` in `src/connection/types.ts` and `KINDS` in `src/connection/parsing.ts` gain `terminal`.

Rejected alternative: drop `terminal:` rows from the text list instead of making them closable. That leaves the panel and the list disagreeing about what a tab holds, which is the drift this change exists to remove, and every other PTY-backed row (`ssh:`) is already closable by killing its PTY.

## Implementation steps

1. Add `terminal` to `ConnectionKind` and `KINDS`.
2. Add `killTerminal(label, program)` to `PseudoterminalManager` in `src/pseudoterminal-manager.ts`.
3. Add `src/connection/catalog.ts`.
4. Rewrite `listLines` and `listCompletionConnections` in `src/connection/list.ts` and `connectionsFor` in `src/connection/manager.ts` to derive from the catalog.
5. Update `closeConnection` in `src/connection/close.ts` (acp naming and monitor path, terminal case, typed kind, no default).
6. Update the tests.
7. Update specs, `help.md`, and user documentation.

## Tests

- New `src/connection/catalog.test.ts`: the entries for a tab with a shell, a named ACP session, a monitor, an editor persona, a browser window, a remote tab's transport and terminal, another tab's ssh, a tab-opened and a globally open database, with their scopes; an ssh harness tab has no terminal entry; an unnamed ACP session contributes no entry. And the round trip: for every catalog entry of a fully populated tab, `ConnectionManager.run('connection close <kind>:<id>')` parses and reaches the matching close (the right manager method called with the right argument, and a `Closed connection` reply, or the browser window close for `browser:`).
- `src/connection/list.test.ts`: the remote-tab list becomes `['ssh:claude (admin@devbox:/srv/proj)', 'terminal:claude']`; completion offers the ACP session's real name, the monitor and persona ids, and `terminal:` rows.
- `src/connection/close.test.ts`: the tab-session close reports its real name; no session reports `No open connection acp:<id>.`; an `acp:<monitor>` target stops the monitor and leaves the session alone; `terminal:` closes through `killTerminal` and reports a miss; the "not yet available in the web UI" case is removed.
- `src/connection/manager.test.ts`: the editor persona mock carries its `acpRef`; panel rows are unchanged; a new case pins that another tab's ssh connection and a database the tab never opened stay out of the panel.
- `src/pseudoterminal-manager.test.ts`: `killTerminal` kills the matching PTY, skips a transport and another tab's PTY, and returns false with nothing to kill.

## Spec and documentation

- `product/specs/connection.md`: the kinds table (acp id is the session's name, monitor names, new `terminal` kind), `connection list` (derived from the same set as the panel and completion, ssh by label with the destination in parentheses, monitors and personas included), `connection close` (acp naming, monitor, terminal), completion, and validation.
- `product/specs/ssh-tab.md`, `product/specs/remote-server.md`, `product/specs/tab-completion.md`, `product/specs/acp.md`: the `acp:opencode` and `ssh:<destination>` list wording.
- `help.md`, `documentation/user-documentation/command-bar/connections.md`, `documentation/user-documentation/command-bar/tab-completion.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`: the same.

## Out of scope

- A tab-close button on panel rows other than editor personas; the panel's shape and close control stay as they are.
- Requiring the `acp:` id to match the tab session's name before closing it.
- Routing the async browser close through `closeConnection`.
