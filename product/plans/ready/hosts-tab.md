# Hosts Tab

**Complexity: 8/10** — ~1050 added lines, 21 files edited, 45 requirements, 55 test scenarios (p=8.69)

A **hosts tab** lists saved host configurations — a name, a remote user, a `hostname[:port]` destination, and an optional remote working directory — and opens an ssh tab to the chosen host with one click. The same names become a shorthand everywhere a host is typed today: `ssh <name>` connects with the saved details, and the `on <name>` clause of `shell`, `harness`, and `agent` accepts a saved name in place of a literal address. Today every remote connection is retyped as a raw destination, and anything beyond `[user@]host[:path]` (a port, for one) has to be pushed into `~/.ssh/config`; saved hosts give the user one place to name a machine once and reuse it.

## Design decisions

Each decision comes from the feature text ("feature text"), from existing behavior ("from precedent"), or from a user answer ("user decision").

- **Host configuration fields (feature text).** `name` (a label for the host), `user` (the user name on the remote host), `destination` (`hostname` with an optional `:port`), and `path` (optional; the working directory on the remote machine, `cd`ed into after login).
- **Unique names (feature text).** A host name must be unique across all configurations.
- **Storage (feature text).** Host configurations are stored in `~/.janissary/hosts.json`, overridden by the project's `.janissary/hosts.json`, "similar to how other configuration files are managed". The existing precedent for that pairing is whole-file replacement: a valid project `.janissary/commands.json` or `.janissary/roles.json` replaces the home file entirely (`product/specs/application-commands.md`, `product/specs/roles.md`).
- **Whole-file override (user decision).** Exactly like `commands.json` and `roles.json`: when a project `.janissary/hosts.json` is in effect it replaces `~/.janissary/hosts.json` entirely; the two are never merged. Name uniqueness is checked within the file in effect.
- **Save target (user decision).** A host created in the modal is written to the file in effect: the project file when one is in effect, otherwise the home file, which the first save creates. Writes are atomic and preserve every other entry.
- **File shape (user decision).** A JSON object keyed by host name, each value `{ "user"?, "destination", "path"? }`, matching `roles.json` and `commands.json`. Names are compared case-insensitively, so two keys differing only in case are a duplicate. `hosts list` prints the decoded hosts in this same shape.
- **Optional user (user decision).** Only `name` and `destination` are required. A blank `user` means ssh's own default (the local account, or a `User` line in `~/.ssh/config`), exactly as `ssh host` behaves today.
- **Name characters (user decision).** A host name is letters, digits, `.`, `-`, and `_` — the `on` address destination set minus `@` and `:`, so a name can never look like an address. `user`, the destination's host, and `path` are validated with the existing `on` address character sets in `src/remote/address.ts`; a port is digits only.
- **Malformed file (user decision).** Any problem with a hosts file — invalid JSON, a top level that is not an object, a malformed entry, or a case-insensitive duplicate name — makes that whole file unusable; no entry from it is used. Janissary never rewrites the file to repair it.
- **Malformed project file falls back (user decision).** A project `.janissary/hosts.json` that is unusable does not take effect: the home file is in effect instead (listed, resolvable, and the save target), and a notification reports the bad project file. When the home file is the one in effect and it is unusable, the list is empty, no saved name resolves, and saving is refused.
- **Malformed-file notification (user decision).** `Hosts file <path> is unusable: <problem>.` is posted once per distinct problem — the first read that finds a given file and problem text posts it, and later reads stay quiet until the problem changes, or is fixed and later reappears.
- **Edit and delete (user decision).** Hosts can be created, edited, and deleted from the tab. Editing opens the same modal prefilled; every field, including the name, is editable, and a renamed entry replaces the old key in one atomic write. A new name colliding (case-insensitively) with another host is refused. Delete asks `Delete host <name>?`; confirming removes the entry in one atomic write. Open ssh tabs and sessions are unaffected by an edit or delete.
- **Command grammar (user decision).** `hosts` opens the single hosts tab, or focuses it. `hosts list` prints the hosts in effect as 2-space-indented JSON, an object keyed by name, in the current transcript; it prints `{}` when there are none or the file in effect is unusable. `hosts add <name> <[user@]host[:port]> [path]` creates a host, or replaces an existing one of that name (case-insensitive). `hosts remove <name>` deletes one. Any other form is refused with `Usage: hosts [list|add|remove].`; malformed `add`/`remove` forms print `Usage: hosts add <name> <[user@]host[:port]> [path]` and `Usage: hosts remove <name>`.
- **Command wording (user decision).** `Host <name> added.`, `Host <name> updated.` (an `add` that replaced an entry), `Host <name> removed.`, and `No host named "<name>".`
- **Error wording (user decision).** Save refused because the file in effect is unusable (modal, delete, or `hosts add/remove`): `Cannot save hosts: <path> is unusable — fix it by hand.` Write failure: `Could not write hosts.json at <path>.` Duplicate name on create or rename in the modal: `Host "<name>" already exists.` Invalid field: `Invalid <field> "<value>". Use letters, digits, and . - _ only.` (the path's message also allows `/ ~`; a port is digits only).
- **ssh tab from a saved host (user decision).** An ssh tab opened through a saved host — a row click or `ssh <name>` — is labeled with the host name (disambiguated `-2`, `-3`, … as today). A typed `ssh <name>` records `ssh <name>` in the creator's transcript, as typed. A row click records nothing anywhere: the hosts tab has no transcript, and the new tab and its recording are the record. The connections panel keeps showing `ssh:<destination>`.
- **Sessions Host column (user decision).** Only a session launched through a saved host — `ssh <name>`, `on <name>`, or a host row — shows that host's name in the Host column; a session started from a typed address keeps the bare host. The name is the one used at launch, recorded with the session (including the parked-session record), and shown for the session's whole life even if the host entry is later renamed or deleted.
- **Empty state (user decision).** With no saved hosts, or with the file in effect unusable, the tab shows only `No saved hosts`, with no table headings, matching the sessions tab's `No remote sessions`. The plus button still works.
- **Refresh (user decision).** Writes Janissary makes — modal save, row delete, `hosts add`, `hosts remove` — update an open hosts tab immediately. Hand edits to either file appear on Refresh or when the tab regains focus, like the sessions tab. There is no file watcher.
- **Tab completion (user decision).** Saved host names are offered as completions after `ssh `, after `on ` in `shell`, `harness`, and `agent`, and after `hosts remove `.
- **`ssh <name>` lookup (user decision).** Only a bare `ssh <name>`, with nothing else typed, looks up a saved host; a matching name wins over a literal hostname or `~/.ssh/config` alias of the same spelling. Any form with flags or extra words (`ssh -p 22 devbox`, `ssh devbox uptime`) passes to ssh verbatim, as today.
- **Saved path in an ssh tab (user decision).** After login the remote shell changes into `path`. When the directory does not exist the remote shell prints its own error and the session continues in the login directory.
- **`on <name>` lookup (user decision).** A token exactly matching a saved name (case-insensitive) uses the saved host, even when it is also a reachable hostname. A token containing `@` or `:` never matches a name and is parsed as an address, as today.
- **`on <name>` semantics (user decision).** `on <name>` behaves exactly like `on [user@]host[:path]` built from the saved host: `path` is the remote project root, and a host with no path walks up from the ssh login directory.
- **Lookup against an unusable file (user decision).** When the file in effect is unusable, `ssh <name>` and `on <name>` behave exactly as today, treating the token as a literal hostname or alias, and the once-per-problem `Hosts file <path> is unusable: <problem>.` notification is posted.
- **Ports on remote launches (user decision).** A saved host's port is honored by `on <name>` for `shell`, `harness`, and `agent`: the remote launch passes it to ssh. A typed `on <address>` still accepts no port.
- **Opening (feature text).** The `hosts` command opens the hosts tab. The tab is not dockable.
- **A bundled tab plugin (user decision, replacing the feature text).** The feature text said "core, not a plugin"; the user chose to build it with the tab-plugin machinery as an ordinary bundled plugin, listed by `plugins` like sessions, because that is the lowest-cost route and every capability it needs already exists.
- **Plugin-owned hosts file module (user decision).** The read/decode/write module lives in the plugin and core imports it, the precedent `src/acp/ask-role.ts` set by importing `src/plugins/roles/roles-file.ts`. No new topic or capability.
- **Row launch (user decision).** Opening a host row runs `ssh <name>` through the existing `dispatchLineWithOutput` capability, so the core ssh command is the only place a saved host becomes an ssh spawn.
- **Address resolution (user decision).** `RemoteAddress` gains optional `port` and `hostName`; saved names are resolved in the execution layer, never in a parser.
- **Listing as JSON (feature text).** `hosts list` lists the host configurations as JSON.
- **Click to connect (feature text).** Opening a host row launches an ssh tab connecting to that host's destination.
- **`ssh <name>` (feature text).** `ssh <name>` looks up the named host configuration and connects with its details.
- **`on <name>` (feature text).** The `shell`, `agent`, and `harness` commands, which accept an `on <address>` clause for remote machines, also accept a host configuration name there.
- **Header (feature text).** The tab has a metadata bar like the sessions tab, with Refresh and Split icon buttons, plus a plus icon button that opens a create-new-host-configuration modal.
- **Table look and feel (feature text).** The hosts table is styled like, and has the same keyboard and mouse interactions as, the sessions tab table.
- **Sessions host column (feature text).** The sessions tab's Host column shows the host configuration name when a configuration matches the row, instead of the ssh destination.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| Home file with whole-file project override, owned by a plugin and read by core | `src/plugins/roles/roles-file.ts` (`readRolesFile`, `writeRolesFile`), imported by `src/acp/ask-role.ts`; `readJsonConfigFile` / `writeJsonConfigFile` in `src/plugins/files.ts` | The exact shape `hosts-file.ts` copies, except that an unusable project file falls back to home |
| Plugin dispatching a core command line | `dispatchLineWithOutput` capability; used by `src/plugins/diff/`, `src/plugins/launcher/`, `src/plugins/shell/` | Row open runs `ssh <name>` |
| Completion from a name catalog | `completeMonitorCommand` in `src/completion/handlers.ts`, `completeWord` in `src/completion/helpers.ts` | Model for `completeSavedHost` |
| Remote ssh spawn | `remoteServeCommand` / capture command in `src/remote/entry-factory.ts` | Where `-p <port>` is added |
| `on <address>` clause parsing | `parseRemoteAddress` in `src/remote/address.ts`; callers `src/harness/command-parse.ts`, `src/agent/remote-target.ts`, `src/plugins/launch-tab-remote.ts` | Accepts `[user@]host[:path]`; the part after `:` is a path, never a port; conservative character set |
| `ssh` command and tab | `src/ssh.ts`, `src/ssh-manager.ts`, `product/specs/ssh-tab.md` | Passes everything after `ssh` to the real binary; derives destination and label |
| Sessions tab list, keys, styling | `src/plugins/sessions/`, `src/sessions/rows.ts`, `web/src/plugins/sessions/` (`SessionList.tsx`, `sessions-keys.ts`, `sessions.css`) | Plugin tab; row `host` comes from `src/sessions/rows.ts` |
| Metadata bar with Refresh/Split | `web/src/plugins/PluginActionsHeader.tsx`, `SessionsDockedHeader` | Host-rendered header controls for plugin tabs |
| Modal dialog precedent | `web/src/plugins/scripts/DeleteScriptDialog.tsx`, `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx`, `web/src/plugins/sql/InsertForm.tsx` | Form-in-dialog patterns |
| Plugin list tab with metadata bar | `src/plugins/sessions/manifest.ts`, `web/src/plugins/sessions/SessionList.tsx` | Manifest shape and list component the hosts plugin mirrors |

## Proposed changes

### Hosts file module — `src/plugins/hosts/hosts-file.ts`

Owned by the plugin and imported by core where core needs saved hosts, exactly as `src/plugins/roles/roles-file.ts` is imported by `src/acp/ask-role.ts` (user decision). It holds:

- A `SavedHost` type `{ name, user?, host, port?, path? }` and a pure decoder from parsed JSON to either a name-sorted list of saved hosts or a one-line problem. It rejects a non-object top level, a non-object entry, a missing or empty destination, a name or field outside its character set, a port that is not an integer from 1 to 65535, and case-insensitive duplicate names. Use `isRecord` from `../api.js` for the object checks, as `roles-file.ts` does.
- The character sets: the plugin boundary lint (`eslint.plugin-boundaries.mjs`, first block) forbids a server plugin from importing `src/remote/address.ts`, so this module declares its own patterns — name `[\w.-]`, user and host the `DESTINATION_PATTERN` set without `@`, path the `PATH_PATTERN` set — each a single character class under one quantifier (`security/detect-unsafe-regex`). Parity with `src/remote/address.ts` is pinned by a test in `src/plugins/hosts/hosts-file.test.ts` that runs a shared corpus of accepted and rejected strings through both (tests are exempt from the boundary rule), so a saved host can never resolve to an address `parseRemoteAddress` would reject.
- A pure validator for one host's fields (name, user, destination, path), returning the exact error strings in Design decisions, shared by the modal save intent and `hosts add`. The file decoder runs each entry through this same validator, so there is one set of field rules.
- `readHostsFile(root, home)`: resolves the file in effect — the project file when it exists and decodes, otherwise the home file — and returns the hosts, the path in effect (the home path when neither file exists), whether that file is usable, and the problems found (including an unusable project file that was skipped). Built on `readJsonConfigFile` (`src/plugins/files.ts`), the way `readRolesFile` in `src/plugins/roles/roles-file.ts` is. A missing file is not a problem: it reads as zero hosts and is usable.
- `serializeHosts(hosts)`: `JSON.stringify` of the object keyed by name, sorted by name, 2-space indented. It is the one serializer: `hosts list` prints its output (which is `{}` for no hosts), and `writeHostsFile(path, hosts)` writes it plus a trailing newline through `writeJsonConfigFile` (`src/plugins/files.ts`, which wraps `atomicWriteFile`), creating the parent directory first as `roles-file.ts` does. Every write path (modal save, row delete, `hosts add`, `hosts remove`) re-reads the file immediately before writing, so a hand edit made since the tab last read it is not discarded, and refuses when that fresh read is unusable.
- A module-level `Set` of `<path>\n<problem>` strings already reported, so each distinct problem is reported once; a read that finds a file usable deletes that path's entries. It lives for the process, which is the intended ceiling: a restart reports a still-broken file again.

### Hosts plugin — `src/plugins/hosts/` and `web/src/plugins/hosts/`

An ordinary bundled tab plugin (user decision, replacing the feature text's "core, not a plugin"), shaped like the sessions and roles plugins and listed by `plugins` like them:

- `manifest.ts` follows `src/plugins/sessions/manifest.ts`: id and command `hosts`, `tabLabelPrefix: 'hosts'`, no file extensions, no `notifications`, and capabilities `note`, `notifyUser`, `openOrFocusTab`, `updateTab`, `dispatchLineWithOutput`, `rejectRequest`, and `reportFailure`. It does not request `dockTab` and its command reads no `left|right` argument, which is what keeps it out of the sidebars — docking a plugin tab is only ever reached through that capability.
- `shared.ts` (import-free) defines the payload — sorted rows `{ name, user, destination, path }`, the file path in effect — the intent payloads (`refresh`, `open`, `save` with an optional original name for edits, `delete`), and their hand-written guards.
- `activate.ts` implements the command: bare `hosts` opens or focuses the single tab, `list` notes the JSON, `add` validates and writes (replacing an existing name and reporting `updated`), `remove` deletes, and anything else is rejected with the usage line. After any write it calls `updateTab` so an open tab updates at once. Its intents: `refresh` re-reads; `open` runs `ssh <name>` through `dispatchLineWithOutput` (user decision), so lookup, labelling, port, and path live only in the core ssh command; `save` validates, refuses a duplicate or an unusable file in effect, writes, and returns either the saved name or the inline error; `delete` writes or reports its error through `notifyUser`. Malformed-file problems are reported through `notifyUser` subject to the once-per-problem memo.
- Catalog entry in `src/plugins/catalog.ts`, literal loaders in `src/plugins/loaders.ts` and `web/src/plugins/registry.tsx`.
- Client: `index.tsx` (default component, `isPayload`), a list component mirroring `SessionList`, a row-actions component, a host form modal built on `ModalDialog`, a pure key module reusing the published `nextListSelection` and the sessions click rule, and a stylesheet matching `sessions.css`. Everything comes through the plugin client API (`PluginActionsHeader`, `ConfirmDialog`, `useListSelection`); if `ModalDialog` is not already published there, it is added to `web/src/plugins/api.ts` as an additive export.

### `ssh <name>` — `src/ssh.ts`, `src/ssh-manager.ts`

In `SshManager`'s entry point (`src/ssh-manager.ts:19`, just before `parseSshCommand(input)`), when the arguments are a single token matching a saved host name, the ssh manager reads the hosts file in effect (project root from `Managers`, home from `os.homedir()`) and builds the spawn from the saved host: `-p <port>` when a port is saved, `[user@]host` as the destination, and, when a path is saved, `-t` with a remote command that changes into the path and then starts the user's login shell, continuing in the login directory when the change fails. The tab label is the saved name, passed through the existing `uniqueLabel` call in `SshManager.open`; the creator's transcript records the command as typed; the connections row keeps `ssh:<destination>` where destination is `[user@]host`. The path is single-quoted into the remote command (it has already passed the path character set, which admits no quote). The ssh harness payload gains an optional `hostName` beside its existing `destination`, set only for this route, so the sessions row can show it. `parseSshCommand` (`src/ssh.ts`) stays pure and unchanged: the lookup happens in the manager before it. A name lookup that finds the file unusable falls through to today's literal behavior and reports the problem through `notify` (`src/notifications/index.js`), subject to the once-per-problem memo.

### `on <name>` — `src/remote/address.ts` and its callers

- `RemoteAddress` gains optional `port` and `hostName` (user decision).
- A pure `resolveSavedHost(token, hosts)` beside `parseRemoteAddress` returns a `RemoteAddress` built from a saved host when the token, with no `@` or `:`, matches a saved name case-insensitively, and nothing otherwise.
- Resolution happens in the execution layer, on the already-parsed address: a saved name is a valid `[user@]host` token, so `parseRemoteAddress` accepts it unchanged and the executor then swaps in the saved host when `resolveSavedHost(parsed.address, hosts)` matches. The parsers stay free of I/O (`architecture-principles.md` §4). The three executors, each of which reads the hosts file in effect:
  - harness: in `src/harness/remote-launch.ts`, before its `startRemoteLaunch(managers, label, remote, …)` call (the one passing `HARNESS_CLONE_DEPTH`); `findRemoteClause` in `src/harness/command-parse.ts` is unchanged.
  - shell: in `src/plugins/launch-tab-remote.ts`, right after `const parsed = parseRemoteAddress(address)`, before the label is resolved; the shell plugin's own `remote: { address }` request (`src/plugins/shell/launch-tab.ts`) is unchanged.
  - agent: in `src/agent/remote-target.ts`, right after `parseRemoteAddress(selector)` and before the established-workspace match, so `on <name>` borrows an established workspace exactly when the saved `[user@]host` matches one and the saved host has no path, per the agent spec's existing rule.
- `src/sessions/ssh-bridge.ts`'s `startRemoteLaunch` call needs no lookup: it rebuilds from the record, which now carries `port` and `hostName`.
- `remoteServeCommand` and the capture command in `src/remote/entry-factory.ts` add `-p <port>` when the address carries one.
- An executor whose read finds the file unusable leaves the parsed address as it is and reports the problem through `notify` under the once-per-problem memo, the same as `ssh <name>` (user decision).
- The parked-session record persists `port` and `hostName` beside its `address`, and the readers that rebuild an address from a record (`src/sessions/attach.ts`, `src/sessions/terminate-session.ts`, `src/harness/capture/remote.ts`) restore them, so attach and terminate reach the same port.

### Sessions Host column — `src/sessions/rows.ts`, `src/protocol/sessions.ts`

`RemoteSessionView` gains optional `hostName`, and so does the sessions plugin's row guard in `src/plugins/sessions/shared.ts` (optional string, so the payload schema version does not change). Rows fill it from the live channel's or the record's address `hostName`, and in `sshRow` (`src/sessions/rows.ts`) from the ssh tab's `hostName`. The sessions client shows `hostName ?? host` in both places `SessionRowBody.tsx` renders `row.host` (the wide and narrow rows); the tooltip keeps the full destination. `src/sessions/rows.ts` is already over 200 raw lines; if the change pushes it past the `max-lines` count, extract `sshRow` and its neighbours into a new `src/sessions/ssh-rows.ts` rather than compacting. The same applies to `src/plugins/launch-tab-remote.ts` (206 raw lines): put the lookup in a small new module `src/plugins/launch-tab-saved-host.ts` that it calls.

### Completion — `src/completion/`

A new `src/completion/hosts.ts` exports a pure `completeSavedHost(cursor, names)` built on `completeWord` (`src/completion/helpers.ts`), modelled on `completeMonitorCommand` in `src/completion/handlers.ts`. It offers the names at argument 1 of `ssh` (only when that argument is the whole line so far, matching the bare-token rule), at the token after an `on` among the arguments of `shell`, `harness`, and `agent`, and at argument 2 of `hosts remove`. `completeCommandLine` (`src/completion/index.ts`) gains one trailing optional `hostNames` parameter and tries `completeSavedHost` before `completeFilePath`; `complete` in `src/controller/completion.ts` reads the hosts file in effect and passes the names (an unusable file passes none and reports nothing — completion never posts a notification).

### Order of work

Land it in this order so typecheck and tests stay green at each step: (1) `hosts-file.ts` and its tests; (2) `RemoteAddress` `port`/`hostName`, `resolveSavedHost`, the `-p` in `entry-factory.ts`, and the record fields; (3) the three `on` executors; (4) `ssh <name>`; (5) the sessions `hostName` column; (6) the hosts plugin server side, then client; (7) completion; (8) specs and help.

### Specs and help

New `product/specs/hosts-tab.md`; updates to `ssh-tab.md` (`ssh <name>`), `remote-server.md` and `agent-command.md` (`on <name>`, ports from saved hosts), `sessions-tab.md` (Host column), `tab-completion.md`, and `state-directory.md` or `application-config.md` (the hosts file). New `help/hosts.md`; `help/keys.md` gains the hosts list's `Cmd+N` / `Ctrl+N`.

## UI design

The hosts tab is a non-dockable plugin tab in the centre tab area, titled **hosts**; `hosts` opens it or focuses the one already open. Its table and interactions mirror the sessions tab (`web/src/plugins/sessions/SessionList.tsx`, `sessions-keys.ts`, `sessions.css`).

- **Header (feature text, user decision).** A full-width metadata bar like the sessions tab's, with icon buttons together at the right edge: `Refresh` (rotate icon), `New host` (plus icon), and the host-rendered Split control. There is no dock control.
- **Table (user decision).** Columns Name, User, Destination, Path, then an unlabeled fixed-width actions column. Headings and cells are left-aligned with 12px horizontal padding, like the sessions table. Destination shows `host[:port]`; a blank user or path leaves an empty cell. Rows are sorted by name, case-insensitively.
- **Row actions (user decision).** Right-aligned icon-only buttons, styled like `SessionRowActions`: a pencil labelled `Edit host <name>` and a trash labelled `Delete host <name>`, muted at rest and bright on hover. Pressing one does not move the selection or open the row.
- **Opening a row (feature text, from precedent).** One click makes a row current, a second click on the current row opens it, and Enter opens the current row; opening launches the ssh tab for that host. Up and Down move without wrapping; Home and End jump to the ends (`nextListSelection`, `sessionClickSelection` behavior). The list takes focus when the tab becomes active, and re-reads the files when the tab regains focus. Escape on the list does nothing.
- **Keyboard (user decision).** `Cmd+N` / `Ctrl+N` on the list opens the New host modal — the same list-local binding the conversation list uses, so it collides with nothing in `help/keys.md`; it is added there. Edit and delete have no keys.
- **Modal (user decision).** The shared `ModalDialog`, titled `New host` or `Edit host <name>`. Four labelled inputs — `Name`, `User`, `Destination`, `Path` — with placeholders `optional` for User and Path and `host[:port]` for Destination; buttons `Save` and `Cancel`. Edit prefills every field. Focus lands on Name; Tab moves through the fields and then the buttons; Enter in any field saves; Escape or Cancel closes without saving. A validation or save error appears inline above the buttons and the modal stays open; Save is disabled while a save is in flight. On success the modal closes and focus returns to the list, on the saved row.
- **Delete (user decision).** The shared `ConfirmDialog` titled `Delete host <name>?` with a `Delete` button, disabled while the delete is in flight. A refused or failed delete closes the dialog, leaves the row, and posts the error line to the notifications feed attributed to the hosts tab.
- **States (user decision).** Empty or unusable: only `No saved hosts`, no headings; the plus button stays enabled and a save is refused inline. There is no loading state: the rows arrive with the tab. Long cells ellipsize; the row tooltip shows the full `[user@]host[:port]` on one line and the path on the next.
- **Code placement (from guidelines).** Client code lives in the plugin's own directory, `web/src/plugins/hosts/`: a pure key module and thin components (list, row actions, modal). The modal's four field values, its in-flight flag, and its error string are plain `useState` inside the modal component — no separate hook — because the component makes no decision with them: validation happens on the server. Under the client plugin boundary lint it imports only `../api`, `../shared.css`, and `@shared/plugins/hosts/shared` — never the sessions plugin's files; the sessions click rule is three lines and is restated in the hosts key module rather than imported. The host list, the file in effect, and every validation verdict are server state per `ai/guidelines/architecture-principles.md` §1: the client renders the rows the server sends, emits `save`, `delete`, `refresh`, and `open` intents, and shows the error string a `save` intent returns.

## Tests

Server (colocated `src/**/*.test.ts`):

- `src/plugins/hosts/hosts-file.test.ts`: decode of a valid file; each malformed case (invalid JSON, non-object, missing destination, bad characters, bad port, case-insensitive duplicate) makes the file unusable; project-over-home selection; an unusable project file falls back to home; write round-trip and atomic replacement; once-per-problem memo.
- `src/plugins/hosts/activate.test.ts`: `hosts` opens or focuses one tab; `hosts list` JSON and `{}`; `hosts add` adds and replaces with the right wording; `hosts remove` and `No host named`; usage lines; `save` intent (create, rename, duplicate refusal, unusable-file refusal, write failure); `delete` intent; `open` dispatches `ssh <name>`; `updateTab` after every write.
- `src/plugins/hosts/shared.test.ts`: payload and intent guards.
- `src/ssh-manager.test.ts`: bare `ssh <name>` builds port, user, and path spawn and labels the tab with the name; `ssh <name>` with extra tokens and an unmatched name pass through unchanged.
- `src/remote/address.test.ts`: `resolveSavedHost` matching, case-insensitivity, `@`/`:` tokens never matching.
- `src/remote/entry-factory` and session record tests: `-p <port>` in the remote ssh command; `port` and `hostName` survive park and attach.
- `src/sessions/rows.test.ts`: `hostName` filled for saved-host launches only.
- Completion tests for the new name completions.

Web (colocated `web/src/**/*.test.tsx`):

- `web/src/plugins/hosts/`: rendering of rows, sort order, empty state, tooltip; keyboard navigation, click-then-click and Enter raising `open`; `Cmd+N`/`Ctrl+N` opening the modal; modal focus, Enter saves, Escape cancels, inline error keeps it open, Save disabled in flight, focus returns to the saved row; edit prefill; delete confirmation; lazy loading and payload validation through the registry.
- `web/src/plugins/sessions/SessionList.test.tsx`: Host column shows `hostName` when present.

## Out of scope

- Docking the hosts tab into a sidebar (feature text).
- Merging the home and project hosts files (user decision: whole-file replacement).
- Extra ssh options per host — identity file, jump host, arbitrary flags — and importing hosts from `~/.ssh/config` (user decision).
- Reachability or status per host, and launching a shell or harness from a host row (user decision).
- Matching typed addresses against saved hosts for the sessions Host column (user decision: only sessions launched through a saved name show it).
- Repairing a malformed hosts file automatically (user decision).
- Ports in a typed `on <address>` (from precedent; only a saved host's port is honored).

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual: run `hosts`, add a host with a port and a path using the plus button, click its row twice, and confirm an ssh tab labelled with the host name opens on that port in that directory; edit and delete it from the row buttons; run `hosts list`; open the sessions tab after `shell on <name>` and confirm the Host column shows the name.
