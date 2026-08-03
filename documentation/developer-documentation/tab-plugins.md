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
| `editGesture` | no | `open external` for a file-navigator edit activation |
| `command` | no | One case-insensitive first-token command |
| `notifications` | no | Host topics to be told about; a declaration naming one must supply `notify` |
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

The host supplies eight capabilities:

- `note(text)` writes to the originating transcript.
- `openOrFocusTab(instanceKey, factory)` focuses or creates a plugin tab.
- `updateTab(instanceKey, factory)` replaces what one of your own tabs already shows.
- `openClaimedFiles(target)` runs the host's `open` pipeline for `target`, pinned to your opener.
- `configuredViewer()` reads the viewer configured for this plugin id.
- `openExternally(path, application?)` asks the OS to open a file.
- `rejectRequest(reason)` answers one bad request without disabling the plugin.
- `reportFailure(reason)` exits through the guarded failure boundary and disables the plugin.

Your declaration decides which of them you actually get. A name it omits is still present on the capability object — the type is the whole contract — but calling it throws `used capability "<name>" without declaring it`, which crosses the failure boundary and disables the plugin. Declaring a capability you never call is harmless; calling one you never declared is a bug in your manifest, caught the first time that line runs. Keep the list to what you use.

## Updating a tab you already opened

A tab's payload is produced once, by the factory `openOrFocusTab` runs. `updateTab` is how it changes afterwards: name the instance key the tab was opened with, and return the new payload — and a title, when the name in the tab strip should change with it.

```ts
capabilities.updateTab(file, () => ({ title: basename(file), payload: { …next } }));
```

The tab keeps everything else: its label, position, group, focus, instance key, schema version, and the files it already serves. A factory that returns no title leaves the current title alone, so a plugin with nothing to say about naming never overwrites a name the user chose; a factory that returns one replaces whatever is there, including that rename.

An instance key you have no open tab for is a no-op, so you never have to track which of your tabs the user has since closed. The result is validated exactly as a created payload is — your own `isPayload` guard, JSON compatibility, and a nonempty title when one is supplied — and failing that check disables the plugin, because a payload your own contract rejects means the plugin is broken.

You cannot register a new file to serve from an update, and you cannot change a tab's instance key: both are fixed when the tab opens.

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

v1 defines one topic, `schedules`, whose data is the aggregated scheduled-command rows. A topic is always a named, already-coalesced signal — never the raw state broadcast, which fires on essentially every mutation including per-keystroke shell output.

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
- `active`, whether this tab is the visible one in its pane — or, when the tab is docked into a sidebar, whether it is the selected entry there. Every v1 plugin tab stays mounted while hidden, so a component that binds a window-wide listener — the image plugin's zoom and pan keys, for instance — must gate it on this rather than assume it is on screen. Never infer it from the DOM: the host owns the frame; and
- `reportFailure(reason)` for an unrecoverable client-contract failure. Only the first report per plugin is sent, whichever tab or code path raises it, so calling it from your own component is safe alongside the failures the host detects for you.

It never receives `JanusClient` or imports host UI internals. The host owns the `.tab-body`, focus border, visibility, split placement, loading fallback, and error boundary. Every v1 plugin tab remains mounted while hidden.

## Intents and validation

`pluginIntent` sends `{ tab, intent, payload }`. The host looks up plugin identity and authoritative tab payload from the server's open-tab record, then calls the activated plugin. The request needs no schema field because the record already owns the versioned payload. Validate the intent payload and tab payload in the plugin before using either.

Return a JSON-compatible value. An intent result travels back to a waiting client, so unlike an opener or a command it may not simply fall off the end of the handler: `undefined` is not JSON, and the host treats it as a produced-invalid-result failure that disables the plugin. Return `null` when the intent has nothing to report — this is what the video plugin's `open-external` does.

`pluginFailed` sends `{ tab, reason }`. It is for load, schema, validation, timeout, and render failures that make the plugin unusable—not ordinary domain outcomes a component can render, such as an unsupported video codec.

Both generic RPC shapes are validated before host dispatch. Served files remain behind the session token, Host/Origin checks, and explicit allow-list.

## Lifecycle and diagnostics

The budgets are 1000 ms for server activation, 5000 ms per server opener, command, or intent, and 5000 ms total for a client chunk plus first mount. The handler budget covers your code only — files opened through `openClaimedFiles` run after the guarded call returns. Concurrent first server requests share one activation promise. `plugins` reports `declared`, `active` with activation milliseconds, or `disabled` with a reason, without activating anything.

An incompatible contract, a refused contribution claim, load or activation failure, invalid produced payload, guarded-call failure, client load/schema/validation/timeout failure, or render exception disables only that plugin until restart. The host reports `Tab plugin "<id>" disabled: <reason>.`, closes all of its tabs, releases their served files, and disposes it once. Other plugins and core continue.

## Testing a plugin

Add server tests for declaration claims, playable/external routes, payload validation, deduplication before factory work, command routing, intent round trips, rejection leaving the plugin active, failure, cleanup, and disposal. Add client tests for the entry guard, lazy load, rendering, actions/intents, persistent mounting, and contained failure. Run `./scripts/run.mjs check-diff`, then confirm the production web build emits the client entry and its shared contract as a separate chunk — inspect the build source maps rather than trusting the file list, since a stray runtime import in the registry moves modules into the entry without changing how many chunks appear.

## API changelog

### v1

- Initial bundled-only tab-view contract.
- Static opener, command, and notification contributions, with `command` and `notify` handlers on the activation.
- Eight server and five client capabilities.
- Versioned generic tab payload plus `pluginIntent` and `pluginFailed` RPCs.
- Two-level failure model: `rejectRequest` answers one bad request, `reportFailure` disables.

Additive optional fields, capabilities, and hooks remain v1-compatible. Removals, renames, tighter types, changed payload meaning, or observable ordering changes require a new API integer and are major changes. Introduce a replacement and deprecation window before removal. Keep the v1 fixture until v1 is formally removed; future deprecations and removals belong in this section.
