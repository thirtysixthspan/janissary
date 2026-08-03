# Tab Plugins

Janissary can ship bundled plugins that contribute persistent view tabs, file openers, and one command. Plugins are part of the Janissary build; there is no installation, marketplace, filesystem discovery, or third-party loading.

### Discovery and activation

At startup the server reads a static catalog of declarations. A declaration supplies the plugin identity and version, required tab-plugin API version, payload schema version, tab label prefix, claimed file extensions and content types, optional file-navigator edit gesture, optional command, and requested capabilities. Discovery does not import server behavior or fetch a client chunk.

A plugin activates only when one of its declared routes is used:

- `open <file>` or `open external <file>` resolves a claimed extension; or
- the first token matches the plugin's declared command, case-insensitively on a word boundary.

Core openers and commands resolve before plugin contributions. An extension or command may have only one owner; the first plugin to claim a name keeps it, and duplicate claims and claims of reserved commands are refused. A plugin whose claim is refused contributes nothing and starts disabled with that reason; the application still starts normally and every other plugin is unaffected. A refused claim also contributes no content type, so it cannot affect how the server labels a file it does not own.

A plugin's declared command is a second route into that plugin's own opener, never a second route into the registry. A target the command asks the host to open is refused unless it resolves to that plugin — including a web target, so `video https://example.com` and `video page notes.txt` report a non-video file rather than opening a browser tab.

Server activation has a 1000 ms deadline. Each opener, command handler, or intent has a 5000 ms deadline, covering plugin work only — files a command asks the host to open are dispatched after the handler returns, so a large wildcard open is never charged to the plugin. Concurrent first uses share one activation, and later uses reuse it.

### `plugins` command

`plugins` takes no arguments and lists every declaration without activating anything. Each line contains:

`<id> <plugin-version> api=<required-api> state=<declared|active|disabled>`

An active plugin also shows `activation=<milliseconds>ms`. A disabled plugin shows `reason=<recorded reason>`. The state lasts for the server process; restarting returns bundled plugins to `declared`.

### Plugin tabs

Every v1 plugin tab is a live, in-memory view tab. It inherits the creating tab's group and group color, receives a distinct dot color, can move into either split pane, and stays mounted while hidden so view state survives focus changes. Plugin tabs are not persisted or restored by `--relaunch` or profiles.

The wire view identifies the plugin, the payload schema version, and an opaque payload. Instance keys, source-tab ownership, and served-file reference ownership remain server-only. The host checks a stable instance key before asking the plugin to construct a payload, so reopening the same resource focuses the existing tab and registers no duplicate served file.

The client loads the declared chunk only when a matching plugin tab first exists. It validates the schema version and payload before rendering. Plugin components receive only authenticated resource URL construction, a tab-bound intent function, the host-rendered split action, and failure reporting; they do not receive the WebSocket client.

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

### Bundled video plugin

Video is the first production tab plugin. It contributes the common video extensions, the file-navigator external-open gesture, and `video <path>`. `video <path>` follows the same path parsing, wildcard expansion, existence checks, transcript provenance, deduplication, and playable-versus-external behavior as `open <video-file>`. See [[video-tab]] and [[open]].
