# diff tab remote workspaces

**Complexity: 8/10** — a new remote protocol operation with a version bump, two widened plugin-API seams, two new capabilities on the plugin contract, a session reworked from one tab to one per workspace, and three client surfaces; each step is independently verifiable, but the remote read is the whole of the risk.

The **diff tab** shows what changed in a workspace. It should also show what changed in a workspace that lives on another host, and the shell and harness metadata rows should carry plus-minus buttons that launch the tab in that tab's own workspace. A remote tab's workspace is where its agent works, and today the only way to see those changes is to ssh in by hand. The clause that opens one is `on <tab name>`, written the way `zsh <name> on <address>` writes its own.

## Product decisions

A workspaced shell or harness tab carries a plus-minus button in its metadata row; pressing it opens a diff tab on that workspace, titled **diff on <tab name>**. Typing `diff on <tab name>` in any tab's command bar opens the same tab, and the sessions tab's row for a live channel carries the same button. The tab shows that workspace's changes against `HEAD`, refreshes every second, and opens the file a row or a line jump names.

Each of the following was answered by the user during planning and is binding on the implementation.

**The clause names a tab, and only an existing workspace.** `diff on <name>` names an open **shell or harness tab that has a workspace**, local or remote, by label, case-insensitively. Nothing is provisioned: a remote host's workspace is the one the named tab already rides, and a local one is the clone the tab already works in. A path argument and the clause are mutually exclusive — `diff [path]` scopes the project-root diff, `diff on <name>` opens a workspace diff, and a line carrying both is refused with the usage line.

Two refusals surface on the transcript the command was typed in:

- No resolvable workspace — `Cannot diff on <name>: no open shell or harness tab named "<name>" has a workspace.` — which covers an unknown tab, a tab with no workspace, and any other tab kind.
- Still provisioning — `Cannot diff on <name>: the workspace of "<name>" is still being prepared.`

**One tab per workspace.** Each workspace diff is its own tab, keyed by the workspace's directory, so two tabs sharing one clone (the metadata row's ➕) share one diff tab. The non-workspaced project-root diff stays the single tab it is today. Pressing any route for a workspace that already has a diff tab focuses that tab rather than opening another.

**Titles.** A workspace diff's tab title is **diff on <tab name>**; the project-root diff's title stays **diff**. Labels stay `diff`, `diff-2`, … as every plugin tab's do. The header inside the tab keeps showing the abbreviated root — `$workspace/<name>`, `$root`, `~` — and a remote workspace's header names its host after the root, the way a remote tab's metadata row carries a host chip.

**The buttons.** The metadata row's workspace button takes a **plus-minus glyph**, drawn from the Font Awesome package the app already installs and exported from `web/src/shared/icons.ts` under its own semantic name, and is drawn for a **remote** workspace as well as a local one. Its tooltip is unchanged in both cases: **Show diff in the workspace**. The **sessions tab** gains the same plus-minus button in the action group of every **ready row of a live channel**; rows of one channel share one workspace, so they share one diff tab. The button is disabled while the channel's workspace is still provisioning, and it is absent on plain `ssh` rows and on detached and terminated rows. The diff tab's own two controls keep the arrows-up-down glyph they have, which the spec already names the plus-minus icon; the button is deliberately a different picture from them.

**A remote diff tab holds its channel.** It joins the named tab's channel exactly as a remote file navigator does and holds a reference, so the peer and its workspace survive while the diff tab is open and are released when it closes.

**Everything works remotely.** A row's name opens the file, a double-click on an added or context line opens it at that line, a binary entry opens its media tab, and the arrows-up-down control expands a text file to its whole contents — all through the same remote route a remote file navigator uses.

**A workspace diff tab closes itself when its workspace is gone.** The clone is deleted locally, or the remote session ends, and the tab closes rather than sitting on a directory that is no longer there.

## Design decisions established by the feature text and existing behavior

- **The diff tab is a bundled tab plugin** in `src/plugins/diff/` and `web/src/plugins/diff/`. Nothing about that shape changes; what changes is how many tabs there are and where each one reads.
- **The clause is a command form, not a flag.** It reads like the `as <label>` and `with <prompt>` clauses `harness` already carries rather than adding another option, and it is case-insensitive. It does **not** carry the address grammar `src/remote/address.ts` validates for `zsh` and `harness`: the argument is a tab label, not a remote address.
- **A workspace button already exists** on both metadata rows and already routes through `openDiffFor { label }` — the reply kind, the params validator, the message routing, and the controller-adapter method that calls `managers.plugins.openSibling('diff', …)`. The change is where it is drawn and what glyph it uses, not how it travels.
- **A remote tab's workspace lives on the far side.** `Tab.workspaceDir` is deliberately undefined for a remote tab (`src/tab/types.ts`), so the host resolves that workspace through the remote manager, and the local application has no git to read there.
- **The far side already runs git reads for the local side.** `git-pull` and `git-commit` are remote filesystem operations today, and `read-file` already carries a whole file's bytes across the channel as base64.

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Where |
| --- | --- | --- |
| Reading a working tree's change set against `HEAD` without touching the index | `readChangeSet`, plus the pure `parseDiff` over its output | `src/plugins/diff/change-set.ts`, `src/plugins/diff/parse-diff.ts` |
| Running work on a remote host against its provisioned workspace | The remote filesystem session: `filesystem-open`, `filesystem-request`, `filesystem-reply`, and the operation descriptor table | `src/remote/protocol-frames.ts`, `src/remote/filesystem/operations.ts`, `src/remote/channel/` |
| A remote file's bytes crossing the channel once, base64-encoded | The `read-file` operation and the `RemoteFileSystemPort` behind it | `src/file-navigator/remote/port.ts`, `src/remote/serve-file-navigator.ts` |
| Materializing a remote file locally so an ordinary opener can open it | `materializeRemoteFile`, with the save-back handle a remote navigator's row passes it | `src/file-navigator/remote/file-cache.ts`, `src/file-navigator/manager/files.ts` |
| A plugin tab joining an existing remote channel and holding its reference | `launchTab` with `remote: { join: true }`, what a remote tab's ➕ sibling shell uses; the release runs through `MANAGER_TAB_RELEASE`'s `remote` entry | `src/plugins/launch-tab-remote.ts`, `src/managers.ts` |
| The tab-scoped route from a metadata row into a plugin | `openDiffFor { label }`, its `ack` reply kind, its params validator, its message routing, and the controller-adapter method calling `managers.plugins.openSibling('diff', …)` | `src/protocol/core-rpc.ts`, `src/message/tabs.ts`, `src/controller/file/navigator-adapter.ts` |
| The plugin-side workspace hook | `openSibling(id, origin)` reading `originTab().workspace?.dir`, returning early while that workspace is provisioning | `src/plugins/host.ts` |
| A row action in the sessions tab reaching the host | `capabilities.topicAction({ topic: 'sessions', action })`, dispatched in `actOnSessions` behind an `offers(...)` check | `src/plugins/topics.ts`, `src/plugins/sessions/activate.ts` |
| Plus-minus and workspace glyphs | `web/src/shared/icons.ts`, the single registry of semantic icon names | `web/src/shared/icons.ts` |

**Not reused, and why.** Nothing in `src/` reads a change set except the diff plugin's own reader, so the far side's new operation dispatches to that reader rather than to a second implementation. `openInEditor` and `dispatchLineWithOutput` both take absolute paths on *this* machine, so a remote row's click needs the materialize-then-open route a remote navigator already takes instead of those two capabilities.

## Implementation decisions

### The clause and the command's argument

The diff command's argument, today one optional path, is read the way `parseShellArgument` reads everything after `zsh`: the tokens are scanned, a case-insensitive `on` lifts the token after it as the name, and the remaining words are the path. The path still resolves against the originating tab's project root and is refused when it escapes it or is not a directory, with the two wordings the command already uses. A path and a name both present, or an `on` with no token after it, is a usage refusal naming the whole form — **Usage: diff [path] [on <tab name>]** — written the way `zsh`'s own usage line is.

### Naming another tab

The plugin cannot read the host's tab list, so two existing seams widen rather than a new capability appearing:

- **`originTab()` gains an optional label.** Called with one, it answers the same record for that open tab — label, cwd, root, `remote` when it rides a channel, and `workspace` when it has one — instead of returning null. Called bare, it answers exactly what it answers today. For a remote tab the `workspace` it answers is the directory on **that host**, which is the one the diff tab has to read; the capability's contract says so, because every other consumer reads a local path. Only the shell and diff plugins call `originTab` today, and the shell's own uses either guard on `remote` first or read `root` alone, so widening it changes no existing behavior.
- **`launchTab`'s `join` form gains a label.** `remote: { join: true }` keeps meaning "the tab this call came from", which is what a remote tab's ➕ sibling shell uses; the label names another tab whose channel to join instead. `launchCapabilities` resolves the source from the request's label when it carries one, and `launchJoinedRemotePluginTab` checks that tab is remote rather than the originating one.

Both are additive and leave the plugin API version at 2.

### One resolution, three routes

The command's `on <name>` clause, the metadata row's button, and the sessions row's button all resolve through one helper in the plugin: read the tab's record with `originTab(label)`, then take one of three routes. A `remote` tab joins its channel and opens the workspace diff on the far side's directory; a tab with a local `workspace` opens the workspace diff on that clone; neither answers the no-workspace refusal. The button routes already run the plugin's own `openSibling` hook with the clicked tab as the origin, so the hook calls the same helper with the label it was given — which is what makes a remote tab's button work without the host learning anything new.

The focus rule comes before the join. `launchTab` never focuses an existing tab, so a workspace whose diff tab is already open is opened with `openOrFocusTab` on the instance key it already holds and nothing is rebuilt. Only a workspace with no open diff tab reaches the join, and the key the join opens under is the same key the workspace directory derives, so the second route for that workspace focuses what the first one opened.

### One tab per workspace, one per project root

The session holds its tabs in a map from instance key to state rather than one root and one payload. The project-root diff keeps the fixed `diff` key, so `diff` and `diff <path>` still focus and re-scope the one tab. A workspace diff's key is its workspace directory, prefixed to keep the two keyspaces apart, so a second route for the same workspace focuses the tab that is already showing it. Re-scoping keeps the existing rule: the payload is cleared before a new root's change set lands, because what the tab held belonged to the directory it left. Each tab's title is written when it opens — **diff on <tab name>** for a workspace diff, **diff** for the project-root one — and the workspace's own name is kept with it for the header.

A remote workspace's header is the one display that changes shape. `displayRoot` answers `$root`, `~`, or an absolute path by testing the root against **this** machine's directories, and a far-side path that happens to sit under the local launch directory would answer `$root` for a directory that is not here. So a remote root takes its own branch: `$workspace/<name>` from the far-side path's last segment, followed by the host. The payload carries the host when the workspace is remote, because the header has to name it and the client never computes it.

### The remote read

The far side gains one remote filesystem operation, **`change-set`**, which takes the set of files to expand to full-file context and returns the same records the local read produces — the change set's state, its message, and its files — so one client renders both. It is a read operation in the descriptor table with no path arguments, because there is one workspace per session and nothing to contain. Its arguments are validated as a list of strings; an operation that arrives with any other shape is malformed and refused before it runs.

On the far side the operation dispatches to the diff plugin's own `readChangeSet`, so there is one definition of what a change set is. That import is the deliberate exception the plan records: `src/remote/` is core, and core reaching a concrete plugin's module is normally forbidden — but the read is the one definition of the behavior, the far side is a separate process where lazy loading buys nothing, and the alternative is a second implementation of the same git reads. Adding the operation moves `REMOTE_PROTOCOL_VERSION` to 29, and the spec's protocol-version history gains the entry the existing ones follow: a version-28 remote refuses the operation as unknown, so a diff tab opened against one would show a failure rather than a half-working change set, which is why the handshake refuses the mismatch instead.

The plugin reaches it through one new additive capability, scoped to the plugin's own answering tab the way `queueLine` is: it answers the change set of the remote workspace that tab rides, or null when the tab rides none. The host resolves the channel from that tab, sends the request, and hands back the far side's answer, which the plugin validates with its own guard before publishing. The tab's once-a-second recompute, its in-flight guard, its full-file expansion, and its refresh-keeps-the-body rule are unchanged; only the reader behind them moves.

### Opening a file from a remote diff

A second additive capability materializes one remote file and answers its local path. The plugin then opens that path through the routes it already has — `openInEditor` for a row or a line jump, and the application's own `open` line for a binary entry's media tab — so the remote case adds no second opening path. A row whose file cannot be read answers the failure the way the local route answers git's, as the tab's error line.

### The workspace disappearing

A workspace diff tab whose read answers `not-repository` while its root no longer exists closes itself, locally and remotely alike. On the remote side the channel's own ending already closes every tab riding it, through the joined handlers the release path installs, so the only new behavior is the local clone's disappearance — which the existing state already distinguishes, because a workspace root that is gone is not a git repository.

### The sessions row

The sessions topic action gains `diff`, dispatched in `actOnSessions` behind the same `offers('diff', { label })` check every other session verb uses, and answered by the host calling `managers.plugins.openSibling('diff', …)`. The row's own `actions` gain `diff` where `liveActions` offers it: a live channel whose workspace is ready. The client's row action group draws the button from that action, the way it draws attach and detach, and the sessions spec and the sessions tab's shared row type gain the verb beside the others.

### The metadata buttons

`ShellTabMeta` draws the button when its payload says the tab has a workspace, local or remote, and `HarnessTab.tsx` stops withholding `onOpenDiffHere` from a remote tab. Both use the plus-minus glyph, both keep the existing tooltip, and both stay inert while the workspace is provisioning.

### Order of work

The steps are ordered so each one leaves typecheck, lint, and the test suite green on its own, and so the remote read — the only step that can fail for a reason outside this repository — lands after everything that does not depend on it:

1. **The command's argument and its refusals.** The clause parses, a path and a clause together is a usage refusal, and the two no-workspace refusals answer. The local project-root diff is unchanged.
2. **One tab per workspace.** The session holds a map from instance key to state, the project-root diff keeps its fixed key, a workspace diff keys on its directory, and titles are written per tab. Local workspace diff tabs exist here, one per clone, with the focusing rule.
3. **Naming another tab.** `originTab(label)` widens and the resolution helper lands, so the command's clause, both metadata buttons, and the sessions route all reach a local workspaced tab through it. The `join` label widens here too and is covered by its own tests, but no diff tab joins a channel yet: a join with no remote reader behind it would open a tab that cannot read.
4. **The remote read.** The `change-set` operation, the version bump, the far side's dispatch to the plugin's reader, the handshake refusal for an older peer, the join with a label, and the plugin's remote reader through the new change-set capability, in one change — a protocol whose two halves land separately is a protocol that disagrees with itself.
5. **Remote file and media opens.** The materialize capability, and the row and line-jump routes using it.
6. **The metadata buttons.** The plus-minus glyph and the remote case in both components.
7. **The sessions row.** The `diff` verb on the row, the topic action behind its `offers` check, and the client button.
8. **Specs and docs.** `product/specs/diff-tab.md` for the clause, the multiple tabs, and the remote behavior; `product/specs/remote-server.md` for the operation and the version; `product/specs/tab-plugins.md` for the diff plugin's two widened seams and the new capability; `product/specs/sessions-tab.md` for the row's new verb; the user documentation's diff page for the remote tab and the sessions button; `help.md` if the `diff` row's description names a path only.


## Tests

- `src/plugins/diff/` — the argument parse: a bare `on`, a name with a path (refused), `on` with no token, a case-insensitive name, and a name that is also a path-like word. The change-set read against a remote port and the session's one-tab-per-workspace keying, beside the real-repository cases `src/plugins/diff/change-set.test.ts` already carries.
- `src/remote/` — the `change-set` operation's argument validation, its reply shape, and its refusal for a malformed argument, beside the cases in `src/remote/filesystem/operations.test.ts` and `serve-file-navigator.test.ts`; and the handshake refusing a version-28 peer.
- `src/plugins/` — the widened `originTab(label)` and `launchTab` join-with-label, with the refusals for a tab that names nothing.
- `src/sessions/` and the sessions plugin — `offers('diff', …)` narrowing the verb, and the row action set a ready live channel carries.
- `web/src/plugins/shell/ShellTabMeta.test.tsx` and `web/src/harness/HarnessTabMeta.test.tsx` — the plus-minus button rendered for a local workspace and for a remote one, absent for a tab with no workspace.
- `web/src/plugins/sessions/` — the button drawn from the row's action and disabled while the workspace provisions.

## Out of scope

- Writing anything from the diff tab. It stays read-only on either host: it stages nothing, discards nothing, commits nothing, and it never writes to a git index.
- Any change to how a remote workspace is provisioned, named, cleaned up, authenticated, or detached. `diff on <name>` reads a workspace that already exists; it never makes one.
- The `on <address>` address grammar, ssh options, and anything that opens an ssh session from the diff command. The name in the clause is a tab label.
- The project-root diff's behavior, the tab's rendering, its keyboard navigation, its comments, and its layout control, all of which stay as they are.

### Gaps considered and declined

Five gaps against the products that own this capability were researched and declined by the user during planning. They are recorded so no later phase proposes them again:

- **Comparing against an arbitrary ref**, the way VS Code's Source Control Graph compares a commit with any branch, tag, or commit and GitLens compares the working copy with any ref. The tab stays a working-tree-versus-`HEAD` view.
- **Filtering the change set**, the way GitHub's Files changed view filters by path, extension, ownership, and viewed state. The change set stays one list in file path order.
- **Separating staged from unstaged changes**, the way VS Code's Source Control view splits its Changes and Staged Changes sections. The two stay shown together, which is the decision the completed `git-diff-tab` plan already recorded.
- **Every workspace in one change set**, the way VS Code's Repositories view shows changes across every repository in a workspace. Each workspace keeps its own tab.
- **A commit's changes or a file's history**, the way VS Code's Source Control Graph, Timeline view, and blame each read history. The tab stays a working-tree view and never reads a commit.


## Verification

`./scripts/run.mjs check-diff`, plus a manual check: a workspaced shell tab and a workspaced harness tab, local and remote, each with its plus-minus metadata button; `diff on <name>` for each of them and for a tab with no workspace; the sessions tab's button on a ready row; two tabs sharing one clone focusing one diff tab; and the project-root `diff` and `diff <path>` still behaving as one tab.
