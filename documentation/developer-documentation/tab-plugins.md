# Tab plugins

Janissary's tab-plugin API is for trusted plugins bundled in this repository. A plugin may contribute file extensions, one command, and a persistent center-tab body. It cannot be installed at runtime and is not sandboxed.

The authoritative types are `src/plugins/api.ts`, `web/src/plugins/api.ts`, and `src/protocol.ts`. The examples below use `satisfies` and the permanent `fixture-v1` modules, so the test suite typechecks and runs the same contract described here.

## Smallest working example

Start with the frozen fixture:

- `src/plugins/fixture-v1/manifest.ts`
- `src/plugins/fixture-v1/shared.ts`
- `src/plugins/fixture-v1/activate.ts`
- `web/src/plugins/fixture-v1/index.tsx`

Its manifest is pure data:

```ts
export const fixtureV1Manifest = {
  id: 'fixture-v1',
  version: '1.0.0',
  apiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: FIXTURE_PAYLOAD_SCHEMA_VERSION,
  tabLabelPrefix: 'fixture',
  fileExtensions: { '.janissary-plugin-v1': 'text/plain; charset=utf-8' },
  command: 'fixture-v1',
  capabilities: ['note', 'openOrFocusTab', 'rejectRequest', 'reportFailure'],
} as const satisfies TabPluginDeclaration;
```

`src/plugins/documentation.test.ts` pins this block, and the capability list below, to the real
files — so neither can drift from what the repository ships.

The server activation opens one resource-backed payload and echoes one intent. The client entry exports a payload guard beside its component. Compatibility tests open the tab, validate the payload in both projects, round-trip the echo intent, release the file reference, and dispose the activation.

The fixture is deliberately absent from production catalogs. Copy its shape for a new plugin; do not add the fixture itself to a loader map.

## Files to add

For plugin `example`, add:

```text
src/plugins/example/manifest.ts
src/plugins/example/shared.ts
src/plugins/example/activate.ts
web/src/plugins/example/index.tsx
```

Keep additional server helpers under the first directory and React components/hooks under the second. `shared.ts` must import nothing. It defines the payload schema number, payload and intent types, and runtime guards used on both sides.

Then register three pure/lazy edges:

1. Import only the manifest from `src/plugins/catalog.ts`.
2. Add a literal `import('./example/activate.js')` to `src/plugins/loaders.ts`.
3. Add a literal `import('./example/index')` and schema pairing to `web/src/plugins/registry.tsx`.

Literal imports make the modules visible to TypeScript, Vite, Knip, and tests while preserving lazy execution. Do not add runtime discovery or a second client manifest.

## Declaration reference

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable identity used by catalogs, loaders, configuration, wire envelopes, and errors |
| `version` | yes | Plugin semantic version |
| `apiVersion` | yes | Host tab-plugin API integer required by the plugin |
| `payloadSchemaVersion` | yes | Positive integer for this plugin's tab payload |
| `tabLabelPrefix` | yes | Prefix for host-allocated unique labels |
| `fileExtensions` | yes | Dot-prefixed extension to MIME type; use `undefined` for external-only formats |
| `webTargets` | no | Claims the `open` command's web branch: an `http`/`https` address, or any address preceded by the `page` keyword |
| `editGesture` | no | `open external` for a file-navigator edit activation |
| `command` | no | One case-insensitive first-token command |
| `agentNamedTabs` | no | Name each tab from the agent-name pool, as an unnamed agent tab is, and show that name as its title; `tabLabelPrefix` and your title are the fallback once every name is held |
| `playable` | no | Every extension in `fileExtensions` is something `play` may dispatch to your inline opener |
| `spawnTerminal` | no | Asks for the `spawnTerminal` resource — the right to start a process from a payload factory, in a directory inside the project root. Without it, calling that resource throws rather than quietly doing nothing |
| `notifications` | no | Host topics to be told about; a declaration naming one must supply `notify` |
| `hostState` | no | Host state pushed into your payloads: `connections`, `schedule`, or both. A declaration naming any must supply a `hostState` handler |
| `chords` | no | Canonical chord ids claimed while one of your tabs is the visible one |
| `capabilities` | yes | Requested names from the v1 server capability set; the host grants only these |

Core openers and commands have priority. Claims are unique, and commands may not use a built-in or reserved route name. A refused claim does not throw: the first plugin to claim a name keeps it, the loser contributes nothing and starts disabled with the reason, and the app still starts. Only a claimed `open` route or command activates server behavior.

## Server activation

Export `activate()` returning:

```ts
type TabPluginActivation = {
  opener: {
    inline(file, capabilities): void | Promise<void>;
    external(file, capabilities): void | Promise<void>;
  };
  command?(argument, capabilities): void | Promise<void>;
  intent(request, capabilities): unknown | Promise<unknown>;
  isPayload(value: unknown): boolean;
  dispose?(): void | Promise<void>;
};
```

The host supplies twenty-seven capabilities:

- `note(text)` writes to the originating transcript.
- `notifyUser(text, options?)` reports one line to the notifications feed. Text plus, at most, one file to link — you say that something happened; the host chooses the event type, the attribution, and whether it toasts or is shown directly in an already-visible feed. A link is how you offer something too long to read in place, the way the `sql` plugin links the whole result of a query from a line that only says how many rows came back; it is an absolute path opened with the host's ordinary `edit`, not a `registerFile` reference, because a notification outlives the tab that produced it. The line is never lost even when the feed isn't on screen — it's held in the notification queue either way. A line is attributed to the tab you were invoked from, which a `notify` handler doesn't have, so pass `tab` with one of your own instance keys — `notifyUser(text, { tab: key })` — to have the line carry that tab's name and colour instead. A key you have no open tab for falls back to the invoking tab, so you can't attribute a line to a tab you don't own.
- `openOrFocusTab(instanceKey, factory)` focuses or creates a plugin tab.
- `updateTab(instanceKey, factory)` replaces what one of your own tabs already shows.
- `setUnread(instanceKey, unread)` sets the unread badge on one of your own tabs. Raising it arms the standard 30-second waiting notification only when the tab is eligible for a badge; clearing it cancels the pending notification.
- `dockTab(instanceKey, dock)` docks one of your own tabs into `'left'` or `'right'`, or undocks it back to the centre strip with `null`.
- `snapshotTab(instanceKey, text)` caches the text currently visible in one of your own tabs, so a monitor watching it has something to feed on.
- `openClaimedFiles(target)` runs the host's `open` pipeline for `target`, pinned to your opener.
- `projectFileList()` reads the project's gitignore-aware file list — the same list Quick Open searches — as project-relative paths plus the directory they are relative to. It is how a plugin that scans the repository stays in step with the rest of the application rather than growing its own walker.
- `openInEditor(absPath, line)` opens a file in an editor tab with the cursor on that line, through the ordinary `edit` pipeline: an already-open file is focused rather than duplicated, the line is centered, and the file is served by the authenticated `/open/<id>` allow-list like any other editor open. This is the route for a plugin that has to put a user on a specific line, which `openClaimedFiles` cannot express — it is pinned to your own claimed extensions and takes no line. **A path outside the project's launch directory is refused**, and the refusal is silent: this capability is the whole of a plugin's reach over the filesystem, so the boundary is enforced here rather than left to each plugin that asks.
- `topicData(topic)` reads what a topic you declared carries right now.
- `topicAction(action)` asks the host to perform one of the actions that topic defines.
- `configuredViewer()` reads the viewer configured for this plugin id.
- `openExternally(path, application?)` asks the OS to open a file.
- `readSettings()` reads your plugin's own remembered settings from the `pluginSettings` map in `.janissary/config.json`, keyed by your plugin id, or `{}` when you have saved none. Treat every field as untrusted: the user can edit the file by hand, so check each value's type and fall back to a default rather than assuming the shape you last wrote.
- `isRecordingLive(absPath)` answers whether a tab the user can see is recording that exact file right now. A plugin reaches no tab list of its own, so this is the only way to tell a file that is still being written from one that is finished — which the file itself usually cannot: a recording ends when its tab closes just as surely as when its process exits, and only the tab that is still there knows. The asciicast plugin uses it to decide whether a recording it is about to play is a live session.
- `saveSettings(settings)` replaces your plugin's own entry in that map and answers whether the write succeeded. The file is replaced atomically and every other plugin's entry is left alone. A value that is not a plain JSON object is a bug in your plugin and disables it. The search tab uses the pair to remember its three toggles across restarts.
- `originTab()` reports the tab a plugin command was invoked from: its label, working directory, project root, and workspace clone when it has one. A command handler is handed the argument and its capabilities and nothing else, so this is the only way one learns what the user was standing in when they asked for it. The host already resolves that tab for `note` and `openOrFocusTab`; this makes the same resolution readable rather than new. A label with no open tab answers `null`. The answer carries `remote: true`, and only then, when the tab's session runs on another host. Its directory belongs to that host rather than this filesystem, which is why the shell tab refuses to open from one.
- `dispatchLine(line)` offers one line to the application's own command dispatcher and answers whether it ran. It uses the tab the line was answered from — the plugin tab itself when a client dispatched it, and the tab the plugin was invoked from when a command or selection action did. A line that resolves to nothing answers `false` and is yours to handle. Deliberately one call rather than a resolve-then-decide pair: the command table is consulted once, in the one place that owns it, and is never copied into a plugin where a newly added command would be invisible. A line resolving to the reserved `shell` route answers `false` too — that route is not a command.
- `dispatchLineWithOutput(line)` returns the application's dispatch decision and any text reply, so a terminal-backed plugin can display the command output in its own terminal.
- `completeLine(line, cursor)` returns the completion the application's own command bar would show, in the same shape, so a plugin whose tab has a command line is not maintaining a second completion source.
- `terminalRunning(ptyId)` answers whether a terminal you spawned is still running. A client that reconnects learns nothing about what happened while it was away — the exit event was broadcast to nobody — and a plugin tab is in-memory only, so the tab is still there holding the payload of a shell that finished minutes ago. This is how a tab learns that and closes rather than waiting for input that can never arrive.
- `queueLine(line)` adds a line to the back of the answering tab's own command queue — the queue an agent tab holds, which the state broadcast lists and the queue popup edits — so a plugin tab with a command line can hold lines while its process is busy instead of keeping a second queue.
- `nextQueuedLine()` removes and returns the front of the answering tab's command queue, or `null` when it is empty. The plugin decides when to drain, since only it knows when its process is ready for the next line.
- `recordCwd(cwd)` records the answering tab's working directory — the directory `originTab` reports and the host's own actions on that tab start from. A plugin whose process changes directory on its own calls it, so a shell opened from that tab, its file navigator, and its completion all follow.
- `rejectRequest(reason)` answers one bad request without disabling the plugin.
- `reportFailure(reason)` exits through the guarded failure boundary and disables the plugin.

Your declaration decides which of them you actually get. A name it omits is still present on the capability object — the type is the whole contract — but calling it throws `used capability "<name>" without declaring it`, which crosses the failure boundary and disables the plugin. Declaring a capability you never call is harmless; calling one you never declared is a bug in your manifest, caught the first time that line runs. Keep the list to what you use.

## Updating a tab you already opened

A tab's payload is produced once, by the factory `openOrFocusTab` runs. `updateTab` is how it changes afterwards: name the instance key the tab was opened with, and return the new payload — and a title, when the name in the tab strip should change with it.

```ts
capabilities.updateTab(file, (resources) => ({ title: basename(file), payload: { …next } }));
```

The tab keeps everything else: its label, position, group, focus, instance key, schema version, and the files it already serves. A factory that returns no title leaves the current title alone, so a plugin with nothing to say about naming never overwrites a name the user chose; a factory that returns one replaces whatever is there, including that rename.

An instance key you have no open tab for is a no-op, so you never have to track which of your tabs the user has since closed. The result is validated exactly as a created payload is — your own `isPayload` guard, JSON compatibility, and a nonempty title when one is supplied — and failing that check disables the plugin, because a payload your own contract rejects means the plugin is broken.

The factory receives the same `TabPluginResources` the `openOrFocusTab` one does, so an update may begin serving a file the tab did not hold before — the audio plugin's playlist gaining a track. Every reference it registers is recorded against the tab being updated, so closing that tab releases what an update served exactly as it releases what the open served.

You can change the instance key, but only when the key *is* what the tab shows and that has moved — an embedded page navigating to another address. Return the new key alongside the payload:

```ts
capabilities.updateTab(current.url, () => ({
  instanceKey: next.url, title: next.domain, payload: next,
}));
```

A key another of your open tabs already holds is refused, because two tabs answering to one key would make every capability that addresses one ambiguous; the payload and title still apply. If your tab's identity does not move — a file, a singleton list — leave the field alone and the key stays as it was.

## Docking into a sidebar

Your tab can be docked into either sidebar, by the `setDock` RPC behind the dock control the host renders for it, or by a profile entry carrying `dock`. You write no code for this: the host owns the sidebar frame exactly as it owns the centre one, and your component renders the same either way. Three consequences are worth knowing:

- a docked tab leaves the tab strip, so it has no position, group, or focus there;
- every docked plugin tab stays mounted while another entry in the same sidebar is showing, and `active` becomes "am I the selected entry in this sidebar"; and
- a side displaces an existing occupant only when the same plugin owns it, so tabs from different plugins share a sidebar the way the file navigator and the notifications feed already do.

## Being told when host state changes

`updateTab` covers what you already know. When the thing your view shows belongs to the host and moves on its own, declare a notification topic instead and the host will tell you:

```ts
notifications: ['schedules'],
```

A declaration naming a topic must supply a `notify` handler, or the plugin is disabled the moment it activates. The handler receives the topic, the current data for it, and the instance keys of your own open tabs, and acts by calling `updateTab`:

```ts
notify: (event, capabilities) => {
  for (const key of event.tabs) capabilities.updateTab(key, () => ({ payload: { rows: event.data } }));
},
```

v1 defines four topics, and a fifth kind of state reaches a plugin the same way: `schedules` (the aggregated scheduled-command rows), `conversations` (the conversation list, windows, and model pairs), `sessions` (the remote-session rows), and `databases` (which SQLite databases exist, and the recent answers to the requests a plugin has issued against them). A topic is always a named, already-coalesced signal — never the raw state broadcast, which fires on essentially every mutation including per-keystroke shell output.

A notification tells you a topic changed, which leaves two gaps a view has to fill on its own. `topicData(topic)` closes the first: it reads what the topic carries right now, which is what you need when you are building a tab for the first time and no notification has fired yet. `topicAction(action)` closes the second: it is how you act on what you are showing. Each topic names its own actions — `schedules` defines `cancel` (drop one row), `clear` (drop them all), and `focusOwner` (focus the tab a row belongs to, refused for a tab that owns no row):

```ts
capabilities.topicAction({ topic: 'schedules', action: 'cancel', tab, id });
```

Both are scoped to topics your manifest declared. Reaching for one it did not name throws `used topic "<name>" without declaring it` and disables the plugin, exactly as an undeclared capability does — a plugin may act only on state the host already agreed to show it.

A topic whose action needs a round trip carries a **request id**, and the answer comes back on the next notification carrying the same one. `databases` is the example: `topicAction` returns nothing, so a plugin mints an id, records in its tab payload that it is waiting for that id, and folds the matching answer in when it arrives. Keep the id and the follow-up together in the payload — `pending: { id, followUp }` — so "what do I do once this lands" is part of the request rather than a guess made during the notification. Mint it with `randomUUID()` rather than a counter: the host echoes the id rather than issuing it, so two plugins on one topic cannot collide on `q1`. If an answer never arrives — evicted, or the delivery predates the request — re-issue rather than leave the tab waiting on a request nobody will answer.

The delivery rules are narrow on purpose:

- a notification never activates a plugin, and never reaches one with no open tab, so a plugin nobody has used costs nothing;
- handlers run guarded with a 1000 ms budget, tighter than the 5000 ms a user-initiated call gets, and fan out concurrently with no ordering guarantee between plugins;
- the return value is ignored: a notification reports that something happened and cannot influence any host outcome;
- `note` writes nowhere during one, since background work has no originating transcript; and
- a throw or a timeout disables that plugin alone, exactly as any other guarded call does.

## Contributing a command

A declaration that claims `command` must supply a `command` handler. It receives everything after the first token, so `video ~/clips/*.mp4` arrives as `~/clips/*.mp4`. A command that opens files should hand the whole argument to `openClaimedFiles` rather than parse it:

```ts
command: (argument, capabilities) => {
  if (!argument) return capabilities.rejectRequest('Usage: video <path>');
  capabilities.openClaimedFiles(argument);
},
```

That makes the command a second route into your own opener rather than a second behavior. Relative-path resolution, `~` expansion, wildcards, sorted processing, the ten-file limit, and missing-file errors are all the host's and stay identical to `open`. A file that resolves to somebody else's opener is refused, so `video notes.txt` reports a non-video file instead of opening the text editor. The refusal covers web targets too, which `open` resolves before it ever consults the opener registry: `video https://example.com` and `video page notes.txt` are both refused rather than opening a browser tab.

## Being played by `play`

A `command` claim covers a command you own the name of. It cannot cover `play`, which is a built-in, so a plugin cannot own that name for itself. A `playable` claim covers the case instead:

```ts
playable: true,
```

`play <file>` resolves its target the way `open` does, reads the extension, and asks the same opener registry which plugin owns it — handing your `opener.inline` the resolved path through the same guarded, budgeted, failure-isolated path the `open` pipeline uses. Nothing about path resolution, activation, or the deadline is restated in the command, and there is no handler to supply: the opener `play` needs is the one you already have.

It is a flag over the extensions you already claim rather than a list of its own, so the playable types cannot drift from the claimed ones, and it is the only way the host knows which claimed types are something to play. The asciicast plugin is the worked example: `.cast` reaches its tab through both `play <file>` and the plain `open <file>.cast`, with no second claim and no second code path. A plugin that claims an extension without the flag — an image viewer, say — is never a `play` target, so a file nothing plays is refused by name instead of opening whichever viewer can read it.

## Rejecting versus failing

`rejectRequest` and `reportFailure` look similar and are not interchangeable:

| | `rejectRequest(reason)` | `reportFailure(reason)` |
| --- | --- | --- |
| Means | this request was wrong | this plugin is broken |
| Plugin afterwards | still active | disabled until restart |
| Its tabs | untouched | all closed, resources released |
| Reason reaches | transcript, or the RPC caller | transcript and notifications, as the standard disabled message |

Everything a caller could get wrong — a malformed intent payload, an unknown intent name, a missing command argument — is a rejection. Reserve `reportFailure` for state only your own code controls. The video plugin rejects a bad `capture-frame` payload but reports a failure on an invalid tab payload, because the tab payload is the host's own record rather than client input.

Use `openOrFocusTab` like this:

```ts
capabilities.openOrFocusTab(file, (resources) => ({
  title: path.basename(file),
  payload: {
    name: path.basename(file),
    resource: resources.registerFile(file),
  },
}));
```

The host checks `instanceKey` before calling the factory. Register served files only inside it. The host validates a nonempty title, JSON-compatible guarded payload, and owns all returned references until the tab closes.

## Client entry and capabilities

The entry default-exports a component and named-exports the shared guard:

```tsx
export { ExampleTab as default } from './ExampleTab';
export { isExamplePayload as isPayload } from '@shared/plugins/example/shared';
```

Write the shared guard as a type predicate — `(value: unknown): value is ExamplePayload` — because the registry infers your payload type from it. Your component then declares `payload: ExamplePayload` and receives it already validated, rather than taking `unknown` and asserting its way back to a type the guard had already proven.

The component receives `payload` only after the registry wrapper has validated it, plus:

- `resourceUrl(reference)` for an authenticated `/open/` URL;
- `intent<Result>(name, payload)` bound to this tab;
- `splitAction`, a ready-rendered host action or `null`;
- `dock`, which sidebar this tab is docked into (`'left'`, `'right'`, or `null` for the centre strip). Placement is host-owned, so a plugin that lays itself out differently in a narrow sidebar — the schedules plugin's compressed one-line rows, for instance — reads it here rather than measuring the frame around it;
- `active`, whether this tab is the visible one in its pane — or, when the tab is docked into a sidebar, whether it is the selected entry there. Every v1 plugin tab stays mounted while hidden, so a component that binds a window-wide listener — the image plugin's zoom and pan keys, for instance — must gate it on this rather than assume it is on screen. Never infer it from the DOM: the host owns the frame;
- `label`, this tab's own label, stable for as long as it is open. A view that keys per-tab state on something — `useStatusWindows` re-arms its auto-show when it changes — has no other way to learn it, since a plugin must not read the DOM;
- `claimedChords`, the chord ids your declaration's `chords` claim was accepted for, as the host put them on this tab's view. Read them here rather than writing the list out in your component: the host validated the claim at activation, and a second copy is a second thing that can disagree with the claim actually enforced, with nothing to notice when it does. Absent means you claimed none;
- `attachTerminal(ptyId, onData)`, optional, attaches to a terminal this tab owns — the id your payload carries — and hands every byte it produces to `onData`. Bytes already produced are flushed into `onData` before this returns, so attaching late still renders what the shell said before you did. The handle it returns offers `write`, `resize` and `onExit(handler)`, which fires once when the process behind the terminal has exited: a plugin holding a terminal whose process is gone cannot tell, because nothing on this side reports a death it did not witness. Call its `detach` on teardown, or a hidden tab — and every v1 plugin tab stays mounted while hidden — keeps a live subscription to a terminal nothing is rendering. A plugin with no terminal behaves exactly as it did before this existed, which is why it is optional;
- `openFileNavigator()` and `launchAgentHere()`, optional, the two actions a tab's metadata row offers: open a file navigator rooted at this tab, and launch an agent in this tab's directory. They are capabilities rather than lines to dispatch because they are not the same thing — the agent action roots the new tab at *this* tab's cwd and joins its group, which a command run in this tab does not — so `files` and `agent` dispatched from your bar are not substitutes. Optional for the same reason as `attachTerminal`;
- `close()`, which closes this tab. Use it for a close affordance inside your own body, and for the case that makes it a callback rather than a rendered control: a body hosting a cross-origin surface never sees the host's Cmd+W at all, so the page plugin answers for the browser-level close itself; and
- `reportFailure(reason)` for an unrecoverable client-contract failure. Only the first report per plugin is sent, whichever tab or code path raises it, so calling it from your own component is safe alongside the failures the host detects for you.
- `copyText(text)` writes text to the system clipboard, through the same helper every other surface in the application copies with. A plugin with its own terminal needs it: a lazily loaded chunk that grew its own copy would be a second implementation, and the fallback chain is the fiddly part.

It never receives `JanusClient` or imports host UI internals. The host owns the `.tab-body`, focus border, visibility, split placement, loading fallback, and error boundary. Every v1 plugin tab remains mounted while hidden.

## Intents and validation

`pluginIntent` sends `{ tab, intent, payload }`. The host looks up plugin identity and authoritative tab payload from the server's open-tab record, then calls the activated plugin. The request needs no schema field because the record already owns the versioned payload. Validate the intent payload and tab payload in the plugin before using either.

Return a JSON-compatible value. An intent result travels back to a waiting client, so unlike an opener or a command it may not simply fall off the end of the handler: `undefined` is not JSON, and the host treats it as a produced-invalid-result failure that disables the plugin. Return `null` when the intent has nothing to report — this is what the video plugin's `open-external` does.

`pluginFailed` sends `{ tab, reason }`. It is for load, schema, validation, timeout, and render failures that make the plugin unusable—not ordinary domain outcomes a component can render, such as an unsupported video codec.

Both generic RPC shapes are validated before host dispatch. Served files remain behind the session token, Host/Origin checks, and explicit allow-list.

## Lifecycle and diagnostics

The budgets are 1000 ms for server activation, 5000 ms per server opener, command, or intent, and 5000 ms total for a client chunk plus first mount. The handler budget covers your code only — files opened through `openClaimedFiles` run after the guarded call returns. Concurrent first server requests share one activation promise. `plugins` reports `declared`, `active` with activation milliseconds, or `disabled` with a reason, without activating anything.

An incompatible contract, a refused contribution claim, load or activation failure, invalid produced payload, guarded-call failure, client load/schema/validation/timeout failure, or render exception disables only that plugin until restart. The host reports `Tab plugin "<id>" disabled: <reason>.`, closes all of its tabs, releases their served files, and disposes it once. Other plugins and core continue.

## Reaching a plugin from a keyboard chord

A plugin whose command opens a singleton tab can be given a global chord. The chord belongs to the **host**, not the plugin: the client key handler issues the same command the user would type, so the plugin gains no new route and no way to be reached that its own declaration does not already describe. The search tab works this way — Cmd+Shift+F runs `search`, which opens or focuses the one search tab.

Two rules follow from the chord living in the host. A chord must not shadow an existing one, and where two chords share a key the more specific is matched first: the transcript search's Cmd+F tests only the key, so a plugin wanting Cmd+Shift+F has to be matched ahead of it or it will never fire. Pin both halves in a test — that the new chord does what it should, and that the old one still does.

## Testing a plugin

Add server tests for declaration claims, playable/external routes, payload validation, deduplication before factory work, command routing, intent round trips, rejection leaving the plugin active, failure, cleanup, and disposal. Add client tests for the entry guard, lazy load, rendering, actions/intents, persistent mounting, and contained failure. Run `./scripts/run.mjs check-diff`, then confirm the production web build emits the client entry and its shared contract as a separate chunk — inspect the build source maps rather than trusting the file list, since a stray runtime import in the registry moves modules into the entry without changing how many chunks appear.

## API changelog

### v1

- Initial bundled-only tab-view contract.
- Static opener, web-target, command, and notification contributions, with `command` and `notify` handlers on the activation.
- Twenty-seven server and fourteen client capabilities. `projectFileList` and `openInEditor` were added within v1, for the search tab: a plugin that scans the repository reads the same gitignore-aware list Quick Open searches, and one that has to put a user on a specific line opens an editor tab through the ordinary `edit` pipeline rather than growing a second open path. `readSettings` and `saveSettings` followed, so the search tab can remember its toggles in `.janissary/config.json` without a plugin reaching the config itself. `isRecordingLive` and the client-side `copyText` followed for the asciicast tab, which has to tell a live recording from a finished one and has its own terminal to copy out of. `setUnread` lets the shell tab raise a background waiting badge with the same delayed notification as a harness tab. `dispatchLineWithOutput` lets the shell display application-command replies locally, and `queueLine` and `nextQueuedLine` let it hold command-bar lines in its own tab's command queue while zsh is busy. `recordCwd` keeps a shell tab's recorded directory on the directory zsh is in, so a shell opened from it starts there. All are additive optional capabilities, so the API integer is unchanged.
- Versioned generic tab payload plus `pluginIntent` and `pluginFailed` RPCs.
- Two-level failure model: `rejectRequest` answers one bad request, `reportFailure` disables.
- `notifyUser` takes an optional `tab` instance key, attributing the line to one of the plugin's own tabs. Additive, so still v1.
- `spawnTerminal` joins `TabPluginResources` rather than the capability set: a tab's label is allocated only after its payload factory returns, so the window `registerFile` is already scoped to is the only scope in which a terminal has a tab to belong to. The host owns the session from the moment it is spawned — released on tab close, on plugin dispose, and on plugin disable — so a plugin never holds a process handle. It is asked for with the `spawnTerminal` declaration field rather than arriving with every plugin, because starting a process in any directory is the most powerful thing a plugin can ask for and belongs in the manifest a reader reviews. Its `cwd` must be inside the project root, measured against `launchDir` by the same `isInsideRoot` that `openInEditor` measures a plugin's file path against, and the host throws rather than starting an interactive shell anywhere else; a workspace clone is inside the root, so naming one is allowed. Its `args` default to none, which runs the shell as the user configured it; there is deliberately no "run one command through the shell" case as there is on the host's own terminals, because a plugin wanting a command's output wants it back and a spawned terminal does not give it. A `workspace` passed with the options confines the process through Seatbelt exactly as that tab's own shell is confined; without one it runs where the plugin said, like any other unconfined shell.
- `originTab`, `dispatchLine` and `completeLine` were added for the shell tab, which has a command line in a tab that is not an agent tab and therefore no route to the dispatcher, the completion RPC, or the tab a command was typed in. `dispatchLineWithOutput` lets that terminal display text replies locally. `originTab` later gained an optional `remote: true`, omitted for a local tab, so the shell can refuse a remote origin. All of it is additive and leaves the API integer unchanged.
- `hostState` pushes the tab's own connection and schedule rows into a plugin's payload when they differ from what was last pushed, so a plugin that renders the host's own status windows is not maintaining a second computation of either list or polling for changes. Delivered like a notification: only to a plugin that is active and owns a tab, guarded, concurrent, return value ignored.
- `chords` lets a declaration claim a chord while one of its tabs is the visible one, which is the inverse of the overlay-plugin rule that a core chord always wins. A claimed chord runs the handler the mounted body registers; a claim no body answers falls through to the application unchanged.
- `attachTerminal`, `openFileNavigator` and `launchAgentHere` on the client capability object, along with `label` and `claimedChords`, and the published `StatusPanels`, `useStatusWindows`, terminal selection registration and `workspacedIcon`, so a plugin whose tab is a terminal is not maintaining a second copy of any of them.

Additive optional fields, capabilities, and hooks remain v1-compatible. Removals, renames, tighter types, changed payload meaning, or observable ordering changes require a new API integer and are major changes. Introduce a replacement and deprecation window before removal. Keep the v1 fixture until v1 is formally removed; future deprecations and removals belong in this section.
