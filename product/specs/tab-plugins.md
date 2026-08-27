# Tab Plugins

Janissary can ship bundled plugins that contribute persistent view tabs, file openers, and one command. Plugins are part of the Janissary build; there is no installation, marketplace, filesystem discovery, or third-party loading.

Tab plugins are one of two plugin families. The other, described in [[editor-plugins]], contributes keyboard-bound editing commands to the editor tab and runs entirely in the client; the two share no declarations, no catalog, and no API version.

### Discovery and activation

At startup the server reads a static catalog of declarations. A declaration supplies the plugin identity and version, required tab-plugin API version, payload schema version, tab label prefix, claimed file extensions and content types, an optional claim on web addresses, an optional claim on the `edit` command for the file types it already claims, optional file-navigator edit gesture, optional command, optional host state to be told about, an optional entry contributed for a file navigator selection, and requested capabilities. Discovery does not import server behavior or fetch a client chunk.

A plugin claiming `edit` supplies a third presentation beside the inline and external ones: the same file, opened for modification rather than for viewing. Whether a plugin owns the verb is read from the declaration alone, so asking the question never activates the plugin. A declaration that claims `edit` with no handler behind it disables that plugin at activation, exactly as a contributed selection action with no handler does and for the same reason — the command would otherwise be swallowed before anything could discover there is nothing to run, and the plain-text fallback would already be gone.

A plugin whose tab can hold unsaved work registers that work with the host, which then guards every close path on its behalf. The plugin supplies only three answers — whether there is unsaved work, how to save it, and how to return focus to the tab. The host decides when to ask, draws its own save-changes dialog, and owns what each button does; a plugin never renders a modal over the application, chooses a dialog's wording, or blocks a close indefinitely. A plugin that registers nothing closes immediately, as before.

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

### How a plugin tab is styled

A plugin owns its own appearance, and that appearance arrives with the plugin rather than with the application. A plugin's styling loads on the same occasion its behavior does — the first time one of its tabs exists — so a plugin nobody opens costs nothing to look at, and a plugin whose tab is open looks the same whether it was the first tab opened or the twentieth.

Plugin views that present the same shape share one plugin-wide look rather than each restating it: the metadata header above a body, the header's name and location, its right-aligned action group, and the centering, scrollable stage the image and video views fill. Sharing it means those views stay consistent with each other as that look changes, and it loads once for however many of them are open. Anything one plugin alone draws — the image editor's crop overlay, the audio playlist, the markdown document area, the schedule list's columns — belongs to that plugin alone.

The application keeps the styling of everything it draws itself, including the frames it wraps around a plugin tab, the tab strip, the sidebars, and the split control it renders into a plugin's header. Every theme reaches plugin views the same way it always has, so switching themes recolors a plugin tab exactly as it recolors an application tab.

### Docking a plugin tab

A plugin tab can be docked into either sidebar and undocked back to the centre, exactly as the built-in dockable views can, and by the same means — the dock control shown on a docked tab, a profile that asks for it, and the plugin itself (see Placing its own tab). A docked plugin tab leaves the tab strip, so it has no position, group, or focus there; it appears instead in that sidebar's own tab switcher alongside whatever else is docked to the same side.

Docking into a side already holding a docked tab displaces that tab back to the centre only when the two are the same kind — for plugin tabs, that means the same plugin. Two tabs from different plugins share a sidebar the way the file navigator and the notifications feed already do.

Every docked plugin tab stays loaded while another entry in the same sidebar is showing, so switching between them preserves what each was displaying; only the one on screen is told it is visible. The sidebar frame, including the dock control, belongs to the application rather than to the plugin. A plugin is told which side it is docked to, so a view can lay itself out for a narrow sidebar without measuring the frame around it.

A profile captures a docked plugin tab with the side it was docked to, and reopens it docked there. A plugin tab opened on a file is reopened by opening that file again; one opened by a plugin's own command — a plugin that claims no file types at all — is reopened by reissuing that command.

### Changing what a tab shows

A plugin may replace what one of its own tabs shows after it has opened, addressing the tab by the same identity it was opened with. The tab keeps everything else — its name in the strip unless the plugin supplies a new one, its place in the strip, its group, its pane, whether it is focused, and the files it already serves — so a view that updates never jumps, steals focus, or reopens. Supplying a new name replaces whatever the tab is currently called, including a name the user gave it by renaming the tab.

An update aimed at a tab that is no longer open, or one belonging to a different plugin, does nothing at all: no view changes, nothing is reported, and the plugin keeps running. A plugin that produces a replacement its own contract rejects is disabled like any other broken plugin.

An update may begin serving a file the tab did not hold before, which is what lets a view grow — the audio plugin's playlist gaining a track. A file registered this way belongs to the tab being updated exactly as one registered when it opened does, so closing the tab releases everything it ever served and nothing else.

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

A plugin payload factory can register files through the host's existing `/open/<id>` allow-list, both when a tab opens and when one is updated. The host records every reference owned by that tab. Closing the tab deletes those references while leaving unrelated registrations intact.

### Reporting a line to the notifications feed

A plugin may report one line of its own to the notifications feed, attributed to the tab it was invoked from. The grant is deliberately narrow: the plugin supplies text and nothing else — not the kind of event, not the tab it is attributed to, and not any link on the line — so a plugin can say that something happened without being able to dress it up as anything else. This is distinct from the failure line the application itself writes when a plugin breaks; a plugin can never report that about itself or about another.

The line obeys every rule the feed already has. It is dropped when no notifications feed is open, because plugin activity must never conjure the feed into existence. It is never suppressed for being about the tab the user is looking at, which is the case that matters most — a plugin reporting on the very view being watched. Like every capability it is gated by the declaration: a plugin that did not ask for it and reports anyway is disabled. See [[notifications]].

### Contributing an action for a file navigator selection

A declaration may contribute one entry for a **selection** of file navigator rows: a label to draw and an action name. It is the only route by which a plugin acts on more than one file at once, and the only navigator entry that acts on the selection rather than on the clicked row.

The application decides entirely when the entry is offered. It appears in a row's context menu only when the menu was raised on a row inside a multi-row selection, every selected row is a file whose type that one plugin claims, and the plugin contributes such an entry. Resolving this never activates the plugin — opening a menu is not a use of it. Activating it does: the application re-resolves the selected rows against that navigator's own root, refuses anything that is not a file inside it, and hands the plugin only absolute paths it already owns. The client never names a plugin or an action the application did not just offer it.

A declaration that contributes an entry but supplies nothing to run it never activates successfully, and is reported as disabled with that reason — a label the application would otherwise draw for a user before anything could discover it does not work. An action name the declaration does not carry is refused as one bad request and leaves the plugin running.

The file navigator itself learns nothing about what kind of files it is showing: the label comes from the declaration, and everything else the plugin does is its own.

### Failure and teardown

A plugin has two ways to say no, and only one of them is fatal. Answering a bad request — a malformed intent payload, an unknown intent name, a missing command argument — reports the reason and leaves the plugin running, its tabs open, and later requests working normally. An intent answered this way returns an ordinary error to the client.

An incompatible API, invalid declaration or payload, refused contribution claim, rejected import, activation throw or timeout, guarded handler failure, rejected or timed-out client chunk, schema mismatch, unknown client plugin, or render exception is the fatal kind and disables only that plugin for the rest of the process.

The visible message is exactly:

`Tab plugin "<id>" disabled: <reason>.`

The reason is one line, contains no stack, trims trailing punctuation, and ends with one period through the wrapper. The originating transcript always receives the message if that tab is still open. An already-open notifications feed receives the same message; failure never creates the feed or recreates a closed origin.

A disabled plugin owns no tabs. Failure before mount leaves no tab or served-file reference. Failure after mount closes every tab belonging to that plugin, releases their references, and disposes the activated plugin once. Later attempts do not import or call it again and report the recorded reason. Other plugins, tabs, and commands continue working. Restarting Janissary is the only way to retry a disabled plugin.

### Bundled image plugin

Image is a bundled plugin like any other: it contributes the common raster and vector image extensions and their content types, and both presentations of `open`. `open <image>` and `open external <image>` behave exactly as they always have.

It is the first plugin to claim the `edit` command for its own file types, so `edit <image>` — and Shift-activation of an image row in the file navigator, which sends that same command — reaches its editing presentation instead of the plain-text editor. It declares no command of its own and no file-navigator edit gesture. The edit presentation opens the tab under the same identity the viewer uses, the file's path, so an image already open as a viewer is focused and flipped rather than opened a second time.

It answers one intent: writing an edited image as a PNG over the original file. The client ships only pixels; the server takes the destination from the tab's authoritative original path. The viewer's zoom, pan, and orientation, and the editor's operation list, undo cursor, and canvas, remain entirely client-side. Its tab registers unsaved edits with the host, so the application's save-changes dialog guards every close path over it. See [[image-tab]] and [[open]].

### Bundled markdown plugin

Markdown is a bundled plugin like any other: it contributes the `.md` and `.markdown` extensions and their content type, and both presentations of `open`. It declares no command and no file-navigator edit gesture, so `open <file>.md` and `open external <file>.md` behave as they always have and a plainly activated Markdown row still opens in the text editor. It answers no intents; the view's scroll position is entirely client-side. Reopening a file that already has a markdown tab focuses that tab, the same de-duplication every plugin view gets. See [[markdown-tab]] and [[open]].

### Bundled page plugin

Page is the bundled plugin that claims web addresses, so `open <url>`, `open page <address>`, and either with `external` reach it rather than a built-in opener. It declares no extensions and no command. It answers what the user types into the address bar and what the embedded page relays back, moving the tab's identity to whatever address the tab has reached, and reports the page's visible text for a watching monitor. Everything the user sees is unchanged by its being a plugin, except that a page tab is now closed by its name like every other plugin tab, and reopening an address that is already open focuses that tab. See [[embedded-web-page]] and [[open]].

### Bundled schedules plugin

Schedules is the first bundled plugin that opens on no file. It claims no extensions and contributes only the `schedules` command, so it is reached solely that way and costs nothing until someone asks for it. It is told when the set of scheduled commands changes and redraws its list from that, reads the current entries when the tab first opens, and cancels an entry, clears them all, or switches to an owning tab through the actions that state defines. Everything the user sees — the command grammar, the singleton tab, both layouts, the selection keys, the confirmation before a delete, and profile capture and restore — is unchanged by its being a plugin, except that a docked list now shows the application's dock control in its own slim header above the list. See [[scheduling]].

### Bundled video plugin

Video is the first production tab plugin. It contributes the common video extensions, the file-navigator external-open gesture, and `video <path>`. `video <path>` follows the same path parsing, wildcard expansion, existence checks, transcript provenance, deduplication, and playable-versus-external behavior as `open <video-file>`. See [[video-tab]] and [[open]].

### Bundled audio plugin

Audio is the bundled plugin whose tab owns a **playlist** rather than a file. It contributes the common audio extensions, the file-navigator external-open gesture, `audio <path>`, and an **Add to playlist** entry for a selection of audio rows. `audio <path>` follows the same path parsing, wildcard expansion, existence checks, transcript provenance, and playable-versus-external behavior as `open <audio-file>`.

It is the first plugin whose tab is a singleton by design: it opens under one fixed identity, so a second open finds the tab already there and appends to it through an update that begins serving the new track. It answers two intents — make a queued entry current, and drop one — and derives everything else from those: a track ending is the client asking for the next entry, stopping on the last track is the client asking for nothing, and a track the browser cannot decode is a drop carrying a flag that additionally reports the file to the notifications feed. The queue is the server's; a client can only ever name an entry the server already holds. See [[audio-tab]] and [[open]].
