# Tab Plugins

Janissary can ship bundled plugins that contribute persistent view tabs, file openers, and one command. Plugins are part of the Janissary build; there is no installation, marketplace, filesystem discovery, or third-party loading.

### Discovery and activation

At startup the server reads a static catalog of declarations. A declaration supplies the plugin identity and version, required tab-plugin API version, payload schema version, tab label prefix, claimed file extensions and content types, an optional claim on web addresses, optional file-navigator edit gesture, optional command, optional host state to be told about, and requested capabilities. Discovery does not import server behavior or fetch a client chunk.

The requested capabilities bound what a plugin can do. A plugin that names a capability the API does not define never activates, and one that uses a capability it did not request is disabled the first time it tries — so the declaration is an accurate description of a plugin's reach rather than a claim nothing checks.

A plugin activates only when one of its declared routes is used:

- `open <file>` or `open external <file>` resolves a claimed extension;
- `open <url>`, `open page <address>`, or either with `external`, and the plugin claims web addresses; or
- the first token matches the plugin's declared command, case-insensitively on a word boundary.

Core openers and commands resolve before plugin contributions. An extension, a command, and the web-address claim may each have only one owner; the first plugin to claim one keeps it, and duplicate claims and claims of reserved commands are refused. What looks like a web address is the application's decision — an explicit `http`/`https` scheme, or any address preceded by the `page` keyword — and what one means is the claiming plugin's, so the address reaches it exactly as the user typed it. A plugin whose claim is refused contributes nothing and starts disabled with that reason; the application still starts normally and every other plugin is unaffected. A refused claim also contributes no content type, so it cannot affect how the server labels a file it does not own.

A plugin's declared command is a second route into that plugin's own opener, never a second route into the registry. A target the command asks the host to open is refused unless it resolves to that plugin — including a web target, so `video https://example.com` and `video page notes.txt` report a non-video file rather than opening a browser tab.

A plugin that asks to be told when host state changes but supplies no handler for it never activates successfully, and is reported as disabled with that reason.

Server activation has a 1000 ms deadline, as does handling one announcement of changed host state. Each opener, command handler, or intent has a 5000 ms deadline, covering plugin work only — files a command asks the host to open are dispatched after the handler returns, so a large wildcard open is never charged to the plugin. Concurrent first uses share one activation, and later uses reuse it.

### `plugins` command

`plugins` takes no arguments and lists every declaration without activating anything. Each line contains:

`<id> <plugin-version> api=<required-api> state=<declared|active|disabled>`

An active plugin also shows `activation=<milliseconds>ms`. A disabled plugin shows `reason=<recorded reason>`. The state lasts for the server process; restarting returns bundled plugins to `declared`.

### Plugin tabs

Every v1 plugin tab is a live, in-memory view tab. It inherits the creating tab's group and group color, receives a distinct dot color, can move into either split pane, and stays mounted while hidden so view state survives focus changes. Plugin tabs are not persisted or restored by `--relaunch`. A profile does save one, as the plugin that owns it plus the file it was opened on, and reopens it by issuing the same `open` a user would type (see [[profiles]]).

The wire view identifies the plugin, the payload schema version, and an opaque payload. Instance keys, source-tab ownership, and served-file reference ownership remain server-only. The host checks a stable instance key before asking the plugin to construct a payload, so reopening the same resource focuses the existing tab and registers no duplicate served file.

The client loads the declared chunk only when a matching plugin tab first exists. It validates the schema version and payload before rendering. Plugin components receive only authenticated resource URL construction, a tab-bound intent function, the host-rendered split action, which sidebar their tab is docked into, whether their tab is the currently visible one, a way to close their own tab, and failure reporting; they do not receive the WebSocket client. Because a hidden plugin tab stays mounted, the host is the only source of that visibility answer — a plugin that binds a window-wide key listener consults it rather than assuming it is on screen.

### Docking a plugin tab

A plugin tab can be docked into either sidebar and undocked back to the centre, exactly as the built-in dockable views can, and by the same means — the dock control shown on a docked tab, a profile that asks for it, and the plugin itself (see Placing its own tab). A docked plugin tab leaves the tab strip, so it has no position, group, or focus there; it appears instead in that sidebar's own tab switcher alongside whatever else is docked to the same side.

Docking into a side already holding a docked tab displaces that tab back to the centre only when the two are the same kind — for plugin tabs, that means the same plugin. Two tabs from different plugins share a sidebar the way the file navigator and the notifications feed already do.

Every docked plugin tab stays loaded while another entry in the same sidebar is showing, so switching between them preserves what each was displaying; only the one on screen is told it is visible. The sidebar frame, including the dock control, belongs to the application rather than to the plugin. A plugin is told which side it is docked to, so a view can lay itself out for a narrow sidebar without measuring the frame around it.

A profile captures a docked plugin tab with the side it was docked to, and reopens it docked there. A plugin tab opened on a file is reopened by opening that file again; one opened by a plugin's own command — a plugin that claims no file types at all — is reopened by reissuing that command.

### Changing what a tab shows

A plugin may replace what one of its own tabs shows after it has opened, addressing the tab by the same identity it was opened with. The tab keeps everything else — its name in the strip unless the plugin supplies a new one, its place in the strip, its group, its pane, whether it is focused, and the files it already serves — so a view that updates never jumps, steals focus, or reopens. Supplying a new name replaces whatever the tab is currently called, including a name the user gave it by renaming the tab.

An update aimed at a tab that is no longer open, or one belonging to a different plugin, does nothing at all: no view changes, nothing is reported, and the plugin keeps running. A plugin that produces a replacement its own contract rejects is disabled like any other broken plugin. A plugin cannot begin serving a new file through an update.

A plugin whose tab identity *is* what the tab shows may move that identity with an update — an embedded page navigating to another address is the one case in this version. The tab keeps its place, name, and served files; only what reopening it now refers to changes. An identity another of the same plugin's open tabs already holds is refused, and the rest of the update still applies.

### Being told when host state changes

A plugin may declare that it wants to be told when a named kind of host state changes, so a view can keep up with something the plugin does not own. The only such kind in this version is the set of scheduled commands, and what the plugin receives is the same aggregated list of schedules the application shows in its own schedules tab.

These announcements are deliberately narrow. One is sent only to a plugin that is already running and already has at least one tab open — a plugin nobody has used is never started by one, and a plugin with nothing on screen is never told about anything. The plugin is told which of its own tabs are open, so it does not have to track them itself, and it responds by changing what those tabs show. Nothing waits on the plugin, so a slow or broken one delays neither the application nor any other plugin: exceeding its deadline or failing disables that plugin alone, and a plugin cannot write to a transcript while handling one, since nobody asked it for anything.

An announcement says only that something changed, so a plugin may also ask for that state directly — which is what a view opening for the first time needs, before anything has changed. It may likewise act on that state, through the small set of actions each kind defines: for the scheduled commands, those are cancelling one entry, clearing them all, and switching to the tab an entry belongs to. Both are limited to the kinds of state the plugin declared an interest in, so a plugin can only ever read or change something the application already agreed to show it, and asking about anything else disables it like any other broken plugin.

### Reporting what a tab shows

A plugin may report the text currently visible in one of its own tabs, so a monitor watching that tab has something to feed on (see [[monitoring]]). What it reports stays on the server: it is never broadcast to any client, never persisted, and never read for anything but a monitor feed. It is addressed like any other tab a plugin owns, so a plugin can only ever report for its own tabs, and naming a tab that is no longer open does nothing.

### Placing its own tab

A plugin may dock one of its own tabs into either sidebar, or move it back to the centre strip, which is how a command like `schedules left` puts a view where it was asked to go. It addresses the tab the same way it does when changing what a tab shows, so it can never move another plugin's tab, and naming a tab that is no longer open does nothing. Docking a tab that is not the one on screen leaves the current tab alone; moving a tab back to the centre makes it active, exactly as the application's own dock control does.

### Intents and resources

Plugin client actions use the generic `pluginIntent` RPC with a tab label, intent name, and payload. The server finds the plugin identity and authoritative tab payload from its own open-tab record. A client cannot choose another plugin, filesystem path, or served-file identity by adding fields to an intent.

A plugin payload factory can register files through the host's existing `/open/<id>` allow-list. The host records every reference owned by that tab. Closing the tab deletes those references while leaving unrelated registrations intact.

### Failure and teardown

A plugin has two ways to say no, and only one of them is fatal. Answering a bad request — a malformed intent payload, an unknown intent name, a missing command argument — reports the reason and leaves the plugin running, its tabs open, and later requests working normally. An intent answered this way returns an ordinary error to the client.

An incompatible API, invalid declaration or payload, refused contribution claim, rejected import, activation throw or timeout, guarded handler failure, rejected or timed-out client chunk, schema mismatch, unknown client plugin, or render exception is the fatal kind and disables only that plugin for the rest of the process.

The visible message is exactly:

`Tab plugin "<id>" disabled: <reason>.`

The reason is one line, contains no stack, trims trailing punctuation, and ends with one period through the wrapper. The originating transcript always receives the message if that tab is still open. An already-open notifications feed receives the same message; failure never creates the feed or recreates a closed origin.

A disabled plugin owns no tabs. Failure before mount leaves no tab or served-file reference. Failure after mount closes every tab belonging to that plugin, releases their references, and disposes the activated plugin once. Later attempts do not import or call it again and report the recorded reason. Other plugins, tabs, and commands continue working. Restarting Janissary is the only way to retry a disabled plugin.

### Bundled image plugin

Image is a bundled plugin like any other: it contributes the common raster and vector image extensions and their content types, and both presentations of `open`. It declares no command and no file-navigator edit gesture, so `open <image>` and `open external <image>` behave exactly as they always have and a shift-activated image row still opens in the text editor. It answers no intents; the view's zoom, pan, and orientation are entirely client-side. See [[image-tab]] and [[open]].

### Bundled markdown plugin

Markdown is a bundled plugin like any other: it contributes the `.md` and `.markdown` extensions and their content type, and both presentations of `open`. It declares no command and no file-navigator edit gesture, so `open <file>.md` and `open external <file>.md` behave as they always have and a plainly activated Markdown row still opens in the text editor. It answers no intents; the view's scroll position is entirely client-side. Reopening a file that already has a markdown tab focuses that tab, the same de-duplication every plugin view gets. See [[markdown-tab]] and [[open]].

### Bundled page plugin

Page is the bundled plugin that claims web addresses, so `open <url>`, `open page <address>`, and either with `external` reach it rather than a built-in opener. It declares no extensions and no command. It answers what the user types into the address bar and what the embedded page relays back, moving the tab's identity to whatever address the tab has reached, and reports the page's visible text for a watching monitor. Everything the user sees is unchanged by its being a plugin, except that a page tab is now closed by its name like every other plugin tab, and reopening an address that is already open focuses that tab. See [[embedded-web-page]] and [[open]].

### Bundled schedules plugin

Schedules is the first bundled plugin that opens on no file. It claims no extensions and contributes only the `schedules` command, so it is reached solely that way and costs nothing until someone asks for it. It is told when the set of scheduled commands changes and redraws its list from that, reads the current entries when the tab first opens, and cancels an entry, clears them all, or switches to an owning tab through the actions that state defines. Everything the user sees — the command grammar, the singleton tab, both layouts, the selection keys, the confirmation before a delete, and profile capture and restore — is unchanged by its being a plugin, except that a docked list now shows the application's dock control in its own slim header above the list. See [[scheduling]].

### Bundled video plugin

Video is the first production tab plugin. It contributes the common video extensions, the file-navigator external-open gesture, and `video <path>`. `video <path>` follows the same path parsing, wildcard expansion, existence checks, transcript provenance, deduplication, and playable-versus-external behavior as `open <video-file>`. See [[video-tab]] and [[open]].
