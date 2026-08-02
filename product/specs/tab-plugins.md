# Tab plugins

Tab plugins are bundled, trusted extensions that add one live center-area tab type and optionally
the command or file-opener trigger that creates it. They let a new tab body remain additive without
adding a concrete payload, RPC, or rendering branch to the core protocol. Video is the first
production tab plugin; a frozen fixture exercises API v1 in tests.

This is an internal extension seam, not an installation system. Janissary loads only plugins listed
in its production catalogs. It has no third-party discovery, marketplace, hot reload, configuration
screen, or enable/disable UI.

## Static discovery and activation

Each plugin has a side-effect-free manifest. The manifest declares its id and version, required host
API version, tab payload schema version, tab title and label prefix, requested capabilities, and any
command, extension, MIME, or file-navigator edit claims. Janissary can resolve those claims without
loading plugin behavior.

Behavior loads only after a declared trigger matches:

- Core command routes resolve before contributed commands. A contributed command is a
  case-insensitive first token with a word boundary, and every command name has one provider.
- File openers use the existing first-match registry. Duplicate extension and MIME claims are
  registration failures rather than an ordering mechanism.
- Matching a command or opener starts one shared activation. Concurrent first uses await that same
  activation, and later uses reuse its result.
- A plugin handler is awaited. Wildcard file opens retain their sorted, sequential order; separate
  user invocations may overlap. Returning nothing means the handler completed without opening a tab.

The server has 1,000 ms to import and activate a plugin. Each user-initiated command, opener, intent,
validator, or disposer has a 5,000 ms boundary. The client has one 5,000 ms budget covering both its
chunk import and activation. Server status is observable for diagnostics as inactive, activating,
active, disabled, or unknown, with activation duration when activation was attempted.

## Tabs and capabilities

A plugin opens a tab only through the host capability. It supplies a stable instance key, title, and
a factory for its versioned payload. Before running that factory, the host checks for an existing tab
with the same plugin id and instance key. A match focuses the existing tab without allocating another
served-file reference or constructing another payload.

The host still chooses the unique label, dot color, group insertion, active index, pane, visibility,
border, split placement, and close behavior. Plugin tabs stay mounted while hidden, so ephemeral UI
state such as video playback survives focus changes. They are live and in-memory: they are not saved
for `--relaunch` or profiles.

Server plugins receive only transcript reporting, plugin-tab opening, tab-owned file registration,
their configured external viewer, and detached external opening. Client plugins receive only
authenticated URL construction for a tab-owned file reference, an intent function already scoped to
their tab, and a host-created Split action. They do not receive managers, the controller, a raw
socket, `JanusClient`, a tab session, or private host UI modules.

Any file registered while constructing a plugin tab belongs to that tab. Failed construction removes
new references immediately. Closing the tab removes all of its references and leaves unrelated
allow-list entries intact. The normal token, Host, Origin, allow-list, and byte-range checks continue
to govern file requests.

## Wire behavior

Core sends one generic plugin envelope containing the plugin id, a positive payload schema version,
and a JSON-compatible payload. Dedupe keys, origin labels, and resource ownership remain server-only.
The plugin validates its payload before the server opens a tab and again before the client renders it.

Client actions use one generic plugin-intent RPC containing the authoritative tab label, the same
schema version, an intent name, and JSON-compatible payload. The server derives plugin identity from
the open tab. A concrete client cannot use its capability to target another tab. The plugin validates
both intent payload and reply payload; malformed client envelopes and ordinary validator rejection
return an RPC error without disabling the plugin.

Intent names beginning with `$host/` are reserved. `$host/client-failure` is the generic client
layer's report for a chunk, activation, payload, or render failure and is never dispatched to
concrete plugin code.

## Failure and restart behavior

An incompatible version, catalog error, missing loader, rejected import, activation error or timeout,
invalid plugin-produced tab payload, plugin validator exception, handler exception or timeout,
invalid reply, client chunk failure, or render exception disables only that plugin for the remainder
of the process. It is not imported or invoked again before Janissary restarts. Other tabs and plugins
continue working, and every open tab for the failed client plugin shows its contained failure.

The user-facing wrapper is exactly:

`Tab plugin "<id>" disabled: <single-line reason>.`

Trailing punctuation in the reason is normalized so the wrapper has one final period. The failure is
written to the originating transcript while that tab exists. It also reaches the notifications feed
only when that feed is already open. It never recreates a closed origin, opens the notifications tab,
or buffers an event for a later feed. Restarting Janissary is the v1 retry mechanism.

## Compatibility

The host API and each plugin package have separate versions. API compatibility requires the same
major version and a host minor version at least as new as the plugin's minimum. Tab payload schemas
match exactly. Additive contract changes increment the API minor version; removal, renaming,
tightening, order changes, or any change that breaks the frozen v1 fixture requires a major version.

A deprecated contract remains usable for at least two minor releases after its replacement ships.
Its first deprecation notice names both the replacement and planned removal version. API history and
migration notes live in the contributor-facing tab-plugin API changelog.
