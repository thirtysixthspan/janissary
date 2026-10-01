# Clipboard history popup plugin

**Complexity: 7/10** — a first-of-its-kind client-only extension point (contract, catalog, lazy
loader, host with its own failure boundary, API integer, and two lint boundaries) plus the
registration seam that turns the hand-written overlay registry into one the host walks, plus a new
overlay-plugin bundle that owns a capture store, plus six clipboard call sites routed through the
single writer, plus a context-menu entry, a configurable cap on the existing `config.json` chain, a
server command twin, and four spec updates. No server state machine; the reasoning is about
extension-point design and about not eagerly loading the plugin chunk, not about concurrency.

## Summary

Give the user a clipboard-history popup: a menu of the text they have copied, newest at the bottom,
capped at the last 15 entries by default and raisable through a config setting, opened the way the
`Ctrl+R` history popup is opened. Choosing an entry pastes it at the keyboard caret — into the command
bar, into an editor buffer, or into a harness/ssh terminal. Each entry is represented by the first
line of non-space text, with an ellipsis when the text is too long or spans several lines.

The default context menu gains a `Paste from clipboard…` entry that opens the same popup, which
makes the clipboard reachable from the mouse on surfaces where no field holds the keyboard.

This is the third `## ready` entry in `./product/backlog/features.md`. It is worth doing because the
app already has both halves and joins them nowhere: every copy in the app funnels through a handful
of call sites, and the paste-into-caret machinery already exists for the command bar, an editor
buffer, and a harness PTY — but recovering a snippet you copied two tabs ago means a round trip
through a shell.

The feature text asks for the popup to be a plugin, and it is. Neither existing family fits — a tab
plugin owns a persistent tab, and an editor plugin is explicitly barred from drawing — so this
introduces the third family, whose plugins contribute a floating overlay.

## Design decisions

### Established by the feature text or by existing behavior

1. **The popup is modelled on the history popup.** Same shape, same anchor (bottom-anchored, above
   the command line, full width), same `.picker` markup, same keyboard model: Up/Down move the
   selection clamped at both ends with no wraparound, Return chooses, Escape closes, a row can be
   clicked, and the popup opens on its newest row. The history popup's behavior is specified in
   `product/specs/history.md` § "History picker" and its keyboard priority in
   `product/specs/keyboard-navigation.md` § "Overlay priority". Choosing an entry closes the popup,
   because that is what the history popup does on the same keystroke.
2. **Newest at the bottom.** Identical ordering to the history picker, whose `getRecentHistory`
   walks newest→oldest and reverses so the newest sits nearest the command line
   (`web/src/history.ts:4`).
3. **The cap is 15 by default and configurable.** Applied to the retained entries, dropping the
   oldest — the same shape as `recordHistory`'s 100-entry cap (`src/tab/history.ts`). The default
   stays 15 because that is what the feature text specifies; it becomes a setting so a fleet that
   copies heavily can raise it, which is what JetBrains offers with "Maximum number of contents to
   keep in clipboard" (default 5, with its own docs suggesting 20–50). Where the setting lives, what an
   out-of-range value does, and what happens to existing entries when it is lowered are settled in
   decisions 22–24.
4. **Choosing an entry pastes, it does not run.** This is the deliberate difference from the history
   picker, which *runs* the selected command (`web/src/pickers/useHistPicker.ts:16`, `pick`). The
   feature says *paste*, and the overlays that populate the command line rather than submit it
   already have the mechanism (see the reuse table).
5. **The stored text is never truncated.** The one-line rendering is a display derivation over the
   full text, and the entry pastes in full.
6. **Choosing an entry does not write to the system clipboard.** The entry goes where the caret is;
   the OS clipboard is not re-written as a side effect.

### Answered by the user

7. **It is a plugin, in a new client-only overlay-plugin extension point.** The shape is decided,
   not left to the implementer: a third family, modelled on the editor-plugin family, whose
   plugins contribute a floating overlay rather than owning a tab or being barred from drawing. It
   carries the same disciplines the other two families already hold — a pure declaration read
   without executing plugin code, a lazy `import()` behind `React.lazy`, a handler budget, per-plugin
   failure isolation that leaves the host running, and its own API integer. The clipboard popup is
   its first bundled plugin. It shares no declarations, no catalog, and no API version with the tab
   or editor families, exactly as `documentation/developer-documentation/editor-plugins.md` states
   those two are separate.
8. **Contributing requires a registration seam, not another entry in a literal.** `OVERLAYS` is a
   hand-written literal and a tenth overlay currently means nine coordinated edits — `OverlayName`,
   `OverlayOpenSources`, `OVERLAYS`, `buildOverlayOpenState`, the `PickerOverlays` switch, the
   `useWindowKeys` switch, `usePickerOverlays`, the `PickerOverlayView`/`overlays-state`/key-binding
   projections, and the spec's priority list. The new family contributes through a registry rather
   than by being appended to a list, per `ai/guidelines/plugins.md` §2 — "an extension point is a
   list the host walks, not a switch statement the host maintains". The seam itself lives in
   `web/src/shared/` rather than inside the pickers, because the feature-directory lint zones forbid
   the pickers and the context menu from importing the plugin layer (see change 1).
9. **Ordering rule: plugin-contributed overlays rank after all nine core overlays.** A core overlay
   always wins a tie, so `Ctrl+Shift+V` pressed while Quick Open is up does nothing — which is
   already the documented behavior of the overlay stack ("the shortcuts that open the other overlays
   do nothing until it is dismissed", `product/specs/keyboard-navigation.md` § "Overlay priority").
   Registration order breaks ties inside the plugin band. Ceiling, named deliberately: v1 has no
   `pre` band, so a plugin can never preempt a core overlay. The upgrade path, when a second plugin
   needs it, is one optional `band` field on the declaration folded into the composed list, not a
   change to the seam.
10. **Two openers, exactly like `hist`, plus a third from the context menu.** The chord is
    **`Ctrl+Shift+V`** (currently unclaimed; plain `Ctrl+V` stays the browser's paste in the editor
    buffer and is not touched), and the command word is **`clip`**. Both always open rather than
    toggle, and both preselect the newest (bottom) row, matching `useHistPicker`'s `openPicker`.
11. **The plugin declares both its chord and its command word**, and the host arbitrates them the
    way the other two families do: a chord already claimed by another plugin, a core chord, or a
    command colliding with a built-in, the `schedule`/`harness`/`ssh`/`shell` routes, or another
    plugin's command is a **recorded refusal that disables that one plugin**, never a throw —
    `web/src/editor/plugins/registry.ts` `validateDeclarations` and `src/plugins/command-adapter.ts`
    `reservedName` are the two shapes to copy. `clip` additionally needs the server-side no-op twin
    `src/commands/hist.ts` is, so a `clip` that reaches the server non-interactively (a scheduled
    dispatch, `send`, a drained queue entry, an agent message) resolves harmlessly instead of
    prompting for a route.
12. **The entry is pasted at the caret, replacing any selection.** The mechanism is
    `CommandInputDropHandle.insertAtCaret` → `spliceIntoTextarea`, which splices at
    `selectionStart`/`selectionEnd` and replaces a non-empty selection. This is what the task picker
    uses through `insertIntoCommandLine`, and it is the opposite of `recallRef`, which replaces the
    whole value and would throw away half-typed input.
13. **One row per distinct text, and re-copying moves it to the bottom.** Exactly what
    `getRecentHistory` already does for command history, for the same reason: a 15-row cap filled
    with duplicates is not a history.
14. **Copies that are empty or only whitespace are not recorded.** `copyText` already no-ops on an
    empty string; the plugin additionally drops whitespace-only text, whose derived display line
    would be an unreadable blank row.
15. **The popup opens on every tab kind, including harness and ssh.** Three paste targets, resolved
    in this order:
    - the **command bar**, at its caret, by `insertAtCaret`;
    - an **editor buffer**, at its caret;
    - a **harness/ssh terminal's PTY**, typed as terminal input *without* a trailing Enter — the
      existing `insertIntoCommandLine` harness branch sends `ptyInput` with the bare text, unlike
      `typeIntoHarness` in `src/harness/input.ts`, which appends a delayed `\r` to submit. Pasting
      must not run the pasted text.
    This is wider than the two targets the feature text names, by the user's decision.
16. **The history lives in the browser, in memory, and never crosses the wire.** There is no
    server-side clipboard and no OS pasteboard integration anywhere in the app, and the pasteboard
    is deliberately unreachable from a shell — so a server-owned store would be one client reporting
    its own state back to itself. Nothing is persisted; the history is gone on reload. This also
    keeps architecture principle 1 intact in the only direction available: the server never
    computes this, and the client never recomputes server-owned state.
17. **The plugin owns the history.** Recording, ordering, dedupe, the cap, and the display
    derivation are the plugin's own state inside its lazily-loaded chunk. The consequence is
    deliberate and constrains the design: the six host copy sites must reach the plugin through a
    **subscription seam**, never a static import, because a static import from `copyText` into
    `web/src/overlay-plugins/clipboard-history/` would pull the plugin's chunk into the entry
    bundle and defeat the lazy load entirely. The seam is a subscribe/notify module in
    `web/src/shared/`, shaped like `web/src/shared/drop-registry.ts` and
    `web/src/file-navigator/file/navigator-clipboard.ts`; the plugin subscribes when it activates
    and releases its subscription when it is disabled or the host shuts down.
18. **In an editor, the caret ends at the *start* of the pasted text.** `EditorApi.paste` does this
    deliberately (`web/src/editor/applyKeyAction.ts` `pastedState`), and it is what a real `Cmd+V`
    does in this editor. `EditorApi.insert`, which leaves the caret at the end, is what a
    file-navigator drop uses; the two are not interchangeable and the clipboard entry is a paste.
19. **Two distinct ellipses, one per cause.** Multi-line text gets a literal `…` appended by the
    derivation, because that case is knowable without measuring anything and unit-testable. An
    over-long single line gets a CSS ellipsis, which needs `overflow: hidden` and
    `text-overflow: ellipsis` on the row — `.picker-row` at `web/src/theme.css:514` has
    `white-space: nowrap` and nothing else, so today a long row overflows the popup instead of
    truncating.
20. **The context-menu entry is `Paste from clipboard…`, it opens the same popup, and it is always
    offered.** It sits in the default menu's single group beside the existing `Paste`, which is
    unchanged. Offered always means, unlike today's rule, that a right-click on a terminal with no
    held selection and no field holding the keyboard now opens the app's menu — currently that
    surface opens no menu at all (`web/src/context-menu/default-menu-target.ts:71` withholds Paste
    with no `pasteTarget`, and `useDefaultContextMenu` bails when there is neither a selection nor a
    target). The popup appears at its usual bottom anchor when opened this way, not at the pointer:
    one component, one anchor, wherever it is opened from. "Always" also reaches the editor, which
    means removing the editor's own special cancel — see change 2a.
21. **Choosing an entry from a menu-opened popup pastes into what was right-clicked.** The target is
    resolved from the right-clicked element when the menu supplied one, falling back to whichever
    field holds the keyboard — which is `resolvePasteTarget`'s existing rule, reused rather than
    restated. The menu closes and focus returns before the popup opens, so the element has to be
    captured at open time and handed to the paste, not re-resolved later.
22. **A plugin's open state is the plugin's own state, not a field threaded through the projections.**
    The nine core overlays each have a boolean on `OverlayOpenSources` because they are app state the
    projections carry; a contributed overlay's open flag already lives with the plugin, in the seam it
    registered with. Threading it as well would duplicate the one source of truth for no gain.
23. **The popup does not open on plugin tabs.** `PluginTabLayer` receives no `pickerOverlays` today
    and has no caret to paste into; giving it the overlay stack is a separate change that would start
    rendering other overlays there as a side effect. Harness and ssh tabs are the opposite case and
    do get it (decision 15).
24. **No synthetic `fixture-v1` overlay plugin.** `ai/guidelines/plugins.md` §11 asks for a fixture
    per extension point, and this one is cut deliberately rather than by omission: this family has no
    persisted payload to round-trip, so the fixture would assert only what `validateDeclarations` and
    the documentation test already assert. That is the same position the editor-plugin family takes,
    which ships `commenting`, `indenting`, and `multiselect` with failure tests and no fixture.

### Added by gap research, then settled with the user

25. **The cap is a `.janissary/config.json` setting, on the `transcriptMaxLines` chain.** The field
    is `clipboardHistoryMaxEntries`, defaulting to 15, and it follows that precedent exactly: a typed
    field on `Config` (`src/config.ts:21`), a `DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES` constant beside
    the other `DEFAULT_*` caps, an entry in `DEFAULT_CONFIG`, and one `numberValue` decoder line in
    `src/config-decode.ts`. It is hand-edited, like `transcriptMaxLines`, and needs no command —
    `product/specs/application-config.md` only requires a command for a runtime *toggle*, and the
    precedent for two sibling caps (`tabNameMaxLength`, `activeTabNameMaxLength`) is hand-edit only.
    The value reaches the browser the way those two do: built in `src/state-event.ts`, added to the
    state event's wire type in `src/protocol/events.ts`, and seeded in `web/src/useServerState.ts`.
    Per-project, like every other setting. The reason is a lookup, not a preference: the client has
    no storage of its own — `localStorage`, `sessionStorage`, and `indexedDB` appear nowhere in the
    repository — so a client-side setting could not survive a reload, and the server is already the
    only place a persisted setting can live.
26. **Anything that is not a positive integer falls back to 15** — `0`, negatives, fractions, a
    string `"15"`, and a missing key — and a bad value never disturbs its neighbours.
    **This is genuinely new validation, not a free reuse**, which the plan initially got wrong:
    `numberValue` at `src/config-decode.ts:13` is `typeof value === 'number' ? value : fallback`, so
    it accepts `0`, `-5`, and `2.5` happily. `decodeConfig`'s stated policy is per-*type*
    ("a value with the wrong type falls back to that setting's default"), and a cap is the one field
    where a well-typed number can still be nonsense. So `config-decode.ts` gains a
    `positiveIntegerValue(value, fallback)` beside `numberValue`, used by this field alone, and
    `product/specs/application-config.md`'s row states the stricter rule for this one setting so the
    file's policy paragraph stays true for everything else.
27. **Lowering the cap trims immediately.** The plugin's store applies the cap when it is handed the
    new value, discarding the oldest entries over it, so the visible list always matches the
    configured number. In practice this surfaces at startup, since the config file is read once in
    `src/main.ts:75` — the same restart requirement every other config setting carries.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| A seam two features reach without importing each other | `drop-registry.ts` `createRegistry` — written because "the features may not import each other, and a single ref could only ever name one of them" | `web/src/shared/drop-registry.ts:9,11` |
| Re-rendering on a module-level store without threading props | `useSyncExternalStore` over a snapshot + `subscribe` | `web/src/file-navigator/useFileNavigatorPaste.ts:29` |
| A top-level module free to import features | `MountedViewLayers` imports the editor, harness, plugin, and picker features | `web/src/MountedViewLayers.tsx:5-14` |
| A static plugin-id union folded into a wider type | `ProductionTabPluginId` beside `tabPluginCatalog` | `src/plugins/catalog.ts:18` |
| The popup being modelled on | `HistoryPicker` — `.picker` / `.picker-title` / `.picker-row` markup, empty placeholder row, `data-doc-shot` hook | `web/src/pickers/HistoryPicker.tsx` |
| Popup open/select/close state | `useHistPicker` — open-always, preselect bottom row, pick-then-close | `web/src/pickers/useHistPicker.ts` |
| Picker's clamped arrow-key model | `handlePickerKey` — `Math.max`/`Math.min` clamped, no wraparound; Enter; Escape | `web/src/keyboard-handlers.ts:20` |
| The ordered overlay registry every overlay answers to | `OVERLAYS`, `firstOpenOverlay`, `commandBarSuppressed`, `commandBarDisabled`, `buildOverlayOpenState` | `web/src/pickers/overlay-registry.ts` |
| Where an overlay is rendered and given keys | the `PickerOverlays` switch; `dispatchModalKey` in `useWindowKeys` | `web/src/pickers/PickerOverlays.tsx:33`; `web/src/useWindowKeys.ts:31` |
| A chord opening a picker | `ctrlChordOpener` — `Ctrl+R`/`Ctrl+G`/`Ctrl+E`/`Ctrl+A` keyed by letter | `web/src/useWindowKeys.ts:104` |
| Letting a chord out of a full-tab terminal | `isPickerChord` (Ctrl+A, Ctrl+G) plus `harnessKeyFilter` | `web/src/shared/terminal/window-chords.ts:13` |
| Matching a declared modifier chord | `eventChordId` / `matchBinding`, and `claimedByCore` | `web/src/editor/plugins/chords.ts:20,30,43` |
| A command word opening a picker, with a server no-op twin | `hist` intercepted at submit; `src/commands/hist.ts` is the 10-line server no-op | `web/src/agent-tabs/command-input/useCommandBarSubmit.ts:36`; `src/commands/hist.ts` |
| Recording a refused declaration instead of throwing | `validateDeclarations` (editor plugins); `rejectContribution` (tab plugins) | `web/src/editor/plugins/registry.ts:74`; `src/plugins/rejections.ts:9` |
| A lazily-loaded plugin module behind `React.lazy` | `clientPlugin`, and `editorPluginLoaders`' literal `() => import(...)` | `web/src/plugins/registry.tsx:49`; `web/src/editor/plugins/registry.ts:51` |
| A plugin host with a timeout and per-plugin disable | `createEditorPluginHost`, `HANDLER_TIMEOUT_MS`; the shared `guardPluginCall` | `web/src/editor/plugins/host.ts:35,14`; `src/plugins/guard.ts:5` |
| A lint boundary for a client-only plugin layer | the `web/src/editor/plugins/*/**` block in `eslint.plugin-boundaries.mjs` | `eslint.plugin-boundaries.mjs:104-115` |
| An enforced test over those lint blocks, and their count | `src/eslint-plugin-boundaries.test.ts`, whose header states how many blocks exist | `src/eslint-plugin-boundaries.test.ts:5,30` |
| The editor's own no-menu-on-empty-selection rule | `onContextMenu` on the editor body | `web/src/editor/EditorTab.tsx:151` |
| The restricted overlay set a harness tab renders | `MountedViewLayers`' harness branch; `PickerOverlayProps` / `mountedPickerOverlayProps` | `web/src/MountedViewLayers.tsx:77`; `web/src/pickers/picker/overlay-props.ts` |
| Inserting text at the command bar's caret | `CommandInputDropHandle.insertAtCaret` → `spliceIntoTextarea`, which splices at the selection and replaces it | `web/src/agent-tabs/command-input/CommandInput.tsx:67`; `web/src/shared/command-bar/textarea-splice.ts` |
| The command-bar-vs-harness split, already written | `insertIntoCommandLine` — `ptyInput` on a harness tab, `dropRef.insertAtCaret` otherwise | `web/src/pickers/populate-command-line.ts:25` |
| Inserting text into an editor at the caret, by lookup | `useEditorDrop` registers a handle keyed by the tab label written on `data-editor-drop`; `registerEditorDrop` / `editorDropHandle` | `web/src/editor/useEditorDrop.ts:13`; `web/src/shared/drop-registry.ts:28` |
| Paste-semantics editor insertion (caret at the start) | `EditorApi.paste` | `web/src/editor/useEditor.ts:21` |
| Reading which field holds the keyboard | `resolvePasteTarget`, `isTextEntryElement` | `web/src/context-menu/default-menu-target.ts:25,40` |
| One writer for clipboard text | `copyText(text)` — no-ops on empty, fire-and-forget | `web/src/shared/system-clipboard.ts:14` |
| Reading the clipboard for the existing Paste | `pasteInto` / `readClipboardText` | `web/src/context-menu/clipboard-commands.ts:35,8` |
| A subscribe-and-notify seam between two features that may not import each other | `drop-registry.ts` `createRegistry`; `navigator-clipboard.ts`'s snapshot + listeners | `web/src/shared/drop-registry.ts:11`; `web/src/file-navigator/file/navigator-clipboard.ts` |
| An existing pure newest-first / unique / cap derivation | `getRecentHistory(history, count)` | `web/src/history.ts:4` |
| A configurable numeric cap, end to end | `transcriptMaxLines` — `Config` field, `DEFAULT_*` constant, `DEFAULT_CONFIG` entry, a decoder line, read via `getConfig()` at the cap site | `src/config.ts:22,56,67`; `src/config-decode.ts:59`; `src/tab/transcript/state.ts:40` |
| Where the config chain's tests live | `src/config.test.ts` — `loadConfig`, `decodeConfig`, and `updateConfig` in one suite; there is no `config-decode.test.ts` | `src/config.test.ts:13,265` |
| Getting a server setting into the browser | `tabNameMaxLength` / `activeTabNameMaxLength` — built in `state-event.ts`, added to the event's wire type, seeded in a hook | `src/state-event.ts:19`; `src/protocol/events.ts:13`; `web/src/useServerState.ts:26` |
| A config file written atomically, preserving unknown keys | `updateConfig` — returns `false` on failure rather than throwing | `src/config.ts:133` |
| An existing row-ellipsis precedent | Quick Open's fuzzy rows already truncate; `.picker-row` needs the two properties added | `web/src/theme.css:514` |

## Proposed changes

### 1. The overlay-plugin extension point

**A verified constraint shapes where this lives.** `eslint.config.mjs:9-37` declares
`clientFeatureDirectories` and turns every ordered pair of them into an `import-x/no-restricted-paths`
zone, so `web/src/pickers/`, `web/src/context-menu/`, `web/src/editor/`, and `web/src/harness/` may
not import one another — and `web/src/shared/` may not import any of them. `web/src/pickers/` may
therefore never import the plugin layer, and the context menu may never import it either. Meanwhile
`web/src/MountedViewLayers.tsx` shows that a **top-level** `web/src/*.ts(x)` module is unconstrained
and freely imports features, because that is the app shell.

That fixes the direction: the seam lives in `shared`, the family sits outside the feature list, and
the paste capability is built at the app-shell edge and injected.

- **`web/src/shared/contributed-overlays.ts`** — the seam. `registerContributedOverlay(descriptor)`
  returning an unsubscribe function, plus the lookup and "open this one by name" the context menu
  needs. This is `web/src/shared/drop-registry.ts` verbatim in shape — the reason that file exists is
  "the features may not import each other, and a single ref could only ever name one of them", which
  is exactly this problem. The descriptor is pure data: the plugin id, a render function, a key
  handler, the `claimsCommandBar` bit, the open/close actions the host calls, and an `isOpen` the
  host reads.
- **`web/src/overlay-plugins/`** — the family, outside `clientFeatureDirectories` and reachable from
  the app shell only. No barrel file, mirroring `web/src/editor/plugins/`:
  - `api.ts` — the versioned contract: `OVERLAY_PLUGIN_API_VERSION` (start at 1), the
    `OverlayPluginDeclaration` (identity `id` and `version`, the requested `apiVersion`, a `chord`, a
    `command`, and the empty-state text), the popup's props (the derived display lines paired with
    their full text, and the selected index), the `OverlayPluginModule` default export, and the
    `OverlayPluginLoader` type. Every host-visible signature is written out at the contract rather
    than inferred from the implementation, the way `web/src/editor/plugins/api.ts` pins its
    re-exported helpers, so a refactor that changes what a plugin sees fails to typecheck here where
    the version decision belongs.
  - `registry.ts` — `overlayPluginDeclarations`, the pure data the host reads to answer "what chords
    and commands are claimed" without importing plugin code; `overlayPluginLoaders`, literal
    `() => import('./<id>')` entries, never a filesystem walk; `ProductionOverlayPluginId`, the
    static id union that `src/plugins/catalog.ts` already models; and `validateDeclarations`,
    refusing a duplicate chord, a chord the core already claims
    (`claimedByCore` / `actionForKey`, `web/src/editor/plugins/chords.ts:43`,
    `web/src/editor/keys.ts:114`), a command colliding with a built-in or another plugin's, and
    returning every refusal as data rather than throwing — `validateDeclarations` at
    `web/src/editor/plugins/registry.ts:74` is the shape to copy.
  - `host.ts` — `createOverlayPluginHost`, session-scoped: a lazy `load` behind the activation
    budget, `guardPluginCall` (`src/plugins/guard.ts:5`) around every handler call, a `disable` that
    records one reason and affects that plugin alone, and `dispose` that unregisters the descriptor
    and releases the plugin's subscription to the capture seam. Modelled on
    `createEditorPluginHost` (`web/src/editor/plugins/host.ts:35`).
  - `clipboard-history/` — the plugin. `store.ts` owns the ring (record, dedupe, cap, ordering) as
    module state inside the chunk; `display.ts` is the pure first-line-of-non-space-text derivation
    returning the display line and whether a literal ellipsis belongs after it; `index.tsx` is the
    popup component, written in the same `.picker` markup as `HistoryPicker` so the CSS is shared
    rather than duplicated.

### 2. The overlay registry seam

`web/src/pickers/overlay-registry.ts` (98 lines today) gains the ability to be walked rather than
only read, reading the contributed descriptors from `shared`:

- `OVERLAYS` stays the nine core descriptors. `firstOpenOverlay`, `commandBarSuppressed`, and
  `commandBarDisabled` keep their signatures and their behavior for the core band, and each consults
  the contributed band after it — so all three keep answering from one ordered source without any
  caller changing shape.
- **`OverlayName` widens to `CoreOverlayName | ProductionOverlayPluginId`.** This is the part that
  matters: the registry's whole point, per its own comment, is that "a tenth overlay added to
  `OverlayName` fails to compile here until it is mapped, and then fails at each caller until the
  state behind it is supplied". Making the plugin ids part of the union *extends* that
  compile-time exhaustiveness to bundled overlay plugins instead of weakening it, and it is exactly
  the shape `src/plugins/catalog.ts`'s `ProductionTabPluginId` already uses. The core nine keep
  their static check; a bundled plugin's open state is read from the seam rather than threaded by hand.
- The contributed band's open state therefore needs **no new field on `OverlayOpenSources`** and no
  edit to `web/src/pickers/picker/overlays-state.ts`, `overlay-view.ts`, `key-bindings.ts`, or
  `usePickerOverlays.ts`. That is the deliberate difference from how the nine core overlays are
  wired: a core overlay's open flag is app state the projections carry, whereas a plugin overlay's is
  the plugin's own state, already inside the seam the plugin registered it with.
- The render chain and the key chain keep their existing `case` arms untouched and gain a
  `default:` arm that resolves a contributed name through the seam. Their core behavior does not
  change.
- `PickerOverlays` re-renders when a contributed overlay opens because the app shell subscribes once
  to the seam with `useSyncExternalStore` — the same shape
  `web/src/file-navigator/useFileNavigatorPaste.ts` already uses over
  `web/src/file-navigator/file/navigator-clipboard.ts`. `useWindowKeys` needs no subscription: its
  window listener reads the seam through a plain function call, exactly as it already calls
  `firstOpenOverlay(buildOverlayOpenState(snap))`.

### 2a. The two places this seam reaches that the plan must not miss

- **Harness tabs render their own restricted overlay set.** `web/src/MountedViewLayers.tsx:77-86`
  passes `TaskPicker` and `TabNavPicker` to `HarnessTabLayer` rather than the whole `PickerOverlays`
  node, and `web/src/pickers/picker/overlay-props.ts` says so in a comment — "Only these two
  overlays reach a harness tab". Both become false under decision 15. The clipboard overlay joins
  those two in that branch and in `PickerOverlayProps` / `mountedPickerOverlayProps`, following the
  existing pattern rather than replacing the restricted set with the full stack: passing the whole
  `PickerOverlays` node there would additionally start rendering Quick Open over a harness tab, which
  is a behavior change this feature did not ask for.
- **An editor tab stops being an exception.** `web/src/editor/EditorTab.tsx:151` is
  `onContextMenu={(event) => { if (!selectionText) event.preventDefault(); }}` — it cancels the event
  outright whenever the editor has no selection, so no menu opens there, not even the browser's.
  `product/specs/context-menu.md` calls that deliberate ("The editor is the exception"). It is exactly
  the surface a reader would expect the new entry on, so it is **overridden**: that one-line cancel
  is removed and the editor follows the rule every other surface already follows. Its hidden
  `.editor-textarea` holds the keyboard, so `resolvePasteTarget` resolves it and an empty-selection
  right-click there offers `Paste` **and** `Paste from clipboard…` — the plain `Paste` becoming
  available there is the accepted cost, and the spec's exception paragraph is replaced by the
  ordinary rule rather than amended. The cancel was already the wrong instrument: it suppressed the
  browser's own menu too, and suppressing the browser's menu is `useDefaultContextMenu`'s job once it
  decides to answer (`event.preventDefault()` at `:53`), which it now always does on an editor.
  `EditorTab.tsx` is 193 lines, so removing the line is also the only edit that keeps it under the
  200-line limit.

### 2b. Where the popup does not open

- **Plugin tabs.** `web/src/plugins/PluginTabLayer.tsx` is given no `pickerOverlays` and no
  `overlayOpen`, so no overlay renders over a markdown, image, pdf, page, video, sql, or
  conversations tab. The clipboard popup stays off them: they have no overlay surface today and no
  caret to paste into. Giving `PluginTabLayer` the stack the way editor tabs already get it is a
  separate change, and doing it here would start rendering other overlays there as a side effect.
- **Harness and ssh tabs are the opposite case** and are covered by decision 15: they get the
  clipboard overlay alongside the task picker and tab navigator.

### 3. The capture seam and the six copy sites

- A new module in `web/src/shared/` exposes `subscribeClipboardCopies(listener)` returning an
  unsubscribe function, and `captureCopiedText(text)`. `copyText` in
  `web/src/shared/system-clipboard.ts` calls `captureCopiedText` after its existing empty-string
  short-circuit, so the plugin sees exactly what the app wrote and nothing else. No plugin code is
  imported by this path, and the seam costs nothing while no plugin is listening.
- The five sites that write to `navigator.clipboard` directly are routed through `copyText`, so
  there is one recording point: the editor's copy and cut (`web/src/editor/applyKeyAction.ts`), the
  terminal's own copy chord (`web/src/shared/terminal/useXterm.ts`), the SQL grid's row copy
  (`web/src/plugins/sql/selection.tsx`), and transcript drag-select (`web/src/agent-tabs/AgentTabBody.tsx`).
  Its OSC 52 handler already went through `copyText`. Behavior at each site is unchanged.
- **The SQL grid needs `copyText` to grow an optional failure callback, and to be published from the
  tab-plugin client API.** Two constraints collide at that one site. It deliberately keeps its own
  write so a denied copy can say why — "Copy is unavailable here. Select and copy this text: …" —
  and `copyText` swallows a denied write by design. But it is a *client tab plugin*, and
  `eslint.plugin-boundaries.mjs` forbids a plugin importing anything but its own contract, the plugin
  stylesheet, and `@shared/*`; so it cannot reach the seam module directly either. The resolution is
  the surface tab plugins already have: `copyText` takes an optional `onFailure(text)`, and
  `web/src/plugins/api.ts` re-exports it. Both are additive, so `TAB_PLUGIN_API_VERSION` does not
  move — the same reasoning the existing re-exports there carry.
- Whitespace-only filtering and the cap live in the plugin's store, not in the seam, because the
  plugin owns the history (decision 17).
- The invariant is pinned by one tree-scanning test rather than one assertion per site: no file under
  `web/src/` other than the seam's own writer may contain `navigator.clipboard.writeText`. A
  per-site test cannot cover a site added later; this one can, and it names the path that broke it.

### 4. The plugin's paste capability

The plugin never reaches for a DOM element, a PTY id, or an editor handle. It receives one
capability — the whole reason the family exists — whose contract is: given the text to paste and,
optionally, the element the user right-clicked when the popup was opened from the context menu,
insert it at the caret of the resolved target.

The capability is **built at the app-shell edge and injected**, per
`ai/guidelines/react-code-organization.md` §7 ("Instantiated at the edge, not imported into
components"). It lives in a top-level `web/src/*.ts` module, which is the only place free to import
`pickers`, `editor`, `harness`, and `shared` at once, and the overlay-plugin host is constructed
with it. The host resolves, in order:

1. a field the click landed in, or the field holding the keyboard, via `resolvePasteTarget`
   (`web/src/context-menu/default-menu-target.ts:40`);
2. otherwise the current tab's editor buffer, resolved by walking up from the focused element to
   `[data-editor-drop]` — which `web/src/editor/EditorTab.tsx:147` already writes — and looking that
   label up in the existing editor drop registry (`web/src/shared/drop-registry.ts:28`);
3. otherwise the current tab's harness/ssh PTY, via `ptyInput` with the bare text and no trailing
   Enter, exactly as `insertIntoCommandLine` already does
   (`web/src/pickers/populate-command-line.ts:31`);
4. otherwise the command bar, when the tab has one, through `dropRef.current.insertAtCaret`.

Step 1 is a reuse of an exported function rather than a restatement of it — worth noting because
getting it wrong is the failure the clipboard popup cannot have: `isTextEntryElement` returns true
for **both** the command bar's textarea and an editor's hidden `.editor-textarea`, so "is some field
focused" cannot distinguish them, which is why the resolution is ordered by identity rather than by
"a field exists".

The editor case needs `EditorDropHandle` (`web/src/shared/drop-handles.ts:17`, currently
`{ insertAtCaret }`) to grow a second member alongside `insertAtCaret` — one carrying `api.paste`'s
caret-at-the-start semantics (decision 18) — so the file-navigator drop keeps `api.insert` unchanged
and the clipboard entry gets paste semantics. Growing the existing handle is deliberately smaller than
adding a second registry: one field on a type the seam already looks up, against a new registry, a
new key, and a new lookup path for one extra function. Adding a member is not an editor-plugin API
change: `EditorDropHandle` is the host's own drop plumbing in `web/src/shared/`, not
`web/src/editor/plugins/api.ts`'s versioned contract.

### 5. Openers

- **Chord.** `web/src/useWindowKeys.ts` is **180 lines today** and this change adds a plugin-chord
  arm plus a `default:` arm, so it would cross the 200-line limit. Extract rather than compact: the
  plugin-chord consultation becomes its own module in the overlay-plugin layer, and `handleChordKeys`
  calls it — the same move this file already made four times, splitting `ctrlLetterShortcut`,
  `metaChordOpener`, `handleChordKeys`, and `tabSwitchDirection` out for exactly that reason.
- The chord is consulted **after** the core chord table, so a core chord always wins; it is matched
  through the `eventChordId` / `matchBinding` shape at `web/src/editor/plugins/chords.ts:20,30`
  rather than by extending `ctrlChordOpener`, whose `e.ctrlKey` test never looks at `shiftKey` and
  would therefore also claim a bare `Ctrl+V`.
- **The chord must call `preventDefault()`, and this matters more here than for the existing
  openers.** In a text field — which is exactly where the editor keeps its keyboard, in the hidden
  `.editor-textarea` — browsers bind `Ctrl+Shift+V` to "paste as plain text", and that keydown still
  reaches the page. Without `preventDefault()` the popup opens *and* the browser pastes, in the same
  keystroke. `handleChordKeys` already prevents default for every chord it claims
  (`web/src/useWindowKeys.ts:148`), so matching that is the whole fix; it is called out because the
  symptom is a double action rather than a missing one.
- `web/src/shared/terminal/window-chords.ts` gains the predicate that lets the chord out of a
  full-tab terminal, so `harnessKeyFilter` (`web/src/harness/HarnessTab.tsx:23-26`) passes it
  through the way it already does for `Ctrl+A` and `Ctrl+G` (decision 15).
- **Command.** `clip` is intercepted at submit beside `if (trimmed === 'hist') openPicker();`
  (`web/src/agent-tabs/command-input/useCommandBarSubmit.ts:36`). `src/commands/clip.ts` is the
  server-side no-op twin of `src/commands/hist.ts` — same shape, same `samples`, same "reaching the
  server non-interactively is a no-op" rationale — registered in `src/commands/index.ts`, so a `clip`
  arriving by any non-interactive route resolves harmlessly (decision 11).

### 5a. The lint boundaries

Two, and they are not the same rule:

- **The new family gets an eighth block in `eslint.plugin-boundaries.mjs`**, shaped like the
  editor-plugin block at `:104-115`: `web/src/overlay-plugins/*/**` restricted from reaching
  `^\.\./(?!api$)`, with `**/*.test.ts(x)` ignored, because a concrete overlay plugin may not reach
  host internals or another plugin and may speak only to `api.ts`.
- **`eslint.config.mjs` gains one `import-x/no-restricted-paths` zone** making the nine existing
  feature directories unable to import `web/src/overlay-plugins/`, with the message naming the
  alternative — register through `shared/contributed-overlays.ts`. Without it the one-way flow the
  whole arrangement depends on is a convention rather than an enforced boundary, which is precisely
  what `ai/guidelines/react-code-organization.md` §3 says to prefer enforcement over.

`src/eslint-plugin-boundaries.test.ts` enforces the first and counts both — its header reads "The
seven restricted-import blocks", so that wording becomes eight, and the file gains a rejected case
(a plugin reaching a host module) and an allowed case (a plugin importing `../api`). Without both, a
regex that stops matching disables its rule silently, and the first symptom is a plugin's chunk
folded into the entry bundle, which nothing else reports. The zone in `eslint.config.mjs` is covered
by `src/eslint-feature-boundaries.test.ts`, which is where the existing feature zones are pinned.


### 6. The context-menu entry

`web/src/context-menu/` may not import `web/src/overlay-plugins/` — both are feature directories
under the zone rule in change 1 — so the entry opens the popup through the same shared seam, exactly
as it reaches the file navigator's drop handles today.

- `web/src/context-menu/default-menu-target.ts`'s `defaultMenuGroups` (`:60`) gains the
  `Paste from clipboard…` entry alongside `Copy` and `Paste`, and `DefaultMenuActions` gains the
  callback that opens the contributed overlay by plugin id. The entry is unconditional (decision 20),
  which means `useDefaultContextMenu`'s early return — currently
  `if (!target.selectionText && !target.pasteTarget) return;` at `:52` — must account for the new
  entry, so a right-click on a terminal with nothing selected and no focused field opens the app's
  menu instead of leaving the browser's.
- Activating it captures `pending.pasteTarget ?? clicked` and the current tab so the later paste
  knows where to land (decision 21), closes the menu, and opens the popup at its usual bottom
  anchor. The existing `Paste`, `Copy`, and the tab plugin's contributed entry are untouched.
- The terminal's held-selection case still withholds `Paste` — that rule is about a committed copy
  region, and the new entry does not change it, because the new entry pastes into the terminal only
  when nothing else holds the keyboard.

### 7. The configurable cap

`transcriptMaxLines` is the precedent and this copies it end to end (decision 25):

- `src/config.ts`: `clipboardHistoryMaxEntries: number` on `Config`, a
  `DEFAULT_CLIPBOARD_HISTORY_MAX_ENTRIES = 15` constant beside the other cap defaults (`:56`), and the
  entry in `DEFAULT_CONFIG` (`:67`). Shipping the default in `DEFAULT_CONFIG` is what makes a missing
  key safe, so an existing project's config file needs no edit.
- `src/config-decode.ts`: a `positiveIntegerValue` helper beside `numberValue`, and one line in
  `decodeConfig` using it. That helper is the whole of decision 26, and it is new — `numberValue`
  alone would let `0` and `-5` through.
- `src/state-event.ts`: add the field beside `tabNameMaxLength` / `activeTabNameMaxLength`;
  `src/protocol/events.ts`: the matching field on the state event's wire type;
  `web/src/useServerState.ts`: seed it beside the other two caps. **No mirror type** — the client
  imports these from `@shared/protocol` (architecture principle 7).
- The value is handed to the plugin as part of its capabilities, alongside the paste capability,
  because the plugin owns the store and therefore owns applying the cap (decisions 17 and 27).
- `product/specs/application-config.md` gains the row: name, default 15, hand-edited, and that it
  takes effect at startup.

### 8. Specs

- New `product/specs/clipboard-history.md`: what is recorded (every in-app copy, text only, no
  empty or whitespace-only), the newest-at-the-bottom order, the dedupe-and-promote rule, the cap and
  its setting, the one-line rendering with its two ellipses, the three paste targets and the caret
  rules for each, the three openers and the popup's key model, and that nothing is persisted.
- `product/specs/keyboard-navigation.md`: a `Ctrl+Shift+V` row in the chord table, and the plugin
  band appended to the "Overlay priority" list with decision 9's tie rule stated.
- `product/specs/context-menu.md`: the new entry, that it is always offered, that it opens the
  clipboard popup at its normal anchor, and that `Copy` and the terminal-selection rule are
  unchanged. Two existing paragraphs change rather than merely gain a sentence, and both have to be
  rewritten or they will mislead: "When neither entry applies — a right-click on a surface with
  nothing selected and nowhere to type — no menu opens at all", which is no longer true now that an
  entry always applies, and "The editor is the exception: an empty-selection right-click there opens
  no menu, including the browser's own menu", which is no longer true at all. The replacement states
  that the browser's own menu never appears wherever the app's menu answers, and that the editor is
  no longer exempt.
- `product/specs/application-config.md`: the `clipboardHistoryMaxEntries` row (change 7).

### 9. Documentation

- New `documentation/developer-documentation/overlay-plugins.md`, following the structure of
  `editor-plugins.md`: trust stated first, the smallest working example copied from shipped code, a
  "Files to add" tree with the registration edges named, the declaration reference, the chord and
  command resolution and the recorded-refusal rule, the capability reference, the budgets, and what
  a plugin may not do. It is test-pinned the way `web/src/editor/plugins/registry.test.ts:58-91`
  pins its own page, so the example cannot drift from the shipped declaration.
- New `documentation/user-documentation/command-bar/clipboard.md` for the user-facing behavior,
  including the `clipboardHistoryMaxEntries` setting, plus the `Ctrl+Shift+V` and `clip` rows in
  `help.md` and in `documentation/user-documentation/getting-started/keyboard.md`.


- The seam owns claim resolution, not just the overlay. The plan first had the command bar and the
  context menu ask the overlay-plugin *host* which plugin claimed `clip`. The new feature-directory
  lint zone forbids that, and it was right to: a feature would have held a plugin host to open a menu.
  The seam now carries the claims — the chord ids and command word, resolved by the host from the
  declaration — plus an opener the host installs, so a feature names a chord or a command word and
  never learns that a plugin exists. This is the same seam with three more questions in it, not a new
  layer, and it is why the zone can be strict.
- The plugin is given a `close` capability rather than importing the seam. Same reason: it is the one
  action a plugin needs that is not about the outside world, and handing it over keeps the plugin's
  only shared import the capture seam.
- **`OverlayName` is not widened to include plugin ids.** The plan widened it so a bundled plugin's id
  would join the compile-time exhaustiveness `buildOverlayOpenState` relies on. It turned out not to be
  needed and not to be possible: the contributed band never enters `OverlayOpenState`, so widening the
  union would have bought nothing, and importing the id union from the plugin layer into
  `pickers/overlay-registry.ts` is exactly what the new zone forbids. `OverlayName` stays the nine core
  names, `firstOpenOverlay` stays core-only and keeps its exhaustive `OverlayOpenState`, and both
  `switch` chains gained a `default:` arm that consults the seam — which reads better than the
  `activeOverlay` helper this plan proposed, because `undefined` from `firstOpenOverlay` is exactly
  "no core overlay is up".
- `handlePickerKey` is published from `api.ts` rather than written by the plugin. The plan assumed a
  plugin could not import it, and the plugin boundary is what made that true; publishing it keeps one
  definition of what a modal list does with the keyboard.
- **The SQL grid's copy goes through a published `copyText` with a failure callback**, as change 3
  records, rather than writing to the clipboard itself and publishing to the seam.
- `Ctrl+Shift+V` needs `eventChordId`, not `overlayChordId`, at the window handler. The two shapes are
  not interchangeable — a `KeyboardEvent` carries `metaKey`/`ctrlKey`, a chord carries `meta`/`ctrl` —
  and passing one where the other is expected type-checks and reads every modifier as absent. That was
  a real bug, caught by the chord test, and `eventChordId` exists with a comment saying why.
- No documentation screenshot. `HistoryPicker` carries `data-doc-shot` because
  `scripts/docs-screenshots/manifest.mjs` generates its image; this popup has no manifest entry and
  generating one needs a live run, so the hook is left off rather than pointing at nothing. Adding the
  manifest entry and the PNG is a separate piece of work.

## Tests

Client tests colocated as `web/src/**/*.test.ts(x)`, run through `./scripts/run.mjs check-diff`.

- **The derivation** (`display.test.ts`, pure): a single line with leading whitespace and newlines
  before it yields that line with no ellipsis; multi-line text yields the first line plus a literal
  `…`; text whose first line is the whole text yields no ellipsis; a text that is only whitespace
  never reaches the store.
- **The store** (`store.test.ts`): newest at the bottom; the cap keeps the configured number of
  entries and drops the oldest; re-copying existing text moves its one row to the bottom rather than
  adding a second; empty and whitespace-only copies are ignored; a cap lowered below the number held
  trims immediately.
- **The configurable cap** (`src/config.test.ts`, which is where `loadConfig`, `decodeConfig`, and
  `updateConfig` are all exercised — there is no separate `config-decode.test.ts`): the default is 15
  when the key is absent, from a fresh config, and from an existing project config that predates the
  feature; `0`, a negative, a fraction, and a string all fall back to 15; a bad value for this field
  leaves a valid neighbour intact and vice versa; `updateConfig` preserves the field when rewriting
  an unrelated key. The state event carries the resolved number, and `useServerState` seeds it.
  `positiveIntegerValue` itself is covered by those cases rather than by a suite of its own.
- **The extension point** (`registry.test.ts`): a duplicate chord is refused; a chord the core
  claims is refused; a command colliding with a built-in or with another plugin's is refused; each
  refusal disables that plugin alone and is recorded rather than thrown; the loader map holds a
  literal dynamic import per id and no static import of any implementation.
- **The host** (`host.test.ts`): a plugin that throws or exceeds its budget on open is disabled and
  the app keeps running; the plugin's chunk is not reachable from the entry bundle; dispose releases
  the capture subscription.
- **The seam and the copy sites**: `copyText` notifies subscribers once per written text, not at all
  for an empty one, and still notifies when the browser withholds the clipboard; a throwing subscriber
  does not cost the others their copy; unsubscribing leaves a later registration in place. The
  editor's copy and cut each publish to the seam. The SQL grid publishes to the seam *and* still
  surfaces its denial message, which is what the published `copyText`'s failure callback buys. And the
  tree-scanning invariant: no file under `web/src/` but the seam's own writer writes to
  `navigator.clipboard` directly.
- **Paste resolution** (`paste-target.test.ts`, pure over injected elements): the right-clicked field
  wins; otherwise the focused field; an editor buffer is found through `data-editor-drop` and gets
  paste semantics; a harness tab writes bare text to the PTY with no trailing Enter; a command bar
  splices at the caret and replaces a non-empty selection; nothing to paste into is a no-op.
- **The popup** (`index.test.tsx`): title `clipboard`, empty row `(no clipboard history)`, rows show
  the derived line, Return and a row click paste the *full* stored text and close, Escape closes,
  Up/Down are clamped with no wraparound, and the CSS ellipsis properties are on the row.
- **Openers** (`useWindowKeys.test.ts`): `Ctrl+Shift+V` opens it, `Ctrl+V` is untouched, the chord is
  claimed by nothing while a core overlay is up, and it reaches the window from a harness tab's
  buffer. The chord handler calls `preventDefault()` — asserted directly, because the regression it
  guards is silent: without it, `Ctrl+Shift+V` in an editor buffer opens the popup *and* triggers the
  browser's own paste-as-plain-text, and nothing about the popup looks wrong.
- **Where it renders** (`MountedViewLayers.test.tsx`): a harness tab renders the clipboard overlay
  alongside the task picker and tab navigator; a plugin tab renders no overlay at all.
- **The context menu** (`DefaultContextMenu.test.tsx` and `default-menu-target.test.ts`): the new
  entry is present with an empty history; present beside `Copy` and `Paste` when both apply; opens the
  popup; and a right-click that previously opened no menu now opens one — including on an editor tab
  with an empty selection, which now offers `Paste` and `Paste from clipboard…` and still never the
  browser's own. `Copy` and the terminal-selection withholding are unchanged, and the browser's own
  menu still appears on a surface the app's menu declines to answer.
- **The seam in the registry** (`overlay-registry.test.ts`): a plugin overlay ranks after all nine
  core overlays, `commandBarSuppressed` reflects a plugin overlay's own bit, and `undefined` is
  still returned when nothing is open.
- **The import boundaries** (`src/eslint-plugin-boundaries.test.ts` and
  `src/eslint-feature-boundaries.test.ts`): the new block rejects an overlay plugin reaching a host
  module and allows one importing `../api`; the new zone rejects a feature importing
  `web/src/overlay-plugins/` and allows one importing the shared seam. These files are what stop the
  lazy chunk from silently folding into the entry bundle and the one-way flow from eroding, so they
  are not optional to the rest.

## Out of scope

- **Previewing the selected entry.** JetBrains' Choose Content to Paste dialog previews the
  highlighted entry and Raycast has a detail panel; the plan shows one line per entry, so two entries
  sharing a first line look alike and a multi-line entry's real content is invisible. Declined for
  this version.
- **Searching or filtering the popup as you type.** Both category leaders do it — JetBrains' guide
  says "Search through your Clipboard history", Raycast searches and filters by type. The popup here
  is arrow-key only, and adding a text input would either claim the command bar (blocking
  paste-while-open) or need its own input the way Quick Open has one. Declined for this version.
- **Deleting an entry.** Raycast binds Delete for one entry, Shift+Delete for a bulk delete by time
  window, and again for all; Windows' Win+V has the same. Declined for this version.
- **Pinning an entry.** Alfred, Raycast (Cmd+Shift+P), Paste, and Maccy all pin entries so the cap
  cannot evict them — the strongest argument for it here being that a 15-entry cap in a busy agent
  fleet pushes something out quickly. Declined for this version.
- **Pasting several entries at once.** JetBrains Shift-selects multiple entries and pastes them
  together, and frames the feature as pasting "a subset or multiple entries"; Raycast's Paste
  Sequentially walks the history pasting each item in turn. This plan pastes exactly one. Declined
  for this version.
- Persistence of the clipboard history across a relaunch or a page refresh (decision 16). Note this is
  the IDE norm, not a shortfall: JetBrains Rider "starts recording copied items to its clipboard
  history as soon as you start it and clears the history when you close it".
- Copies made outside the application. The browser has no clipboard-change event and the app has no
  pasteboard integration; polling for outside copies is not part of this. JetBrains does capture "the
  last thing you copied outside the IDE" — that is the one leader behavior deliberately given up here.
- Non-text clipboard flavours — images and file lists. The popup is text-only, and
  `navigator.clipboard.read` is not used. Raycast tracks text, images, colors, and links.
- Editing, reordering, or renaming entries. The popup is a menu.
- A second bundled overlay plugin (decisions 22–24 and the section 8 documentation-test requirement
  cover what replaces a fixture for this family).
- A `pre` band letting a plugin preempt a core overlay (decision 9's ceiling, with its upgrade path).
- Giving plugin tabs an overlay surface (decision 23).
- Any change to the existing `Paste`, `Copy`, or the tab plugin's contributed context-menu entry.
- The file navigator's own row menu, which keeps its own Paste that acts on files.
- Any server-side clipboard. The pasteboard stays unreachable from a shell.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- The production web build with chunk inspection, to confirm the clipboard popup's modules are in
  their own chunk and are not reachable from the entry bundle — the one check that fails loudly if
  the capture seam is wired by static import.
- Manual end-to-end: copy four snippets of differing shapes from an editor selection, a terminal
  selection, the file navigator, and a transcript drag; confirm the popup lists them newest at the
  bottom with one line each and a literal ellipsis on the multi-line one; copy one again and confirm
  its row moved to the bottom rather than duplicating; paste more than 15 and confirm the oldest
  falls off. Then set `"clipboardHistoryMaxEntries": 5` in `.janissary/config.json` and confirm a
  restart trims to 5, that `0` falls back to 15, and that deleting the key returns it to 15. With
  text half-typed and the caret mid-line, open the popup with `Ctrl+Shift+V` and confirm Return
  splices at the caret and leaves the surrounding text intact; open it with `clip`; open it from the
  right-click menu on a terminal with nothing selected, and on an editor tab with nothing selected. In
  an editor tab, confirm the entry lands at the caret with the caret left at the start of the pasted
  text. On a harness tab, confirm the text is typed into the PTY and not submitted. Reload the page
  and confirm the history is gone.
