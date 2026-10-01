# Overlay plugins

Janissary's overlay-plugin API is for trusted plugins bundled in this repository. An overlay plugin contributes a floating popup — the kind that appears above the command line, in the shape of the command-history popup — and declares the chord and command word that open it. It cannot be installed at runtime and is not sandboxed.

This is a third family, separate from [tab plugins](./tab-plugins.md), which contribute view tabs, openers, and commands on the server, and from [editor plugins](./editor-plugins.md), which bind a chord in the editor tab and answer with edits. The three share no declarations, no catalog, and no API version. An overlay plugin runs entirely in the client and exists because the other two could not express a popup: a tab plugin owns a persistent tab, and an editor plugin may not draw anything.

The authoritative types are `web/src/overlay-plugins/api.ts`. `web/src/overlay-plugins/registry.test.ts` pins the declaration table and the documented example below to the real files, so neither can drift from what the repository ships.

## Smallest working example

A plugin is one declaration in the registry plus one module that default-exports what it wants published.

The declaration is pure data in `web/src/overlay-plugins/registry.ts`:

```ts
{
  id: 'clipboard-history',
  version: '1.0.0',
  apiVersion: OVERLAY_PLUGIN_API_VERSION,
  chord: { key: 'v', ctrl: true, shift: true },
  command: 'clip',
  title: 'clipboard',
  emptyText: '(no clipboard history)',
  activation: 'startup',
}
```

The implementation default-exports a module. `start` is called once, before anything can open the overlay, and returns the overlay the host publishes:

```ts
import type { OverlayPluginModule } from '../api';

const module: OverlayPluginModule = {
  start: (capabilities) => ({
    name: 'clipboard-history',
    claimsCommandBar: true,
    render: (anchor) => <MyPopup anchor={anchor} />,
    onKey: (event) => { /* handle keys here */ },
    onOpen: () => { /* reset the selection */ },
  }),
  dispose: () => { /* release anything acquired */ },
};

export default module;
```

By default a plugin is loaded only when its chord, its command word, or the right-click menu first asks for it, and nothing about it executes at startup. A plugin that has to observe something from launch declares `activation: 'startup'` and is loaded and started once the window has mounted. The clipboard history is one: it can only list copies it saw happen, so starting it on the popup's first open would show an empty list however much had been copied. The chunk is still loaded separately from the entry bundle either way.

## Files to add

For plugin `example`, add `web/src/overlay-plugins/example/index.ts` and any modules it needs beside it. Then register two edges in `web/src/overlay-plugins/registry.ts`:

1. A declaration literal in `overlayPluginDeclarations`.
2. A literal `() => import('./example/index')` in `overlayPluginLoaders`.

**Never statically import an implementation from `registry.ts`.** That module is reachable from the entry bundle, so a static import pulls the plugin's chunk in with it and silently defeats the lazy loading. A test asserts this.

## Declaration reference

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identity, used by the loader map, the failure message, and the overlay's name |
| `version` | yes | The plugin's own version |
| `apiVersion` | yes | The host API required; must equal `OVERLAY_PLUGIN_API_VERSION` |
| `chord` | yes | The chord that opens the overlay. Plain letters are matched with their modifiers, so `{ key: 'v', ctrl: true, shift: true }` is one chord and not two |
| `command` | yes | The command word typed in the command bar that opens the overlay. Intercepted client-side; it never reaches the server |
| `title` | yes | What the overlay's own title row reads |
| `emptyText` | yes | What the overlay shows when it has nothing to show |
| `activation` | no | `'open'` (the default) loads the plugin when something first opens it; `'startup'` loads it once the window has mounted. Startup is the broad trigger, so a declaration that asks for it says why beside the field |

A chord the application already claims, a chord another plugin already claims, a command word the built-in dispatcher already answers, or a command word another plugin already claims is a **recorded refusal that disables that plugin** — never a throw, so one bad declaration leaves every other plugin working. The reason reaches the notifications feed as `Overlay plugin "<id>" disabled: <reason>.`

A chord the application claims is refused separately, at construction, because such a chord could never fire.

## Resolution and ordering

A plugin overlay ranks **below all nine built-in overlays** — the route chooser, the syntax-theme and application-theme pickers, Quick Open, the tab navigator, the command history picker, the queue popup, the task picker, and the profile picker. A built-in overlay always wins a tie, so a plugin's chord pressed while one of them is open does nothing. There is no band that lets a plugin preempt a built-in overlay; adding one later is one optional field on the declaration, not a change to the seam.

Within the plugin band, declaration order decides, so two plugins claiming the same moment resolve the same way every time. It is the declaration rather than the registration because a plugin has to be reachable before anything has loaded it: a chord or a command word resolves against the claims the host published at startup, and the chunk is fetched afterwards, when the plugin is first actually opened — or once the window has mounted, for a plugin that declares `activation: 'startup'`.

`claimsCommandBar` is data on the overlay rather than an omission from a separate list, for the same reason the built-in registry records it: whether the command bar keeps working while an overlay is up is a property of that overlay, and the queue popup is the one built-in that differs.

## Reaching a plugin from the rest of the application

No feature imports the plugin layer, and a lint zone enforces that. Everything reaches an overlay through `web/src/shared/contributed-overlays.ts`, which answers three questions: which overlay claims this chord, which claims this command word, and open that one. The overlay-plugin host publishes the claims — resolved from the declaration — and installs the opener that loads a chunk and opens it.

So the command bar's interception chain holds no plugin, the right-click menu names a command word rather than a plugin, and the window key handler compares chord ids against the seam. Adding a plugin's command adds no line to any of them.

## The capability

`start` receives one object:

| Member | Meaning |
|---|---|
| `paste(text, anchor)` | Put `text` at the keyboard caret. `anchor` is the element a right-click landed on when the overlay was opened from the context menu, or null for every other route in |
| `maxEntries` | How many entries the overlay may keep, from the host's configuration. Read it when it is needed rather than once at `start`: the configuration arrives after the window mounts, so a startup plugin sees the default first and the configured number afterwards |
| `close()` | Close this overlay. How choosing an entry ends, and how Escape ends |

That is the whole vocabulary. A plugin has no client, no tabs, no file access, and no host internals: an import boundary in `eslint.plugin-boundaries.mjs` rejects anything but its own contract, and `src/eslint-plugin-boundaries.test.ts` keeps the rule from rotting. The one shared module it may import is the capture seam — the same subscribe-and-unsubscribe shape `shared/drop-registry.ts` uses, because those two features may not import each other either.

`render(anchor)` receives the anchor rather than having the plugin read it back, and `onKey` is called by the window key handler rather than by a listener the plugin installs, so a plugin never needs to know how keys reach it.

## Keys

`handlePickerKey` is published from `api.ts`: the arrows move a clamped selection with no wraparound, Return activates the selection, and Escape closes. It is the same function the built-in pickers use, so a plugin that wrote its own arrow handling would be the drift that publication exists to prevent.

## Budgets and failure

| Operation | Budget |
|---|---|
| Loading and starting a plugin | 1000 ms |
| Every handler call | 1000 ms |

Load and every call are guarded. A throw, a rejected promise, a failed chunk fetch, or a budget overrun disables that plugin alone and records the reason; nothing else in the application is affected. `dispose` releases what the plugin acquired and runs even if it throws.

## Trust and limits

A plugin module is trusted code running in the application's window, not sandboxed. The capability narrowing above is protection against mistakes, not against an adversary: a plugin shares the isolate and could reach around it. What it is *for* is keeping a plugin from needing to — there is no host module a well-behaved plugin has any use for.

A plugin may not save a file, scroll, rename, close, or open anything; it may not read the protocol client; and it may not reach past `api.ts`.

## Testing a plugin

- `web/src/overlay-plugins/registry.test.ts` — the declaration table, the refusals, and that the loaders are literal dynamic imports.
- `web/src/overlay-plugins/host.test.ts` — load and start, a throw, a refusal, dispose, and the lazy-load discipline.
- The plugin's own `*.test.ts` files, colocated beside it.
- `src/eslint-plugin-boundaries.test.ts` — the plugin import boundary.

## API changelog

### v1

The first version: a declaration with an identity, a version, an API version, a chord, a command word, the two strings the overlay shows, and an optional `activation` trigger; a `start` returning the overlay to publish and a `dispose`; and three capabilities — `paste`, `maxEntries`, and `close`.
