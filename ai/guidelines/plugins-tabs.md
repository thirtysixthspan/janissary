# tab plugin rules

Binding rules for Janissary's bundled tab-plugin extension point. Read [[plugins]] for the extension-point design principles that also apply. This file covers only persistent tab views plus the opener and command contributions that create them; it does not cover pipeline hooks, notifications, themes, transports, menus, installation, or third-party plugins.

## Directory and module shape

A plugin named `<id>` spans two trees and has no barrel file:

- `src/plugins/<id>/manifest.ts` is pure declaration data.
- `src/plugins/<id>/shared.ts` owns payload and intent types, schema constants, and hand-written guards. It imports nothing—not even a type. The client executes its guards through `@shared`, and an import could pull NodeNext `.js` resolution or server behavior into the browser graph.
- `src/plugins/<id>/activate.ts` exports server `activate()`; helpers stay beside it.
- `web/src/plugins/<id>/index.tsx` default-exports the component and named-exports `isPayload`.
- Client components and hooks stay under `web/src/plugins/<id>/`.

Add the manifest to `src/plugins/catalog.ts`, a literal dynamic server import to `src/plugins/loaders.ts`, and a literal dynamic client import to `web/src/plugins/registry.tsx`. Never use filesystem discovery, `import.meta.glob`, a runtime-generated path, or a second client manifest. Production catalogs never include compatibility fixtures.

## Declaration

Every `TabPluginDeclaration` field has one purpose:

- `id`: stable catalog, loader, configuration, wire, and failure identity.
- `version`: the plugin's own semantic version.
- `apiVersion`: the integer host API required by this plugin.
- `payloadSchemaVersion`: positive integer for this plugin's tab payload.
- `tabLabelPrefix`: prefix used when the host allocates unique labels.
- `fileExtensions`: map of lowercased dot-prefixed claims to a MIME string or `undefined` for externally handled formats.
- `editGesture` (optional): v1 permits `open external` for file-navigator edit activation.
- `command` (optional): one case-insensitive first-token command claim.
- `capabilities`: names requested from the v1 server capability set.

Declarations contain data, never executable predicates or top-level side effects. Core routes resolve first. Duplicate extension claims, duplicate command claims, and command claims colliding with any built-in, available command, `schedule`, `harness`, `ssh`, or `shell` are refused; array order never breaks a tie. The first plugin to claim a name keeps it. A refused claim is recorded, not thrown: that plugin contributes nothing and starts life disabled with the recorded reason, because the host must start successfully with every plugin broken.

## Server contract

`activate()` returns a `TabPluginActivation` with `isPayload`, `opener.inline`, `opener.external`, `intent`, an optional `command`, and optional idempotent `dispose`. A declaration that claims a command name must supply `command`; it receives everything after the first token. It does not receive `Managers`. Each opener, command, intent, and notification receives a `TabPluginServerCapabilities` object with exactly eight functions:

- `note(text)` appends to the originating transcript if it is still open.
- `openOrFocusTab(instanceKey, factory)` focuses an existing tab or creates one.
- `updateTab(instanceKey, factory)` replaces the payload, and optionally the title, of a tab this plugin already owns. The tab keeps its label, position, group, focus, instance key, schema version, and served files. An instance key with no open tab is a no-op; a result failing the plugin's own guard, the JSON check, or a supplied-but-empty title disables it. An update never registers a file and never changes an instance key: both are fixed at creation.
- `openClaimedFiles(target)` asks the host to run its ordinary `open` pipeline for `target`, pinned to this plugin's own opener. This is how a declared command becomes a second route into one opener rather than a second behavior: path resolution, wildcard expansion, sorted processing, the ten-file limit, and missing-file errors all stay identical to `open`, and a file belonging to another opener is refused rather than silently handed over. The host queues these and runs them after the guarded call returns, so that work never counts against the plugin's own budget.
- `configuredViewer()` reads `externalViewers[pluginId]`.
- `openExternally(path, application?)` invokes the detached OS opener.
- `rejectRequest(reason)` answers one bad request and leaves the plugin running.
- `reportFailure(reason)` throws across the guarded boundary and disables the plugin.

`rejectRequest` and `reportFailure` are not interchangeable, and picking the wrong one is the easiest way to make a plugin fragile. Anything a caller could have gotten wrong — a malformed intent payload, an unknown intent name, a missing command argument — is a rejection. Only the plugin itself being broken is a failure. A rejection surfaces on the originating transcript for an opener or command, and as an ordinary RPC error for an intent.

The stable instance key is checked synchronously before the payload factory runs. The factory is the only place to call `resources.registerFile(path)`. This ordering prevents reopening a tab from leaking a second allow-list reference and lets the host release every reference owned by a closing tab. A factory returns `{ title, payload }`; the title must be nonempty and the payload must pass the activation's guard and JSON-compatibility check.

Resolution is first match by file extension or declared command token. Core entries precede plugin adapters. Each user-initiated invocation is awaited; separate invocations may overlap, while files within one wildcard open run sequentially in sorted order.

An opener or command that returns nothing completed without opening a tab, which is not an error. An intent is the exception: its result is sent to the waiting client, so it must return a JSON-compatible value. Returning `undefined` — which is what a handler that falls off its last line returns — is treated as a produced-invalid-result failure and disables the plugin. An intent with nothing to report returns `null`.

## Client contract

The client entry default-exports a React component accepting `{ payload, capabilities }` and named-exports `isPayload`. Write that guard as a type predicate: the registry infers the payload type from it and hands the component a value already narrowed, so no plugin asserts a type its own guard has already proven. The registry creates one `React.lazy` type at module scope; never create it during a render. The host checks the envelope schema and the entry guard before plugin behavior renders.

`TabPluginClientCapabilities` exposes exactly five things:

- `resourceUrl(reference)` adds current-session authentication to a served-file reference.
- `intent<Result>(name, payload)` sends a request bound to this tab label.
- `splitAction` is the host-rendered split control node or `null`.
- `active` is whether this tab is the visible one in its pane. A plugin tab stays mounted while hidden, so a window-wide listener gates on this instead of assuming the tab is on screen; a plugin never reads visibility off the host's DOM.
- `reportFailure(reason)` sends one failure report for this plugin boundary.

Never pass `JanusClient`, import a raw socket, or import host UI internals from a concrete plugin. Client-local state may hold playback, scroll, or overlay state; server-owned tab state must not be recomputed locally.

## Wire and validation

`src/protocol.ts` is the only wire definition. A plugin tab exposes `{ id, schemaVersion, payload }`; instance keys, source labels, and owned file-reference ids are server-only.

`pluginIntent` carries `{ tab, intent, payload }`. The envelope has no plugin id or schema version because the server resolves both from its own tab record, whose payload already carries the schema. The generic ingress validates `tab`, `intent`, and payload presence; the selected plugin validates its intent payload and authoritative tab payload. `pluginFailed` carries string `{ tab, reason }`; generic ingress validates it, then the server resolves the owning plugin from the tab. Malformed input returns an RPC error without disabling anything.

Shared guards must reject arrays and `null` when an object is required and validate every required field. They stay hand-written and import-free.

## Host notifications

A declaration may name host topics under `notifications`, and one that does must supply `notify` on its activation or it is disabled at activation — a notification has no caller and no transcript, so there is nothing for a rejection to answer into. v1 defines one topic, `schedules`, carrying the aggregated scheduled-command rows. A topic is always a named, already-coalesced signal; the raw state broadcast is never one, because it fires on essentially every mutation including per-keystroke shell output.

Delivery reaches only a plugin that is already active and already owns at least one tab, so a notification never activates anything and a plugin with nothing on screen is never called. The event carries the topic, its data, and the instance keys of that plugin's own open tabs. Handlers are guarded at 1000 ms — tighter than the 5000 ms a user-initiated call gets — fan out concurrently with no ordering guarantee, and have their return value ignored: a notification cannot influence a host outcome, and a plugin acts on one by calling `updateTab`. `note` writes nowhere during a notification. A throw or timeout disables that plugin alone. The host owns the single subscription and releases it on dispose; no plugin holds a handle to revoke.

## Lazy lifecycle and budgets

Only a claimed `open` route or declared plugin command activates server behavior. Only the existence of a plugin tab loads its client chunk. `plugins`, startup, completion, state broadcasts, and static discovery activate nothing.

The literal budgets are:

- server activation: 1000 ms;
- each server opener, command, or intent: 5000 ms;
- client chunk import plus first mount together: 5000 ms.

The handler budget covers plugin code only. Work the plugin asks the host to do through `openClaimedFiles` runs after the guarded call returns, so a ten-file wildcard open can never be attributed to the plugin as a timeout.

Concurrent first server requests share one activation promise. Record activation duration. If activation times out and later resolves, dispose the late result; never enable it. Shutdown disposal is idempotent, with no promised order between plugins.

## Failure boundary

API incompatibility, an unknown capability request, a refused contribution claim, missing or rejected loaders, activation failure or timeout, invalid produced payload, guarded handler failure or timeout, unknown client id, schema mismatch, rejected or timed-out chunk, invalid client payload, and render exceptions disable that plugin for the process. Normal domain outcomes such as an undecodable video do not, and neither does a `rejectRequest` answer to a bad request.

Format the visible line exactly as `Tab plugin "<id>" disabled: <reason>.` Reduce the reason to one line without a stack, trim terminal punctuation, and add exactly one period. Append it to the originating transcript only if still open and to the notifications feed only if already open. Never create either tab.

A disabled plugin owns no tabs. Close every tab with that id, release its served files, dispose its activation once, and never import or call it again until restart. Later attempts report the recorded reason. Failure in one plugin must not affect another plugin or core.

Plugins are trusted bundled code, not sandboxed code. Narrow capabilities contain mistakes but are not a security boundary. Files still use the authenticated `/open/` allow-list, and plugins add no ports, routes, sockets, or authentication bypasses.

## Import boundaries and versioning

ESLint forbids concrete server plugins from reaching two levels into host internals except the documented pure video size formatter. It forbids concrete client plugins from reaching host modules and permits runtime shared imports only from a plugin shared contract. Core cannot statically import a concrete `activate.js` or client `index` entry; only the loader maps may reach them.

The client plugin host — everything directly under `web/src/plugins/` — is reachable from the entry bundle, so it may not import a plugin shared contract at runtime at all; doing so ships that plugin's guards eagerly and defeats the lazy chunk. Type-only imports are fine because they are erased before the bundler sees them, and `web/src/plugins/registry.tsx` uses one to pin its entries against the catalog so a missing client entry is a compile error. Schema versions there are literals, checked against each plugin's own constant by a test rather than by an import. After changing anything in that file, rebuild and confirm each plugin's modules are still in its own chunk.

`TAB_PLUGIN_API_VERSION` is one integer. Additive optional declaration fields, capabilities, or hooks keep v1 compatible. Removal, rename, type tightening, payload-meaning change, or observable ordering change increments it. Breaking the frozen `fixture-v1` round trip is a major bump by definition. Keep an API fixture until that version is formally removed; introduce replacements and a documented deprecation window before removal.

## Adding a plugin checklist

Before finishing a new tab plugin, verify all of these exist and agree:

1. Production catalog entry and unique claims.
2. Literal server and client loader-map entries.
3. Pure manifest.
4. Import-free shared contract with schema and guards.
5. Server activation module using only declared capabilities, including `command` when a command is claimed.
6. Client entry and component using only client capabilities.
7. Server tests for registration, activation, command, intent, rejection, failure, cleanup, and disposal.
8. Client tests for lazy loading, payload validation, rendering, intents, and failure.
9. Product spec update and, for API changes, reference changelog update.
10. `./scripts/run.mjs check-diff`, the production web build/chunk inspection, and the frozen fixture tests.
