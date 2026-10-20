# Search tab should search in local and remote workspaces

**Complexity: 7/10** — six new host capabilities plus an `originTab()` extension across five tab kinds, a remote channel joined and released in place on an existing tab, a wire field on the default-menu RPC, a payload schema bump, and two files already at the size limit that must be split first.

The search tab only ever searches the project's launch directory. That's the wrong place when the text you're after lives in a workspace clone: a workspaced harness or agent edits its own clone, local or on another host, and the launch directory never sees those edits. Right-clicking a line in that harness and choosing **Search for this** searches the launch directory today, so it finds the old code or nothing. This feature makes the search follow the workspace. A search started from a workspaced tab searches that workspace, lists that workspace's matches, and opens a match from that workspace.

## Design decisions

Established by the feature text:

- `Search for this` in a workspaced harness or agent tab, local or remote, searches that tab's workspace rather than the launch directory.
- The results come from that workspace, and opening a result opens the file in that workspace.

Settled with the user:

- **There is still one search tab.** It doesn't multiply per workspace. A route started from a workspaced tab re-scopes the one tab to that tab's workspace, and its results replace whatever the tab showed before.
- **Three routes follow the workspace of the tab they start from:** **Search for this**, a typed `search` or `search <phrase>` in a workspaced tab's command bar, and **Cmd+Shift+F** (Ctrl+Shift+F elsewhere) while focus is in a workspaced tab.
- **Five kinds of tab carry a workspace for these routes.** A shell or harness tab that owns a clone, an agent monitor tab (`Agent: <task>`) whose run executes in a workspace, local or remote, an editor tab whose file lives in a clone (a local one, or one materialized from a remote workspace), and a file navigator rooted inside a clone, local or remote. An agent monitor keeps pointing at its run's workspace after the run ends; once that workspace has been released and removed, it's refused as no longer available. The search tab itself is one more origin: **Search for this** on a selection inside it keeps its current scope rather than jumping back to the launch directory. Every other tab searches the launch directory.
- **A workspace that hasn't landed yet is refused.** When the clone is still running, or a remote tab's far side hasn't answered, nothing opens and nothing is searched. The refusal goes to the notifications feed, not to the transcript, and reads exactly `Search: the workspace of "<name>" is not ready yet.`
- **An origin whose workspace is gone is refused too.** An editor, navigator, or agent monitor tab whose clone was removed, or whose remote session ended, doesn't fall back to the launch directory. Nothing is searched, and the notifications feed reads exactly `Search: the workspace of "<name>" is no longer available.`
- **`<name>` is the workspace label** in both notifications: the clone's own label, such as `claude-2` for `$workspace/claude-2`, whichever tab the route came from.
- **The header names the scope.** It shows the root in the diff tab's abbreviated form: `$root` for the launch directory, `$workspace/<name>` for a local clone, and the host first for a remote workspace. The tab's title stays **search** whatever the scope.
- **A bare route from another scope re-scopes and reruns.** When a bare `search` or the chord comes from a different scope than the open tab's, the tab moves to the new scope and reruns the query, toggles, and narrowing fields already in it against the new root. From the same scope it only focuses the tab, as today. A route carrying a phrase searches that phrase in its own scope. A re-scope with an empty query runs nothing and shows `Type to search`.
- **A re-scope keeps the tab's own state.** The term history and the include and exclude fields carry over. Only closing the tab forgets them, as today.
- **A remote scope holds its session.** While the search tab is scoped to a remote workspace it joins that workspace's channel, the way a remote diff tab or remote file navigator does. It releases the channel when it re-scopes elsewhere or closes. A local scope holds nothing, so the clone still goes when its last tab closes.
- **A workspace that goes away closes the tab.** When the scoped workspace's clone is removed, or its remote session ends, the search tab closes itself, the way a workspace diff does. Any search still running is abandoned. Nothing is said about it: the tab that owned the workspace closing, or the session ending, already explains it. The server closes it, not the client, so it closes even while no browser is connected. That's why the plan adds `closeOwnTab` rather than reusing the diff tab's client-side `capabilities.close()`.
- **Remote files are scanned locally over the existing remote operations.** The far side lists the workspace (gitignore-aware, the same list a remote navigator's search uses) and serves each candidate file; matching stays in the local matcher worker. There's no protocol change. The ceiling is one channel round trip per candidate file, so a very large remote repository searches more slowly than a local one. A far-side text-search operation is the upgrade path if that proves too slow.
- **"Which workspace is this tab in" is answered by the host's `originTab()` record**, extended to editor, navigator, and agent monitor tabs, so every plugin gets the same answer.
- **The search tab joins and releases a remote channel in place.** It keeps its label and strip position across re-scopes, rather than being closed and relaunched.
- **The default-menu action and the chord name the tab they came from.** Today the default-menu action's origin is whichever centre tab is active, which is wrong for a right-click inside a docked sidebar tab.

Established by existing behavior:

- The search tab today is a single tab with instance key `search`, titled **search**, searching the launch directory's gitignore-aware file list (`product/specs/search-tab.md`).
- A workspace diff closes itself when its workspace disappears, and a remote diff joins and releases the channel its tab rides (`product/specs/diff-tab.md` § Opening the tab, § A workspace on another host).
- A remote workspace's files reach a local editor through the same materialization cache a remote file navigator uses, so a save from that editor writes back over the channel for as long as the materializing tab holds it (`src/plugins/remote-capabilities.ts`).
- Closing a tab whose record carries `remote` releases its channel reference (`src/tab/cleanup.ts`, the `MANAGER_TAB_RELEASE` walk calling `managers.remote.closeTab`).

## What already exists (reuse, don't rebuild)

| Need | Existing piece |
| --- | --- |
| Learn which workspace the user was standing in | `originTab()` in `src/plugins/line-capabilities.ts`, record type `TabPluginOriginTab` in `src/plugins/api-origin-tab.ts` |
| Workspace-label display form (`$workspace/<name>`) | `abbreviateWorkspaceDir` in `src/paths.ts`, already handed to launch-ready handlers as `displayDir` |
| Join a remote tab's channel, and release it | `managers.remote.attach(label, sourceLabel)` and `managers.remote.release(label)` (`src/remote/manager.ts`), as `launchJoinedRemotePluginTab` in `src/plugins/launch-tab-remote.ts` uses them |
| A port over the channel a plugin tab rides | `resourceFor` / `ride()` in `src/plugins/remote-capabilities.ts` |
| Gitignore-aware file list of a local directory | `listProjectFiles` (`src/file-navigator/search.ts`), behind `projectFilesFor` (`src/project/files.ts`) and the `projectFileList` capability (`src/plugins/context.ts`) |
| Gitignore-aware file list, row stats, and file reads on a remote workspace | `RemoteFileSystemPort.search(root)`, `statRows(root, paths)`, `readFile(root, relPath)` (`src/file-navigator/remote/port.ts`) |
| Open a remote file in a local editor | `materializeRemoteFile`, then `openInEditor`, as `DiffTab.openFile` does (`src/plugins/diff/tab-state.ts`) |
| Find which remote workspace a materialized editor file came from | `remoteFileFor(path)` and `isRemoteCacheFile(path)` (`src/file-navigator/remote/file-cache.ts`), whose `RemoteFileRecord.label` names the tab that materialized it |
| Whether a local clone is still held | `WorkspaceManager`'s `refs` map and `provisioning(dir)` (`src/workspace/manager.ts`) |
| The scan, matcher worker, batching, 250-match cap | `startScan` (`src/plugins/search/scan.ts`), which already takes injectable `listFiles`, `readFile`, and `fileSize` |
| A plugin line in the notifications feed | `notifyUser(text)` capability (`src/plugins/context.ts`) |
| A coalesced signal that the tab set changed, naming each plugin tab's id and instance key | the `tabs` host topic (`src/plugins/topics.ts` `subscribeTabs`, rows of `TabActivityEntry` in `src/plugins/activity.ts`) |
| Naming the tab around a focused element | `chordTabLabel` and the `[data-tab-label]` attribute (`web/src/useWindowKeys.ts`, `web/src/plugins/PluginTabLayer.tsx`) |
| Running a command line in a named tab | the `command` RPC's optional `tab` param (`src/protocol/core-rpc.ts` `{ method: 'command'; params: { text: string; tab?: string } }`) |

## Proposed changes

### 1. Host: the workspace an origin tab is in

Add `src/plugins/origin-workspace.ts`, exporting one function, `originWorkspace(managers, tab)`, that answers which workspace a tab belongs to. `originTab()` in `src/plugins/line-capabilities.ts` calls it in place of its inline `workspaceDir` and `provisioning` lines, keeping `line-capabilities.ts` under the size limit.

`TabPluginOriginTab.workspace` grows from `{ dir; offline? }` to also carry `label` (the workspace label), `display` (`abbreviateWorkspaceDir(dir)`), `ride` (for a remote workspace, the label of an open tab riding its channel), and `gone` (set, and only then, when the tab points at a workspace that no longer exists). The top-level `remote` and `provisioning` flags keep their current meaning for shell and harness tabs, so the diff plugin's `resolveWorkspace` and `openSibling` behave exactly as today; they're additive fields and `TAB_PLUGIN_API_VERSION` does not change.

The rules, per tab kind:

- **Shell and harness tabs**: today's resolution. A local clone's label is the clone directory's basename. A remote one's label is `managers.remote.entryOf(label).workspaceLabel`, and `ride` is the tab itself.
- **A plugin tab that rides a channel** (its record carries `remote`, as a joined search or diff tab does): the channel's workspace, `ride` is the tab itself, and `gone` is set when `tab.sessionTerminated` is set or `managers.remote.get(label)` is undefined.
- **Agent monitor tabs** (`plugin === 'agent-monitor'`): the bound run's execution workspace, read through the monitor's `tab.plugin.agentRunId` from `managers.agent.runs.get(runId).view()` (`AgentRunView.host` and `.workspace`, `src/agent/types.ts`). `AgentManager` keeps a run in `runs` while any monitor is bound to it (`src/agent/manager.ts`, the `run.monitorIds.size === 0` checks), so the view outlives the run's end. A run missing from `runs` is `gone`. `host === 'Local'` means a local workspace, which is `gone` once the workspace manager no longer tracks it. Any other host is remote: it rides the first open tab whose channel entry has the same host (`entryOf(label).address.host`) and workspace directory (`workspaceOf(label)`); with none (the run's lease released, or a run-only `on <host>:<path>` connection), it's `gone`.
- **Editor tabs**: the file is `tab.editor.path`. A remote-cache file (`isRemoteCacheFile`) resolves through `remoteFileFor` to its workspace root, and rides the record's own `label` when that tab still rides a channel, or else the first open tab riding a channel with the same workspace; with none it's `gone`. A local file inside a tracked clone belongs to that clone. A local file under the workspaces directory whose clone is no longer tracked is `gone`.
- **File navigator tabs**: a remote navigator (`tab.files.remote` set) rides its own channel, since `openRemoteNavigator` attaches the navigator's own label (`src/file-navigator/open.ts`, `managers.remote.attach(label, ownerLabel)`). A local root inside a tracked clone belongs to that clone, and a local root under the workspaces directory whose clone is no longer tracked is `gone`.

`WorkspaceManager` gets one read-only method, `tracks(dir)`, answering `this.refs.has(dir)`, so the resolver doesn't reach into the private map.

### 2. Host: new capabilities

All additive, each named in `TAB_PLUGIN_CAPABILITY_NAMES` (`src/plugins/api-capabilities.ts`, the record keyed by the capability union, so a missing entry is a compile error). `src/plugins/api.ts` already sits at the 200-line `max-lines` limit, so the new signatures can't go there: move the remote-workspace group (`readWorkspaceChangeSet`, `materializeRemoteFile`, and the four remote ones below) into a new `src/plugins/api-remote-workspace.ts` as a type that `TabPluginServerCapabilities` intersects, the way `api-launch.ts` and `api-origin-tab.ts` already split types off. `closeOwnTab` and the widened `projectFileList` signature fit in `api.ts` once that group has moved out.

`src/plugins/context.ts` is at 195 code lines, so the `projectFileList` change can't go inline either. Move `projectFileList` and `openInEditor` out of `createPluginContext` into a new `src/plugins/project-capabilities.ts` and spread it back in, the way `lineCapabilities` is. Don't edit `src/plugins/file-capabilities.ts`: nothing imports it, and it's a stale copy whose `openInEditor` lacks the agent-run branch.

- **`projectFileList(root?)`**: an optional root. Given, it lists that directory with the same `listProjectFiles`. A root outside the launch directory gets the empty answer `{ root: '', paths: [] }`, the same bound `openInEditor` already applies with `isInsideRoot(managers.tab.launchDir, ...)`. Local clones live under the launch directory, so they pass.
- **`workspaceTracked(dir)`**, beside it in `project-capabilities.ts`: answers `managers.workspace.tracks(dir)` for a directory inside the launch directory, and false otherwise. It's how a plugin that holds a local scope but rides nothing learns its clone is gone.
- **`remoteWorkspaceFileList(instanceKey)`**: the gitignore-aware file list of the remote workspace this plugin's own tab (by instance key) rides, as `{ root, paths }` with paths relative to the workspace root, through `port.search(root)`. Null when that tab rides nothing.
- **`readRemoteWorkspaceFile(instanceKey, relPath, maxBytes)`**: one file of that workspace as UTF-8 text (`port.readFile` answers bytes, decoded with `TextDecoder`), or null when the tab rides nothing, the file is missing, its size from `port.statRows` is over `maxBytes`, or the read fails. Both remote capabilities live in `src/plugins/remote-capabilities.ts` beside `readWorkspaceChangeSet` and reuse its `resourceFor`, but address the plugin's own tab by instance key rather than the answering or origin label. The scan outlives the call that started it, and the tab that started it may be the harness the user right-clicked in.
- **`joinRemoteWorkspace(instanceKey, sourceLabel)`** and **`releaseRemoteWorkspace(instanceKey)`**, in a new `src/plugins/remote-join-capabilities.ts`. Join attaches this plugin's own open tab to `sourceLabel`'s channel with `managers.remote.attach(tabLabel, sourceLabel)` and copies the source's `remote` target onto the tab record, so the existing close path releases it. It answers false, changing nothing, when the source rides no channel, is reconnecting (`managers.remote.reconnectingOf`), or the attach refuses. Release calls `managers.remote.release(tabLabel)`, clears the tab's `remote`, and drops its port with `releasePluginRemoteResource(tabLabel)`. Release on a tab that rides nothing, or an instance key with no open tab, is a no-op. Both emit a `state` dirty so the view updates.
- **`closeOwnTab(instanceKey)`**, in `src/plugins/own-tab-capabilities.ts`: closes this plugin's own tab through the ordinary tab-close path, which runs cleanup and so releases any channel.

### 3. Search plugin

The manifest (`src/plugins/search/manifest.ts`) adds `originTab`, `notifyUser`, `workspaceTracked`, `materializeRemoteFile`, `remoteWorkspaceFileList`, `readRemoteWorkspaceFile`, `joinRemoteWorkspace`, `releaseRemoteWorkspace`, and `closeOwnTab` to `capabilities`, and declares `notifications: ['tabs']`.

Add `src/plugins/search/scope.ts`, pure: the `SearchScope` type (`launch`, `local` with `dir` and `label`, or `remote` with `dir`, `label`, `host`, and `ride`), `scopeFrom(origin)` that turns an `originTab()` record into a scope, a refusal (`not-ready` or `gone`, carrying the label), or "keep the current scope" when the origin is the search tab's own, and `sameScope(a, b)`. The two notification lines are built here, so their wording lives in one place.

`SearchSession` (`src/plugins/search/session.ts`) holds the current scope, starting at `launch`. The re-scope steps stay in the session: it's 165 raw lines but 113 counted by `max-lines`, which leaves room. The pure decisions are already in `scope.ts`. Extract only if `lint-files` reports the limit.

**Every route uses its own call's capabilities.** Today `sessionFor` keeps the capabilities of the first call ever made (`src/plugins/search/activate.ts`, `session ??= new SearchSession(capabilities, ...)`), and `open` calls `this.capabilities.openOrFocusTab`. That object's origin is the tab of that first call. Once that tab closes, `openOrFocusTab` returns early (`src/plugins/context.ts`, the `managers.tab.tabs.every((tab) => tab.label !== origin.label)` guard), and a no-label `originTab()` would keep answering for it. Closing a workspaced harness is exactly the common case here. So `open(argument, capabilities)` takes the calling route's capabilities, and uses them for `originTab()`, `notifyUser`, and `openOrFocusTab`. `command` and `defaultMenuAction` in `activate.ts` pass theirs through. The capabilities kept on the session stay for what's addressed by instance key or needs no origin: `updateTab`, the remote file capabilities, the settings, and `projectFileList`.

- `open(argument, capabilities)` reads `capabilities.originTab()`, resolves a scope, and on a refusal calls `capabilities.notifyUser` with the line and returns before opening anything. Otherwise it opens or focuses the tab as now. The factory, which runs only when the tab is being built, resets the scope to `launch` along with everything else it resets, since a closed tab already released its channel through cleanup. After `openOrFocusTab` returns and the tab exists, a changed scope cancels any running scan, calls `releaseRemoteWorkspace('search')`, and for a remote scope calls `joinRemoteWorkspace('search', scope.ride)`. A failed join leaves the tab on its previous scope and notifies the no-longer-available line. Then a phrase is searched as now. A bare route that changed scope reruns the current request when its query isn't blank. A bare route in the same scope only focuses.
- `run` builds the scan's file access from the scope. `launch` uses `projectFileList()`. `local` uses `projectFileList(dir)` and reads files from disk exactly as now. `remote` uses `remoteWorkspaceFileList('search')` and reads each candidate with `readRemoteWorkspaceFile('search', relPath, MAX_BYTES)`.
- `openMatch(relPath, line, capabilities)` takes the `open` intent's own capabilities, the way `run` already takes a `reporter`. A local or launch row joins the scope's root and checks `isInsideRoot` as now. A remote row goes through `materializeRemoteFile(relPath)` and then `openInEditor`, as `DiffTab.openFile` does.
- `dispose` and the tab closing both cancel the scan. Closing releases the channel through the host's own cleanup.

`ScanOptions` (`src/plugins/search/scan.ts`) gains an optional `readCandidate(absPath)` answering text or null, used in place of the `fileSize`-then-`readFile` pair when given, so the remote reader makes one capability call per file. The binary-prefix test still runs on whatever text comes back. `MAX_BYTES` is exported for the session to pass.

`SearchPayload` (`src/plugins/search/shared.ts`) gains `scope: string` (the display root: `$root`, or the origin record's `workspace.display`) and optional `host`. Bump `SEARCH_PAYLOAD_SCHEMA_VERSION` to 2 and update the literal in `web/src/plugins/registry.tsx` to match, since the guard now requires `scope`.

`activate.ts` adds a `notify` handler for the `tabs` topic, using the capabilities the notification hands it. The handler does nothing while the scope is `launch`. In a `remote` scope it finds its own tab's row by `plugin.id === 'search'` and `plugin.instanceKey === 'search'`, then asks `originTab(row.label)`: the search tab rides the channel, so its own record says `gone` when the session has ended. In a `local` scope the search tab rides nothing and its own record can't answer, so it asks `workspaceTracked(scope.dir)`. Either answer saying the workspace is gone cancels the scan and calls `closeOwnTab('search')`. The `tabs` topic is coalesced over `TABS_NOTIFICATION_WINDOW_MS` on every state change, which lands after the tab-close path's deferred `workspace.release`, so the clone is already untracked when the handler reads it.

### 4. Routes name the tab they came from

- `DefaultMenuRunRequest` (`src/protocol/plugin.ts`) gains optional `tab`. `useDefaultContextMenu` (`web/src/context-menu/useDefaultContextMenu.ts`) fills it from the right-clicked element's closest `[data-tab-label]`, captured into `pending` when the menu opens, and from `document.activeElement`'s for the `Cmd+I` path. `src/message/plugin.ts` passes `message.params.tab` through to `controller.runDefaultMenuSelectionAction(selection, action, tab)`. `PluginControllerAdapter.runDefaultMenuSelectionAction` (`src/controller/plugin-adapter.ts`) takes the third argument, and `originOf(managers, tab)` uses it as the origin label when `managers.tab.byLabel(tab)` finds an open tab, falling back to the active tab otherwise.
- The `projectSearch` chord in `metaChordOpener` (`web/src/useWindowKeys.ts`) sends `search` with `tab` set to the enclosing `[data-tab-label]` of the event target, or no `tab` when focus rests on the page. `runCommand` in `web/src/App.tsx` (`client.send({ method: 'command', params: { text } })`) takes an optional second `tab` argument and adds it to the params; the server already routes a `command` with `tab` to `managers.command.dispatchTo(tab, text)` (`src/message/tabs.ts`).
- So both lookups can name a core tab, `TabBodyDiv` in `web/src/MountedViewLayers.tsx`, the harness layer in `web/src/harness/HarnessTabLayer.tsx`, and the current entry's body in `web/src/Sidebar.tsx` carry `data-tab-label`. A core tab's label never matches a plugin chord claim in `createPluginChordRegistry`, so the application still keeps the chord there.

### 5. Search tab client

The metadata header in `web/src/plugins/search/SearchTab.tsx` renders the host, when there is one, and then `payload.scope` at its left end, before `<SearchFilters>`, with the same `files-loc` spans `web/src/plugins/diff/DiffTab.tsx` uses for its host and root. The server decides both strings; the client only renders them.

### 6. Specs and docs

- `product/specs/search-tab.md`: § Opening the tab and § What is searched describe the scope, the three routes, the five origin kinds, re-scoping, the two notifications, the header, and closing when the workspace goes away. § Lifetime notes that the tab holds a remote channel while scoped there.
- `product/specs/context-menu.md`: **Search for this** searches the workspace of the tab the selection is in.
- `documentation/user-documentation/command-bar/project-search.md` and `documentation/user-documentation/getting-started/context-menus.md`: the same behavior for users.
- `documentation/developer-documentation/tab-plugins.md`: the extended `originTab()` record, the optional `projectFileList` root, and the six new capabilities.

### 7. Order of work

Land it in this order, so typecheck and tests stay green at each step: the `api.ts` and `context.ts` extractions with no behavior change. Then `WorkspaceManager.tracks`, `originWorkspace`, and the new capabilities with their tests. Then the protocol `tab` field, the adapter, and the client lookups. Then the search plugin and its schema bump together with the `registry.tsx` literal. Then the header. Specs and docs go with the step whose behavior they describe.

## Tests

Server, colocated:

- `src/plugins/origin-workspace.test.ts`: each tab kind's rule. A local and a remote harness. A provisioning clone. An agent monitor whose local workspace is tracked, untracked, remote with a riding tab, and remote with none. A local editor file inside a tracked clone, and one under the workspaces directory whose clone is untracked. A remote-cache editor file whose materializing tab still rides, one that falls back to another riding tab, and one with none. A local and a remote navigator. A joined plugin tab whose session ended.
- `src/plugins/remote-capabilities.test.ts` (new; today's only coverage is the dynamic import in `src/plugins/context.test.ts`): the file list and the size-checked read, addressed by instance key, null for a tab riding nothing, null over `maxBytes`, null on a failed read.
- `src/plugins/remote-join-capabilities.test.ts`: join attaches and sets `remote`, refuses a source with no channel or one reconnecting, release detaches and drops the port, and closing a joined tab releases through cleanup.
- `src/plugins/own-tab-capabilities.test.ts` (new): `closeOwnTab` closes only this plugin's own tab and is a no-op for an unknown instance key.
- `src/plugins/project-capabilities.test.ts` (new): `projectFileList(root)` inside and outside the launch directory, `projectFileList()` unchanged, and `workspaceTracked` for a tracked clone, a released one, and a directory outside the launch directory. The existing `openInEditor` cases in `src/plugins/context.test.ts` keep passing after the move.
- `src/plugins/search/scope.test.ts`: `scopeFrom` for each origin and refusal, the exact notification lines, `sameScope`.
- `src/plugins/search/activate.test.ts`, extending its existing fakes: a default-menu action from a workspaced harness re-scopes and scans the clone. A bare `search` from another scope reruns, and from the same scope only focuses. The not-ready and gone refusals notify and open nothing. Selection inside the search tab keeps the scope. Re-scoping keeps history and fields. A remote scope joins, a later local scope releases, and a failed join notifies and keeps the old scope. A remote row opens through `materializeRemoteFile`. A `tabs` delivery after the clone is untracked closes the tab, and one while scoped to the launch directory does nothing.
- `src/plugins/search/scan.test.ts`: `readCandidate` replaces the size-then-read pair and a null answer skips the file.
- `src/plugins/search/shared.test.ts`: the guard requires `scope` and accepts optional `host`.
- `src/controller/plugin-adapter.test.ts`: a run request naming an open tab uses it as origin, and an unknown or absent one falls back to the active tab.

Client, colocated:

- `web/src/context-menu/DefaultContextMenu.test.tsx`: the run request carries the label of the tab body the right-click landed in.
- `web/src/useWindowKeys.test.ts`: the chord sends `search` with the focused tab's label, and with no `tab` when focus is on the page.
- `web/src/plugins/search/SearchTab.test.tsx`: the header shows the scope, and the host first when one is set.
- The registry schema-version test that checks `web/src/plugins/registry.tsx` literals against each plugin's constant passes with the bump.

## Out of scope

- One search across the launch directory and every open workspace at once, in a single result list.
- A control on the search tab for pointing it at a different workspace. Only the routes above change its scope.
- Searching a clone none of whose tabs is open. It's removed when its last tab closes anyway.
- Searching a remote tab's directory outside its provisioned workspace.
- Searching the workspace of a remote agent run on a run-only SSH connection (`agent on <host>:<path> ...`), which no tab rides. Its monitor is refused with the no-longer-available notice.
- Quick Open, the diff tab, and every other launch-directory feature keep their current scope.
- A far-side text-search operation for remote workspaces.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, local: open a workspaced harness and have it change a line in its clone. Select that text in the harness, right-click, and choose **Search for this**. The header reads `$workspace/<name>`, the match comes from the clone, and opening it opens the clone's copy. Press Cmd+Shift+F in the launch shell: the tab re-scopes to `$root` and reruns. Close the harness: the search tab closes.
- Manual, remote: from a remote workspaced harness, do the same. The header shows the host first, and opening a match opens a materialized copy whose save writes back. Close the remote harness while the search tab stays scoped there: the session stays up. Then re-scope to `$root`, and the remote session ends once nothing else holds it.
- Manual, refusals: choose **Search for this** in a harness whose clone is still provisioning, and in an editor whose clone has been removed. Each posts its exact notification and opens nothing.
