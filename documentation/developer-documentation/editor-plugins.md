# Editor plugins

Janissary's editor-plugin API is for trusted plugins bundled in this repository. An editor plugin binds a keyboard chord in the editor tab and answers with the edits to make and where to leave the selection. It cannot be installed at runtime and is not sandboxed.

This is a separate family from [tab plugins](./tab-plugins.md), which contribute view tabs, openers, and commands on the server. The two share no declarations, no catalog, and no API version. An editor plugin runs entirely in the client: pressing its chord makes no request, so an answer costs no round trip.

The authoritative types are `web/src/editor/plugins/api.ts`. `web/src/editor/plugins/registry.test.ts` pins the declaration table and the documented example below to the real files, so neither can drift from what the repository ships.

## Smallest working example

A plugin is one declaration in the registry plus one module that default-exports a handler.

The declaration is pure data in `web/src/editor/plugins/registry.ts`:

```ts
{
  id: 'commenting',
  version: '1.0.0',
  apiVersion: EDITOR_PLUGIN_API_VERSION,
  bindings: [{ command: 'toggle-comment', chord: { key: '/', meta: true }, needs: 'selection' }],
}
```

The implementation default-exports a handler:

```ts
import type { EditorPluginHandler } from '../api';

const run: EditorPluginHandler = (request) => ({
  edits: [{
    start: { line: request.range.start.line, col: 0 },
    end: { line: request.range.start.line, col: 0 },
    text: '// ',
  }],
});

export default run;
```

That is a complete plugin: it prefixes the first line of whatever the user selected.

## Files to add

For plugin `example`, add `web/src/editor/plugins/example/index.ts` and any modules it needs beside it. Then register two edges in `web/src/editor/plugins/registry.ts`:

1. A declaration literal in `editorPluginDeclarations`.
2. A literal `() => import('./example/index')` in `editorPluginLoaders`.

**Never statically import an implementation from `registry.ts`.** That module is reachable from the entry bundle, so a static import pulls the plugin's chunk in with it and silently defeats the lazy loading. A test asserts this.

## Declaration reference

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable identity, used by the loader map and in failure messages |
| `version` | yes | Plugin semantic version |
| `apiVersion` | yes | Editor-plugin API integer required by the plugin |
| `bindings` | yes | One or more chord-to-command bindings; at least one is required |

Each binding carries:

| Field | Meaning |
|---|---|
| `command` | The name the handler is invoked with, so one plugin can serve several chords |
| `chord` | `key` plus optional `meta`, `ctrl`, `shift`, `alt`. Must be a chord the core editor table does not keep for itself |
| `needs` | `'selection'` or `'buffer'` — how much of the document the handler is given |

A declaration is validated once. An API version mismatch, an empty `bindings`, or a chord another plugin already claimed disables that plugin with the recorded reason, without throwing and without affecting any other plugin. A chord the core editor table keeps for itself is refused the same way, when the host builds its chord table.

That last rule is the only one governing which chords are declarable, and it is exactly the "could this chord ever fire?" question. An unmodified printable key is turned into an insert by the core table, so it is refused; so is Cmd+S. A key the core table binds to nothing — or one it explicitly yields, below — is declarable.

## Chord resolution

Core editor bindings win, except for the two the core table explicitly yields. The plugin table is consulted for a keydown that `web/src/editor/keys.ts` leaves unbound, so nothing can shadow Cmd+S, Cmd+Z, Cmd+F, or the Emacs subset. A binding that claims a chord the core table owns and never yields could never fire, so it is reported and its plugin disabled rather than left silently dead.

The yielded chords are Tab, but only while the selection spans more than one line, and Shift+Tab, always — see `yieldsToPlugins` in `web/src/editor/keys.ts`. They are offered to plugins first; if no plugin claims one, the core action runs anyway, so Tab keeps inserting a tab character when the plugin that binds it is disabled. The list is a hard-coded two-entry table in the core key file: a plugin cannot add to it, because delegating a core binding is a decision the editor makes about itself.

Resolution is first match by exact chord. Because duplicate claims are refused at validation, array position never breaks a tie beyond that first-wins rule.

## The request

```ts
type EditorPluginRequest = {
  command: string;
  file: string;
  selection: { anchor: Pos | null; cursor: Pos };
  range: { start: Pos; end: Pos };
  lines: readonly string[];
};
```

`lines` is the slice the binding asked for and `range` is the document range it came from, always whole lines. A `'selection'` binding receives the whole lines the selection spans, or the caret's line when nothing is selected — so `lines` is never empty and a handler never special-cases "no selection". A `'buffer'` binding receives the whole document.

`file` is the tab's file name, and is how a handler varies by language. The declaration has no language field: the commenting plugin's extension table is entirely its own.

## The result

```ts
type EditorPluginResult = {
  edits: readonly { start: Pos; end: Pos; text: string }[];
  selection?: { anchor: Pos | null; cursor: Pos };
};
```

Return `null` to do nothing — the buffer, selection, and undo history are all left untouched and no message appears anywhere.

**Every position is an absolute document coordinate**, whichever slice the handler was given. A handler working from a `'selection'` slice turns a local index into an absolute one by adding `request.range.start.line`.

The optional `selection` describes where the caret should sit *after* the edits, so it may name a column the pre-edit line was too short to hold.

Edits are applied from the end of the document backwards, so an earlier edit never shifts a later one's coordinates, and the whole result lands as a single undo step.

## Validation and failure

An answer is checked against the buffer before any of it is applied. A position outside the document, a range that ends before it starts, or two edits covering overlapping ranges refuses the whole result: nothing is applied, no undo step is recorded, and the plugin is disabled. Ranges that merely touch at a boundary are fine.

Nothing is ever partially applied, and a bad position is never clamped to fit — clamping would silently corrupt the user's text.

A plugin is disabled when it fails to load, exports no handler, throws, rejects, exceeds its handler deadline, or returns a refused result. Its chords stop resolving, every other plugin keeps working, and one line naming the plugin and the reason is posted to the notifications tab through the `editorPluginFailed` RPC — the only thing about an editor plugin that reaches the server. Repeat failures from an already-disabled plugin report nothing further. Disabling lasts for the session; a page reload starts every plugin fresh.

## Trust and limits

Editor plugins run in the browser, on the UI thread, at the same trust level as the rest of the client. They are bundled in this repository and are not sandboxed.

The handler deadline bounds a handler that returns a promise. **A handler that blocks synchronously cannot be interrupted, and would hang the window.** That is not defended against, and it is the reason this API is for bundled code only. The server-side tab host has the same gap, but a stalled request there costs less than a frozen tab here.

A plugin is handed data and returns data. It receives no capability object, no client, and no file access, and it may change only text and selection — never a save, a scroll, a rename, a close, an open, another tab, or anything it draws itself.
