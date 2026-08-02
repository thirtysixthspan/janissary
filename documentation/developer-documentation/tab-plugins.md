# Tab plugins

Tab plugins are a versioned internal extension point for bundled, trusted tab views. They combine a
static declaration with server and client behavior that loads only when a declared command or file
opener matches. API v1 supports one tab type per plugin and intentionally does not support external
installation, discovery, hot reload, or a marketplace.

## Smallest complete example

The permanent `fixture-v1` plugin is the executable compatibility example. Its manifest declares a
test-only command and the minimum host contract:

```ts
// src/plugins/fixture-v1/manifest.ts
import { TAB_PLUGIN_API_VERSION, type TabPluginDeclaration } from '../api.js';

export const fixtureV1Manifest = {
  id: 'fixture-v1',
  version: '1.0.0',
  requiredApiVersion: TAB_PLUGIN_API_VERSION,
  payloadSchemaVersion: 1,
  tab: { labelPrefix: 'fixture' },
  commands: ['fixture-tab'],
  capabilities: ['transcript', 'plugin-tabs', 'served-files'],
} as const satisfies TabPluginDeclaration;
```

Its server activation opens through the capability and constructs resources only after the host's
stable-instance dedupe check:

```ts
// src/plugins/fixture-v1/server/activate.ts
import { TAB_PLUGIN_API_VERSION, type TabPluginServerCapabilities } from '../../api.js';
import { fixtureV1Manifest } from '../manifest.js';
import { isFixtureV1Intent, isFixtureV1Payload, isFixtureV1Reply } from '../shared.js';

export function activate(capabilities: TabPluginServerCapabilities) {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: fixtureV1Manifest.payloadSchemaVersion,
    validateTabPayload: isFixtureV1Payload,
    commands: {
      'fixture-tab': (_command: string, context: { originLabel: string }) => {
        capabilities.openPluginTab({
          originLabel: context.originLabel,
          instanceKey: 'fixture-v1',
          title: 'fixture',
          create: ({ registerFile }) => ({
            message: 'fixture v1',
            resource: registerFile('/tmp/janissary-fixture-v1.txt'),
          }),
        });
      },
    },
    validateIntent: isFixtureV1Intent,
    handleIntent: (request: { payload: unknown }) => ({
      schemaVersion: fixtureV1Manifest.payloadSchemaVersion,
      payload: request.payload,
    }),
    validateIntentReply: isFixtureV1Reply,
  };
}
```

The client activation validates the same payload and receives narrow capabilities rather than the
application client:

```tsx
// src/plugins/fixture-v1/client/activate.tsx
import { TAB_PLUGIN_API_VERSION, type TabPluginClientComponentProperties } from '../../api';
import { fixtureV1Manifest } from '../manifest';
import { isFixtureV1Payload } from '../shared';

function FixtureView({ payload }: TabPluginClientComponentProperties) {
  if (!isFixtureV1Payload(payload)) throw new Error('fixture v1 payload is invalid');
  return <div data-plugin-fixture="v1">{payload.message}</div>;
}

export function activate() {
  return {
    apiVersion: TAB_PLUGIN_API_VERSION,
    payloadSchemaVersion: fixtureV1Manifest.payloadSchemaVersion,
    validateTabPayload: isFixtureV1Payload,
    component: FixtureView,
  };
}
```

Production plugins add their pure manifest to `src/plugins/manifests.ts` and literal dynamic imports
to both loader maps. The fixture deliberately stays out of production catalogs.

## Directory and import boundary

```text
src/plugins/<id>/
├── manifest.ts
├── shared.ts
├── server/
│   └── activate.ts
└── client/
    └── activate.tsx
```

Use direct imports; plugin directories have no barrels. Server files use NodeNext `.js` relative
imports. Client files use extensionless bundler imports and keep `.css` on stylesheet imports.
Targeted lint rules keep concrete plugins away from managers, controllers, sockets, host UI, and
other plugins. The video server's byte-size formatter is the one documented pure host utility.

## Static declaration

`TabPluginDeclaration` contains:

- `id` and plugin `version`;
- `requiredApiVersion` and exact positive `payloadSchemaVersion`;
- one tab `labelPrefix` (each tab's display title comes from its `openPluginTab` request);
- optional case-insensitive command first-token claims;
- optional opener extensions, MIME claims, and file-navigator edit action; and
- requested capability names, drawn from `TAB_PLUGIN_CAPABILITIES`.

Capabilities are enforced, not documentation. A declaration naming a capability v1 does not define is
rejected before any import, and calling a capability the declaration omitted throws through the
guard and disables that plugin.

Declarations decide whether behavior should load, so they must be data-only and side-effect-free.
The manifest list is the sole production declaration catalog. The server and client loader maps are
separate only to preserve the client bundle boundary, and parity tests keep them synchronized.

Core commands resolve before plugin commands. An invocation has one provider. Openers use first
match, while duplicate extension or MIME claims disable the conflicting declaration. Matched
handlers are awaited; wildcard files remain sequential and separate invocations may overlap.
Returning nothing means completion without a new tab.

## Server activation and capabilities

`activate(capabilities)` returns the API and schema versions, the tab payload guard, declared command
and opener handlers, optional intent guards/handler, and optional idempotent `dispose`. A plugin with
intent behavior supplies all three intent hooks: request validator, handler, and reply validator.

The server capability surface is deliberately small:

- `report(originLabel, text)` appends to an existing origin transcript.
- `openPluginTab(request)` deduplicates by plugin id plus `instanceKey`, then invokes `create` only
  for a new tab.
- The factory receives `registerFile(absPath)`, whose returned `/open/<id>` reference is owned by
  the new tab and served through the normal authenticated allow-list.
- `externalViewer()` reads the configuration entry keyed by plugin id.
- `openExternally(path, application?)` performs detached OS opening.

The host owns labels, grouping, colors, focus, panes, split placement, chrome, closing, and resource
cleanup. The plugin owns only its versioned body payload and implementation.

## Client activation and intents

The client registry creates one `React.lazy` type per manifest. The concrete chunk and its CSS are
not requested until a matching plugin tab is mounted. The host wraps each view independently in
`Suspense` and an error boundary, keeps it mounted while hidden, and supplies:

- `resourceUrl(ref)` for a tokenized tab resource;
- `pluginIntent(intent, payload)`, already scoped to the current tab; and
- `splitAction`, a ready-made React node for the plugin's header.

Styling works the same way. The host's shared view-tab chrome — `image-tab`, `image-meta`,
`image-stage` and their children, declared in `web/src/theme.css` and already reused by the editor
and file navigator tabs — is available to a plugin view so it matches every other view tab. Anything
beyond that belongs in the plugin's own `.css` file next to its component, which the bundler emits
as part of the plugin's lazy chunk.

The shared protocol carries one `{ pluginId, schemaVersion, payload }` tab envelope and one generic
intent request/reply pair. Put runtime guards in the plugin's `shared.ts` and use the same guard on
both sides. Payloads must be JSON-compatible. Names beginning with `$host/` are reserved.

## Budgets, failures, and status

Server import plus activation has a 1,000 ms budget. Each server handler, intent boundary, validator,
and disposer has 5,000 ms. Client import plus activation shares one end-to-end 5,000 ms budget.
`PluginHost.status(id)` reports inactive, activating, active, disabled, or unknown plus recorded
activation time and failure reason.

A plugin-caused incompatibility, throw, rejection, timeout, invalid payload/reply, chunk failure, or
render exception disables that plugin until process restart and is never retried in-process. The
exact wrapper is `Tab plugin "<id>" disabled: <reason>.`. It reaches the live origin transcript and
an already-open notifications feed; delivery does not recreate or buffer either view. Malformed
client input and a request validator returning false are ordinary RPC errors and do not disable the
plugin.

## Compatibility and required checks

Host API compatibility requires equal majors and `host.minor >= plugin.required.minor`. Additive
changes increment the minor. Any removal, rename, tightened contract, observable ordering change,
or break in `src/plugins/fixture-v1/` requires a major. See the
[tab-plugin API changelog](./tab-plugin-api-changelog) for the deprecation window and API history.

Keep tests beside server/client behavior and cover the generic host and client boundaries. Before
shipping, run the diff check, full check, SAST, production web build, and documentation build, then
inspect assets to confirm plugin JavaScript and CSS remain outside the entry bundle.
