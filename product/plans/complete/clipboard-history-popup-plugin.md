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
line of non-space text, with a `(N lines)` postfix when the copy spans several lines and an ellipsis
only when that line is too long for the popup. The popup takes the keyboard while it is open and
hands it back when it closes, and it records copies from the moment the window opens.

The default context menu gains a `Paste from clipboard…` entry that opens the same popup, which
makes the clipboard reachable from the mouse on surfaces where no field holds the keyboard.

This was the third `## ready` entry in `./product/backlog/features.md`, which this change empties of it.
It is worth doing because the app already has both halves and joins them nowhere: every copy in the
app funnels through a handful of call sites, and the paste-into-caret machinery already exists for
the command bar, an editor buffer, and a harness PTY — but recovering a snippet you copied two tabs
ago means a round trip through a shell.

The feature text asks for the popup to be a plugin, and it is. Neither existing family fits — a tab
plugin owns a persistent tab, and an editor plugin is explicitly barred from drawing — so this
introduces the third family, whose plugins contribute a floating overlay.

## Design decisions

### Established by the feature text or by existing behavior

1. **The popup is modelled on the history popup.** Same shape, same anchor (bottom-anchored, above
   the command line, full width), same `.picker` markup, same keyboard model: Up/Down move the
   selection clamped at both ends with no wraparound, Return chooses, Escape closes, a row can be
   clicked, and the popup opens on its newest row. Tab closes it too, like Escape; Shift+Tab stays
   the section-navigation chord. The history popup's behavior is specified in
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
   decisions 25–27.
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
   without executing plugin code, a literal `() => import(...)` loader the host awaits behind an
   activation budget, a handler budget, per-plugin failure isolation that leaves the host running,
   and its own API integer. The clipboard popup is its first bundled plugin. It shares no
   declarations, no catalog, and no API version with the tab or editor families, exactly as
   `documentation/developer-documentation/editor-plugins.md` states those two are separate.
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
    **`Ctrl+Shift+V`**, with **`Cmd+Shift+V`** as an alternate chord because on macOS Cmd is the
    modifier every other application chord here uses (`Cmd+P`, `Cmd+F`, `Cmd+T`), so a Mac user
    reaches for it first. Both were unclaimed; plain `Ctrl+V` and `Cmd+V` stay the browser's paste in
    the editor buffer and are not touched. The command word is **`clip`**. Every opener always opens
    rather than toggles, and preselects the newest (bottom) row, matching `useHistPicker`'s
    `openPicker`.
11. **The plugin declares its chords and its command word**, and the host arbitrates them the
    way the other two families do: a chord — the primary one or any alternate — already claimed by
    another plugin, a core chord, or a
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
      must not run the pasted text. The keyboard is left in that terminal afterwards, even when it
      was somewhere else as the popup opened, so the user keeps typing at the prompt they pasted into.
    This is wider than the two targets the feature text names, by the user's decision.
16. **The history lives in the browser, in memory, and never crosses the wire.** There is no
    server-side clipboard and no OS pasteboard integration anywhere in the app, and the pasteboard
    is deliberately unreachable from a shell — so a server-owned store would be one client reporting
    its own state back to itself. Nothing is persisted; the history is gone on reload. This also
    keeps architecture principle 1 intact in the only direction available: the server never
    computes this, and the client never recomputes server-owned state.
17. **The plugin owns the history.** Recording, ordering, dedupe, the cap, and the display
    derivation are the plugin's own state inside its lazily-loaded chunk. The consequence is
    deliberate and constrains the design: the host copy sites must reach the plugin through a
    **subscription seam**, never a static import, because a static import from `copyText` into
    `web/src/overlay-plugins/clipboard-history/` would pull the plugin's chunk into the entry
    bundle and defeat the lazy load entirely. The seam is a subscribe/notify module in
    `web/src/shared/`, shaped like `web/src/shared/drop-registry.ts` and
    `web/src/file-navigator/file/navigator-clipboard.ts`; the plugin subscribes when it activates
    and releases its subscription when it is disabled or the host shuts down. It activates when the
    window mounts rather than on the popup's first open (decision 34), because a copy made before the
    subscription exists is never seen.
18. **In an editor, the caret ends at the *start* of the pasted text.** `EditorApi.paste` does this
    deliberately (`web/src/editor/applyKeyAction.ts` `pastedState`), and it is what a real `Cmd+V`
    does in this editor. `EditorApi.insert`, which leaves the caret at the end, is what a
    file-navigator drop uses; the two are not interchangeable and the clipboard entry is a paste.
19. **A multi-line copy says how many lines it has; only an over-long line gets an ellipsis, and that
    ellipsis lives on the popup's own label.** The derivation returns the first line of non-space
    text and a separate `(N lines)` postfix when the copy has more than one line. `N` counts the lines
    of the text trimmed at both ends, so a copy that merely ends in a newline or opens with blank lines
    is not reported as more lines than the user can see in it. A literal `…` for the multi-line case
    would read exactly like a clipped long line, which is why the count replaces it. The postfix sits
    in its own `.clipboard-history-lines` span after the label, never shrinks, and is never pasted:
    choosing a row pastes the stored text, not the label or the postfix. An over-long line gets a CSS
    ellipsis, which needs `overflow: hidden` and `text-overflow: ellipsis` — and on a child, not on
    the row. The label is the shrinking flex item, so it is clipped before the postfix, which stays
    visible.
    A `.picker-row` is a `display: flex` container, so a declaration on the row cannot reach the
    anonymous flex item a bare text child becomes: it contributes a hard clip and no glyph. And
    `.picker-row` is shared by thirteen other overlays — Quick Open, the command-history popup, the
    queue popup, the task picker, the route chooser, the tab navigator, the profile and theme
    pickers, the editor's find rows, the file navigator, and the default context menu — so a
    truncation placed there silently changes all of them, because `.picker` sets `overflow-y: auto`
    and the horizontal axis then resolves to `auto`. The rules therefore go on
    `.clipboard-history-row` and `.clipboard-history-label`, following `.editor-find-text`, where
    setting `overflow` on the flex item is what makes its automatic minimum size zero so the ellipsis
    has something to draw. `.picker-row` keeps the value it had before this change, and the row's
    label becomes an element because a bare text child is exactly what stopped the rule applying.
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
    captured at open time and handed to the paste, not re-resolved later. This is the click route:
    choosing with Return carries no anchor and pastes at the keyboard caret, because by then the menu
    has closed and the right-clicked element is no longer what the user is aiming at.
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
27. **A lower cap trims what is held before the list is shown.** The plugin starts when the window
    mounts (decision 34), before the first state snapshot has delivered the configured number, so the
    store takes a cap *source* rather than a number and reads it again at every copy and every open,
    discarding the oldest entries over it. A higher configured cap therefore keeps more from the next
    copy on, and a lower one has trimmed the list by the time it is on screen. The host hands the
    plugin `maxEntries` as a getter over the grants rather than a spread copy, because spreading would
    read it once at activation and freeze the default. In practice the number only changes once, as
    the first snapshot arrives, since the config file is read once in `src/main.ts:75` — the same
    restart requirement every other config setting carries.

### Forced by building it

28. **The reserved-chord list is derived from the chords the application owns, not written beside
    them.** `claimedByCore` answers "does the application already own this chord?" by re-listing
    the bindings the window key handler dispatches, and two copies of one fact drifted in both
    directions before it was deleted: `Cmd+T` was handled but unreserved, so a plugin could declare
    it, be accepted, and then be shadowed at runtime — the exact failure the refusal exists to
    prevent; and `Shift+Tab` was reserved as though it were a global chord when only
    `useSectionNav` claims it, contextually, inside an element marked `data-claims-shift-tab`.
    `web/src/shared/app-chords.ts` now holds the one table, keyed by canonical chord id and valued by
    an action and an **owner**, and two readers: `useWindowKeys` routes on the action, and the host
    asks the same table whether a chord is reserved, whatever dispatches it. `Cmd+T` enters the
    table and `Shift+Tab`'s owner becomes explicit, so both inaccuracies go with the refactor rather
    than surviving it. It has to live under `web/src/shared/` because the feature-directory zones
    forbid `useWindowKeys` importing the plugin layer, and the plugin layer's own boundary would
    stop it importing a feature.

29. **Exhaustiveness comes from the type, not from a test.** `useWindowKeys` switches on the action
    rather than on key and modifier comparisons and its default branch narrows to `never`, so an
    action added to the table without a case is a compile error. That is the guarantee a test cannot
    give: a test would have to restate the list it is checking and would drift the same way. For the
    chords another module dispatches the switch says so explicitly and returns false — "not mine" —
    rather than being silent about them.

30. **A declaration routes; a registration displays.** The seam carries two tables rather than one,
    because the two facts arrive at different times and come from different parties: a **declaration**
    says how a plugin will be reached and exists from the host's construction, while a
    **registration** carries the overlay itself and exists only once the chunk has loaded. Routing
    reads the first and display reads the second. Collapsing them makes the chord a plugin has
    declared unusable until the plugin has already been activated to answer for it — so `Ctrl+Shift+V`,
    `clip`, and **Paste from clipboard…** all silently do nothing on their first use, with nothing
    reported, because the plugin was never disabled and never reached. Publishing claims and
    registering an overlay from the same table would put two copies of one fact back, which is the
    drift the seam exists to prevent. Declaring does not bump the seam's version counter: nothing
    rendered depends on a claim, and the counter means "an overlay was registered, opened, or closed".
    Claims are withdrawn on `disable` and on `dispose`, so a plugin the host has given up on stops
    answering its chord and command word in the same breath.

31. **The host is built once per session, so every value it depends on has to be stable.** It is
    constructed in a `useMemo`, and `App` re-renders constantly — re-rendering *because of this
    feature*, since the hook subscribes to the seam's version and the version bumps the moment a
    plugin registers. `currentTab` is a *reader* of state that changes, not a value that changes, so
    it joins `maxEntries` behind a ref read inside the memo body, the way the cap already was, and
    `focusHarness` (decision 33) sits behind a ref for the same reason; the
    call site additionally wraps it in a `useCallback`, because an inline arrow is the trap itself
    and the hook's comment should not have to explain why the option is safe to pass inline.
    Depending on it rebuilds the host on ordinary shell re-renders, the effect cleanup disposes the
    previous one, and a dispose empties the recorded history and drops the copy subscription — so the
    popup's own activation would be enough to lose the history.

32. **`start` runs once per activation, and the contract says so.** The `unregisters.has(plugin)`
    short-circuit runs *before* the first `await`, while both the load and the registration happen
    after it, so two openers arriving before the chunk resolves both miss it and both call `start` —
    running a plugin's lifecycle hook twice and overwriting the first unregistration in the map,
    which is how a subscription made in `start` leaks. The fix is an in-flight `activating` map
    holding the whole attempt rather than a separate guard flag, so it cannot drift from the load
    memo it wraps: a second caller awaits the first and returns its result. The caches are cleared in
    `disable` and `dispose` alongside the load memo, because a promise cached in a map outlives the
    thing it describes. The guarantee is stated in `api.ts` as well, since a plugin author has no
    other reason to write an idempotence guard.

33. **The popup takes the keyboard while it is open and hands it back when it closes.** Left where it
    was, the keyboard broke the popup on every tab but the agent tab: in an editor buffer the arrows
    moved the caret and Return reached the hidden textarea, which binds Enter to a newline and stops
    the event there; a click on a row blurred that textarea first, so the paste found no editor under
    `document.activeElement` and fell through to a command bar the editor tab does not have; in a
    terminal the keys went to the PTY. So the popup's root is focusable (`tabIndex={-1}`) and focuses
    itself on mount, and its keys bubble to the window key handler, which already routes them to the
    open contributed overlay's `onKey`. Once focus has moved, "where the caret is" can no longer be
    read from the live focus at paste time, so the seam records the element that held the keyboard as
    the overlay's **focus origin** when it opens, and the paste capability reads that origin in place
    of the live focus while an overlay is open. Where an entry lands therefore does not depend on how
    the popup was opened: an editor buffer that held the keyboard receives the paste whether the popup
    came from its chord, `clip`, or the right-click menu, and whether the entry is chosen with Return
    or a click. A plugin's close — after Return, a click, Escape, or Tab — hands focus back to the
    origin when it is still in the document, except when a different text field now holds focus,
    which is what a paste into a right-clicked field leaves behind. The PTY route is the one paste
    route chosen from the tab rather than from a focused element, so it focuses nothing by itself; the
    capability gains a `focusHarness(ptyId)` callback, supplied by the app shell from the harness
    handles it already keeps, so the keyboard ends in that terminal however the popup was reached. A
    terminal's hidden xterm input is not treated as a text field, because a paste event there would go
    through xterm's own paste handling and then be inserted again — text for a terminal goes to its PTY.
34. **The clipboard plugin activates at startup, as a declared trigger.** Started on its popup's first
    open, the history greeted the first `Ctrl+Shift+V` with an empty list however much had already been
    copied. `ai/guidelines/plugins.md` §3 puts activation triggers in the static declaration and §6
    asks a broad trigger to justify itself beside the field, so the declaration gains an optional
    `activation: 'open' | 'startup'`, defaulting to `'open'` and additive to API v1, and the clipboard
    declaration sets `'startup'` with its reason written beside it. The host's `activateAtStartup`
    activates every accepted startup plugin concurrently, through the same guarded `activate`, from an
    effect in `useOverlayPlugins` after mount. The chunk is still a separate dynamic import, so the entry
    bundle carries no plugin code. Under `React.StrictMode` that effect runs, is cleaned up, and runs
    again on the same memoized host, so a startup activation can still be loading when the host is
    disposed; the host keeps a generation counter that `dispose` advances, and an attempt that finds it
    changed after its load does not call `start` and reports false without disabling the plugin. The
    capture seam was not made to buffer copies for a plugin that has not loaded, which would have put
    the history's cap and retention back into shared code.
35. **A contributed overlay closes when the exposed tab changes.** It is a modal over the pane it opened
    on, takes every keystroke, and pastes into the tab the user is looking at now, so carrying it onto
    another tab would put a modal over a tab it was never opened on. `useOverlayPlugins` takes the
    exposed tab's label and closes every open contributed overlay when it changes, through the seam's
    `closeContributedOverlays()`. The label rather than the index is the key, because closing a tab to
    the left shifts the index without changing what is on screen. This close returns no focus: the tab
    switch puts the keyboard on the new tab by its own rule.
36. **A declaration may name alternate chords.** The seam already published a list of chord ids per
    plugin, so the second clipboard chord needed no routing change, only a way to declare it. The
    declaration gains an optional `alternateChords`, additive to API v1, and `declarationChords` in
    `overlay-plugins/chords.ts` is the one reading of a declaration's chords — the primary first, then
    the alternates — so validation, the core-chord refusal, and the published claims cannot disagree
    about which chords a plugin holds. Any one of them colliding with a core chord or another plugin's
    refuses the whole plugin. The window handler needed no change: a Cmd chord the application does not
    own falls through `metaChordOpener` to the seam, and the existing `preventDefault` on a claimed
    plugin chord suppresses the browser's "paste and match style" just as it suppresses the Ctrl form's
    "paste as plain text". `isClipboardChord` lets either chord out of a harness terminal, with exactly
    one of Ctrl and Cmd held.

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
| A chord opening a picker | the four Ctrl chords and the four Cmd chords, now routed by action through `shared/app-chords.ts` rather than by key and modifier comparison | `web/src/shared/app-chords.ts`; `web/src/useWindowKeys.ts:118,139` |
| Letting a chord out of a full-tab terminal | `isPickerChord` (Ctrl+A, Ctrl+G) plus `harnessKeyFilter`, now with `isClipboardChord` (Ctrl+Shift+V or Cmd+Shift+V) beside them | `web/src/shared/terminal/window-chords.ts:13,19` |
| Matching a declared modifier chord | `eventChordId` / `matchBinding`, and `claimedByCore` — the latter now a lookup in the app's own chord table rather than a second hand-written list | `web/src/editor/plugins/chords.ts:20,30,43`; `web/src/overlay-plugins/chords.ts:54` |
| A command word opening a picker, with a server no-op twin | `hist` intercepted at submit; `src/commands/hist.ts` is the 10-line server no-op | `web/src/agent-tabs/command-input/useCommandBarSubmit.ts:36`; `src/commands/hist.ts` |
| Recording a refused declaration instead of throwing | `validateDeclarations` (editor plugins); `rejectContribution` (tab plugins) | `web/src/editor/plugins/registry.ts:74`; `src/plugins/rejections.ts:9` |
| A lazily-loaded plugin module behind `React.lazy` | `clientPlugin`, and `editorPluginLoaders`' literal `() => import(...)` | `web/src/plugins/registry.tsx:49`; `web/src/editor/plugins/registry.ts:51` |
| A plugin host with a timeout and per-plugin disable | `createEditorPluginHost`, `HANDLER_TIMEOUT_MS`; the shared `guardPluginCall` | `web/src/editor/plugins/host.ts:35,14`; `src/plugins/guard.ts:5` |
| The session-scoped value the memo must not depend on | `maxEntriesRef` — a value read through a ref rather than captured, because it changes | `web/src/useOverlayPlugins.ts:43` |
| A lint boundary for a client-only plugin layer | the `web/src/editor/plugins/*/**` block in `eslint.plugin-boundaries.mjs` | `eslint.plugin-boundaries.mjs:104-115` |
| An enforced test over those lint blocks, and their count | `src/eslint-plugin-boundaries.test.ts`, whose header states how many blocks exist | `src/eslint-plugin-boundaries.test.ts:5,30` |
| The editor's own no-menu-on-empty-selection rule | `onContextMenu` on the editor body, removed by this change (change 2a) | `web/src/editor/EditorTab.tsx:151` |
| The restricted overlay set a harness tab renders | `MountedViewLayers`' harness branch; `PickerOverlayProps` / `mountedPickerOverlayProps` | `web/src/MountedViewLayers.tsx:77`; `web/src/pickers/picker/overlay-props.ts` |
| Inserting text at the command bar's caret | `CommandInputDropHandle.insertAtCaret` → `spliceIntoTextarea`, which splices at the selection and replaces it | `web/src/agent-tabs/command-input/CommandInput.tsx:67`; `web/src/shared/command-bar/textarea-splice.ts` |
| The command-bar-vs-harness split, already written | `insertIntoCommandLine` — `ptyInput` on a harness tab, `dropRef.insertAtCaret` otherwise | `web/src/pickers/populate-command-line.ts:25` |
| Inserting text into an editor at the caret, by lookup | `useEditorDrop` registers a handle keyed by the tab label written on `data-editor-drop`; `registerEditorDrop` / `editorDropHandle` | `web/src/editor/useEditorDrop.ts:13`; `web/src/shared/drop-registry.ts:28` |
| Paste-semantics editor insertion (caret at the start) | `EditorApi.paste` | `web/src/editor/useEditor.ts:21` |
| Reading which field holds the keyboard | `resolvePasteTarget`, and `isTextEntryElement`, moved to `shared/` because the overlay seam needs it too | `web/src/context-menu/default-menu-target.ts`; `web/src/shared/text-entry.ts` |
| Telling a terminal's hidden input apart from a text field | the terminal selection registry's container lookup, now exported as `isInsideTerminal` | `web/src/shared/terminal/terminal/selection.ts` |
| Putting the keyboard on a harness terminal | `harnessHandles`, keyed by PTY id, which tab-switch focus already uses | `web/src/App.tsx` |
| One writer for clipboard text | `copyText(text)` — no-ops on empty, fire-and-forget | `web/src/shared/system-clipboard.ts:14` |
| Reading the clipboard for the existing Paste | `pasteInto` / `readClipboardText`, and now `pasteTextInto` — the element-pasting half published on its own so there is one answer to "how does text get into an element that owns its own pasting" | `web/src/context-menu/clipboard-commands.ts:40,8` |
| A subscribe-and-notify seam between two features that may not import each other | `drop-registry.ts` `createRegistry`; `navigator-clipboard.ts`'s snapshot + listeners | `web/src/shared/drop-registry.ts:11`; `web/src/file-navigator/file/navigator-clipboard.ts` |
| An existing pure newest-first / unique / cap derivation | `getRecentHistory(history, count)` | `web/src/history.ts:4` |
| A configurable numeric cap, end to end | `transcriptMaxLines` — `Config` field, `DEFAULT_*` constant, `DEFAULT_CONFIG` entry, a decoder line, read via `getConfig()` at the cap site | `src/config.ts:22,56,67`; `src/config-decode.ts:59`; `src/tab/transcript/state.ts:40` |
| Where the config chain's tests live | `src/config.test.ts` — `loadConfig`, `decodeConfig`, and `updateConfig` in one suite; there is no `config-decode.test.ts` | `src/config.test.ts:13,265` |
| Getting a server setting into the browser | `tabNameMaxLength` / `activeTabNameMaxLength` — built in `state-event.ts`, added to the event's wire type, seeded in a hook | `src/state-event.ts:19`; `src/protocol/events.ts:13`; `web/src/useServerState.ts:26` |
| A config file written atomically, preserving unknown keys | `updateConfig` — returns `false` on failure rather than throwing | `src/config.ts:133` |
| An existing row-ellipsis precedent | `.editor-find-text` — a child `span` with `overflow: hidden; text-overflow: ellipsis` inside a flex `.picker-row` | `web/src/theme.css:558` |

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

- **`web/src/shared/contributed-overlays.ts`** — the seam. `declareOverlayClaims(name, claims)` and
  `registerContributedOverlay(overlay)`, each returning a withdrawal that leaves a later entry under
  the same name in place; `installOverlayOpener(open)`; and the routing and display lookups the
  window handler, the command bar, the context menu, and the two render chains need. This is
  `web/src/shared/drop-registry.ts` verbatim in shape — the reason that file exists is "the features
  may not import each other, and a single ref could only ever name one of them", which is exactly this
  problem. The overlay descriptor is pure data: the plugin id as its name, a render function taking
  the right-click anchor, a key handler, the `claimsCommandBar` bit, and an `onOpen`; the claim is the
  chord ids and the command word. Each registration also keeps the anchor and the focus origin it was
  opened with (decision 33): `openContributedOverlay` records the focused element on a first open,
  `contributedOverlayFocusOrigin()` answers it, `closeContributedOverlay` hands focus back to it, and
  `closeContributedOverlays()` closes every open overlay without returning focus (decision 35).
- **`web/src/shared/overlay-focus.ts`** — `focusedElement()` and `returnFocus(origin)`, the latter
  skipping an origin that has left the document or a moment when a different text field holds focus.
  **`web/src/shared/text-entry.ts`** — `isTextEntryElement`, moved out of the context menu so the seam
  can use it without importing a feature, with its tests.
- **`web/src/overlay-plugins/`** — the family, outside `clientFeatureDirectories` and reachable from
  the app shell only. No barrel file, mirroring `web/src/editor/plugins/`:
  - `api.ts` — the versioned contract: `OVERLAY_PLUGIN_API_VERSION` (start at 1), the
    `OverlayPluginDeclaration` (identity `id` and `version`, the requested `apiVersion`, a `chord`, the
    optional `alternateChords`, a `command`, the title, the empty-state text, and the optional
    `activation` trigger), `OverlayPluginItem` (the derived label paired
    with the full text, plus the cap), `OverlayPluginCapabilities` (`paste`, `maxEntries`, `close`),
    the `OverlayPluginModule` default export, the `OverlayPluginLoader` type, and `handlePickerKey`
    re-exported from the shared keyboard module. Every host-visible signature is written out at the
    contract rather than inferred from the implementation, the way `web/src/editor/plugins/api.ts`
    pins its re-exported helpers, so a refactor that changes what a plugin sees fails to typecheck
    here where the version decision belongs.
  - `chords.ts` — `overlayChordId` and `eventChordId`, `declarationChords` (decision 36), and
    `claimedByCore` as a lookup in `shared/app-chords.ts` (decision 28).
  - `registry.ts` — `overlayPluginDeclarations`, the pure data the host reads to answer "what chords
    and commands are claimed" without importing plugin code; `overlayPluginLoaders`, literal
    `() => import('./<id>')` entries, never a filesystem walk; `ProductionOverlayPluginId`, the
    static id union that `src/plugins/catalog.ts` already models; and `validateDeclarations`,
    refusing a wrong API version, a duplicate chord among every chord a declaration claims, a command colliding with a built-in or another
    plugin's, and returning every refusal as data rather than throwing —
    `validateDeclarations` at `web/src/editor/plugins/registry.ts:74` is the shape to copy.
  - `host.ts` — `createOverlayPluginHost`, session-scoped: claims published from the declarations at
    construction, a lazy `load` memoized through `loading`, a second memoized attempt through
    `activating` so `start` runs once, `guardPluginCall` (`src/plugins/guard.ts:5`) around the load,
    a `disable` that records one reason, withdraws the claims, drops both caches and affects that
    plugin alone, and a `dispose` that unregisters every overlay, withdraws every claim, and advances
    the generation that stops a still-loading activation from starting (decision 34). It refuses a
    plugin when any of its chords is a core chord, publishes every chord as a claim, hands each plugin
    a capability object whose `maxEntries` is a live getter over the grants, and exposes
    `activateAtStartup`. Modelled on `createEditorPluginHost` (`web/src/editor/plugins/host.ts:35`).
  - `clipboard-history/` — the plugin, declared with `activation: 'startup'` and the `Cmd+Shift+V`
    alternate chord. `store.ts` owns the history (record, dedupe, cap, ordering, trim-on-lower, and
    the capture subscription) as module state inside the chunk, with a memoized row snapshot so
    `useSyncExternalStore` does not loop; it reads its cap from a source at every copy and every open
    (decision 27), and its rows are a plugin-local `ClipboardHistoryRow` — the contract's item plus
    the postfix — so `OverlayPluginItem` does not change. `display.ts` is the pure
    first-line-of-non-space-text derivation returning the label and the `(N lines)` postfix;
    `Popup.tsx` is the component, in the same `.picker` markup as `HistoryPicker` so the CSS is shared
    rather than duplicated, with the label in a `.clipboard-history-label` span so the CSS ellipsis has
    something to truncate and the postfix in a `.clipboard-history-lines` span after it, and a
    focusable root that takes the keyboard on mount; `index.tsx` is the module the host loads, where
    `start` builds the overlay — closing on a plain Tab ahead of the shared picker keys — and
    `dispose` empties the store.

### 2. The overlay registry seam

`web/src/pickers/overlay-registry.ts` (98 lines today) gains the ability to be walked rather than
only read, reading the contributed descriptors from `shared`:

- `OVERLAYS` stays the nine core descriptors. `firstOpenOverlay` keeps its signature, its meaning and
  its exhaustive `OverlayOpenState`; `commandBarSuppressed` consults the contributed band after its
  own core answer; `commandBarDisabled` does not, because no contributed overlay disables the bar.
  So all three keep answering from one ordered source without any caller changing shape.
- **`OverlayName` is not widened.** This was the part the plan expected to matter, and it turned out
  both unnecessary and impossible: the contributed band never enters `OverlayOpenState`, so a wider
  union would buy nothing, and importing the plugin id union into `pickers/overlay-registry.ts` is
  exactly what the new zone forbids. The compile-time exhaustiveness `buildOverlayOpenState` relies on
  is kept for the core nine, and a bundled plugin's open state is read from the seam instead. The
  three "as built" bullets below record this.
- The contributed band's open state therefore needs **no new field on `OverlayOpenSources`** and no
  edit to `web/src/pickers/picker/overlays-state.ts`, `overlay-view.ts`, `key-bindings.ts`, or
  `usePickerOverlays.ts`. That is the deliberate difference from how the nine core overlays are
  wired: a core overlay's open flag is app state the projections carry, whereas a plugin overlay's is
  the plugin's own state, already inside the seam the plugin registered it with.
- The render chain and the key chain keep their existing `case` arms untouched and gain a
  `default:` arm that resolves a contributed overlay through the seam. Their core behavior does not
  change. `undefined` from `firstOpenOverlay` is exactly "no built-in overlay is up", which is the
  condition under which a contributed one can be — which is why the pre-check this plan proposed
  would have read worse than the `default:` arm that shipped.
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
  overlays reach a harness tab". Both become false under decision 15. The contributed overlay joins
  those two in that branch and in `PickerOverlayProps` / `mountedPickerOverlayProps`, following the
  existing pattern rather than replacing the restricted set with the full stack: passing the whole
  `PickerOverlays` node there would additionally start rendering Quick Open over a harness tab, which
  is a behavior change this feature did not ask for. It is rendered with a `null` anchor there, which
  costs nothing on a harness tab because the only surface a paste can reach is the PTY.
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

### 3. The capture seam and the five copy sites

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

1. the field the right-click landed in, else the field holding the keyboard, kept only when
   `isTextEntryElement` (`web/src/shared/text-entry.ts`) agrees and it is not a terminal's hidden
   input (`isInsideTerminal`). While an overlay is open the popup holds the keyboard itself, so "the
   field holding the keyboard" is the overlay's recorded focus origin rather than the live focus
   (decision 33);
2. if that field is inside `[data-command-bar]`, the command bar's caret, through
   `dropRef.current.insertAtCaret`;
3. otherwise an editor buffer, resolved by walking up from the anchor — or, failing that, from the
   focused element — to `[data-editor-drop]`, which `web/src/editor/EditorTab.tsx:147` already writes,
   and looking that label up in the existing editor drop registry
   (`web/src/shared/drop-registry.ts:28`);
4. otherwise any other focused field, through the context menu's own `pasteTextInto`, so a
   paste into an element that owns its pasting has one answer rather than two;
5. otherwise the current tab's harness/ssh PTY, via `ptyInput` with the bare text and no trailing
   Enter, exactly as `insertIntoCommandLine` already does
   (`web/src/pickers/populate-command-line.ts:31`), followed by the injected `focusHarness(ptyId)` so
   the keyboard ends in that terminal;
6. otherwise the command bar again, when the tab has one.

Steps 1 and 3 are the ones that matter, and getting them the wrong way round is the failure the
clipboard popup cannot have: `isTextEntryElement` returns true for **both** the command bar's textarea
and an editor's hidden `.editor-textarea`, so "is some field focused" cannot tell them apart. What
tells them apart is the marker each surface writes on its own element, which is why the resolution is
ordered by identity rather than by "a field exists", and why the anchor beats focus — a paste into a
field the user right-clicked but had not focused has to leave the caret there.

The editor case needs `EditorDropHandle` (`web/src/shared/drop-handles.ts:17`, currently
`{ insertAtCaret }`) to grow a second member alongside `insertAtCaret` — one carrying `api.paste`'s
caret-at-the-start semantics (decision 18) — so the file-navigator drop keeps `api.insert` unchanged
and the clipboard entry gets paste semantics. Growing the existing handle is deliberately smaller than
adding a second registry: one field on a type the seam already looks up, against a new registry, a
new key, and a new lookup path for one extra function. Adding a member is not an editor-plugin API
change: `EditorDropHandle` is the host's own drop plumbing in `web/src/shared/`, not
`web/src/editor/plugins/api.ts`'s versioned contract.

### 5. Openers

- **Chord.** The consultation is a single line in `handleChordKeys`
  (`web/src/useWindowKeys.ts:193`), after every core chord: `openOverlayForChord(eventChordId(e))`,
  then `preventDefault()`, and skipped while `e.isComposing` so an IME is never interrupted. The file
  stays under its size limit because the *core* chord routing moved out rather than the plugin arm:
  `shared/app-chords.ts` now holds the table and `ctrlChordOpener` and `metaChordOpener` switch on its
  action, with their default branches narrowing to `never` (decisions 28 and 29).
- The chord is matched through `eventChordId` (`web/src/overlay-plugins/chords.ts:37`) against the
  ids the seam holds, rather than by extending `ctrlChordOpener`, whose `e.ctrlKey` test never looks
  at `shiftKey` and would therefore also claim a bare `Ctrl+V`.
- **The chord must call `preventDefault()`, and this matters more here than for the existing
  openers.** In a text field — which is exactly where the editor keeps its keyboard, in the hidden
  `.editor-textarea` — browsers bind `Ctrl+Shift+V` to "paste as plain text", and that keydown still
  reaches the page. Without `preventDefault()` the popup opens *and* the browser pastes, in the same
  keystroke. Every chord the handler claims already prevents the default, so matching that is the
  whole fix; it is called out because the symptom is a double action rather than a missing one.
- **The alternate chord.** `Cmd+Shift+V` reaches the same line: `metaChordOpener` returns false for a
  Cmd chord the application does not own, and the seam answers `meta+shift+v` because the host
  published every chord the declaration names (decision 36).
- `web/src/shared/terminal/window-chords.ts` gains `isClipboardChord`, the predicate that lets
  `Ctrl+Shift+V` or `Cmd+Shift+V` — exactly one of Ctrl and Cmd — out of a full-tab terminal, so `harnessKeyFilter` (`web/src/harness/HarnessTab.tsx:23-26`)
  passes it through the way it already does for `Ctrl+A` and `Ctrl+G` (decision 15). It is a separate
  function from `isPickerChord` because it is a separate claim: `Ctrl+A` and `Ctrl+G` are the
  built-in overlays' chords, this one belongs to a plugin and is matched by its own declaration. What
  the terminal needs is only the fact that the chord reaches the window.
- **Command.** `clip` is intercepted at submit through `openOverlayForCommand(trimmed, null)` in the
  same chain as `hist` (`web/src/agent-tabs/command-input/useCommandBarSubmit.ts:71`). The six bare
  words that preceded it became a `BARE_OPENERS` table at the same time, because the chain sits at
  this file's cognitive-complexity limit and a seventh row is cheaper than a seventh branch. So a
  plugin's command word adds no line to any of them, which is the same reason the table exists.
  `src/commands/clip.ts` is the server-side no-op twin of `src/commands/hist.ts` — same shape, same
  `samples`, same "reaching the server non-interactively is a no-op" rationale — registered in
  `src/commands/index.ts`, so a `clip` arriving by any non-interactive route resolves harmlessly
  (decision 11).

### 5a. The lint boundaries

Two, and they are not the same rule:

- **The new family gets an eighth block in `eslint.plugin-boundaries.mjs`**, shaped like the
  editor-plugin block at `:104-115`: `web/src/overlay-plugins/*/**` restricted by
  `^\.\.(?!(?:/\.\./shared/clipboard-captures|/api)$)`, with `**/*.test.ts(x)` ignored. Two escapes
  rather than one, because the plugin has a data source and a plugin boundary that forbade it would
  otherwise force one: its own contract `api.ts`, and the capture seam every copy in the application
  already publishes to. Anything else — the pickers, the context menu, the command bar, the window
  key handler — is host plumbing a well-behaved plugin has no use for.
- **`eslint.config.mjs` gains one `import-x/no-restricted-paths` zone** per feature directory, added
  in a loop over `clientFeatureDirectories`, making each of them unable to import
  `web/src/overlay-plugins/`, with the message naming the alternative — go through
  `shared/contributed-overlays.ts`. Without it the one-way flow the whole arrangement depends on is a
  convention rather than an enforced boundary, which is precisely what
  `ai/guidelines/react-code-organization.md` §3 says to prefer enforcement over.

`src/eslint-plugin-boundaries.test.ts` enforces the first and counts both — its header reads "The
eight restricted-import blocks", and the file gains two rejected cases (a plugin reaching the command
bar, a plugin reaching the overlay registry) and two allowed ones (a plugin importing `../api`, a
plugin reading the capture seam). Without both, a regex that stops matching disables its rule
silently, and the first symptom is a plugin's chunk folded into the entry bundle, which nothing else
reports. The zone in `eslint.config.mjs` is covered by `src/eslint-feature-boundaries.test.ts`, which
is where the existing feature zones are pinned: a feature importing the plugin layer is rejected, a
feature importing the shared seam is allowed, and the host importing a feature is allowed — that last
one being what the host exists to compose.


### 6. The context-menu entry

`web/src/context-menu/` may not import `web/src/overlay-plugins/` — both are feature directories
under the zone rule in change 1 — so the entry opens the popup through the same shared seam, exactly
as it reaches the file navigator's drop handles today.

- `web/src/context-menu/default-menu-target.ts`'s `defaultMenuGroups` gains the
  `Paste from clipboard…` entry alongside `Copy` and `Paste`, `DefaultMenuActions` gains the callback
  that opens it, and `DefaultMenuTarget` gains `clicked`: the element the pointer was over, kept
  before it was narrowed to a text-entry field, because on a terminal there is no paste target to take
  instead and the click is still the best answer to where the user aimed. The entry is unconditional
  (decision 20), which means `useDefaultContextMenu`'s early return — the
  `if (!target.selectionText && !target.pasteTarget) return;` that used to stand there — is removed
  along with the comment about leaving the browser its own menu, so a right-click on a terminal with
  nothing selected and no focused field opens the app's menu.
- Activating it passes that `clicked` element straight to `openOverlayForCommand('clip', anchor)`,
  which captures it at open time and hands it to the later paste (decision 21). It names the command
  word, not the plugin: this feature never learns that a plugin exists. The existing `Paste`, `Copy`,
  and the tab plugin's contributed entry are untouched.
- `web/src/context-menu/clipboard-commands.ts` splits its element-pasting half out as
  `pasteTextInto(element, text)` so the popup reuses it, rather than the two each answering "how does
  text get into an element that owns its own pasting" separately.
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
  because the plugin owns the store and therefore owns applying the cap (decisions 17 and 27). It
  reaches the plugin as a getter, read through `useOverlayPlugins`' ref and kept live by the host,
  because the plugin starts before the first state snapshot delivers it.

### 7a. The overlay-plugin hook

`web/src/useOverlayPlugins.ts` builds the host once per session (decision 31) with the paste
capability, `maxEntries`, and `focusHarness`, each read through a ref; installs the seam's opener;
activates startup plugins from an effect after mount and disposes the host in that effect's cleanup
(decision 34); and closes every open contributed overlay when the exposed tab's label changes
(decision 35). `App.tsx` passes it a stable `currentTab` reader, a stable `focusHarness` that focuses
`harnessHandles.current.get(ptyId)`, and `tabLabel: current?.label`.
- `product/specs/application-config.md` gains the row: name, default 15, hand-edited, and that it
  takes effect at startup.

### 8. Specs

- New `product/specs/clipboard-history.md`: what is recorded (every in-app copy, text only, no
  empty or whitespace-only), the newest-at-the-bottom order, the dedupe-and-promote rule, the cap and
  its setting, the one-line rendering with its `(N lines)` postfix and its ellipsis, the three paste
  targets and the caret rules for each, the three openers and the popup's key model, that recording
  starts when the window opens, that the popup takes the keyboard and where focus goes afterwards,
  that a tab switch closes it, that nothing is persisted, and the failure message a disabled plugin
  puts in the notifications feed.
- `product/specs/harness.md`: `Ctrl+Shift+V` and `Cmd+Shift+V` among the keys a harness terminal lets
  bubble to the window handler.
- `product/specs/keyboard-navigation.md`: a `Ctrl+Shift+V` / `Cmd+Shift+V` row in the chord table, `Cmd+W` naming a
  plugin-contributed overlay among the overlays that withhold it, and the plugin band appended to the
  "Overlay priority" list with decision 9's tie rule stated and the tab kinds that render no overlay
  named.
- `product/specs/context-menu.md`: the new entry, that it is always offered, that it opens the
  clipboard popup at its normal anchor rather than at the pointer, and that `Copy` and the
  terminal-selection rule are unchanged. Two existing paragraphs change rather than merely gain a
  sentence, and both have to be rewritten or they will mislead: "When neither entry applies — a
  right-click on a surface with nothing selected and nowhere to type — no menu opens at all", which is
  no longer true now that an entry always applies, and "The editor is the exception: an empty-selection
  right-click there opens no menu, including the browser's own menu", which is no longer true at all.
  The replacement states that the browser's own menu never appears wherever the app's menu answers,
  and that the editor is no longer exempt.
- `product/specs/application-config.md`: the `clipboardHistoryMaxEntries` row (change 7).
- `product/backlog/features.md`: the feature entry removed.

### 9. Documentation

- New `documentation/developer-documentation/overlay-plugins.md`, following the structure of
  `editor-plugins.md`: trust stated first, the smallest working example copied from shipped code, a
  "Files to add" tree with the registration edges named, the declaration reference including the
  optional `alternateChords` and `activation` fields, the chord and command resolution and the
  recorded-refusal rule, the capability reference, the budgets, what a
  plugin may not do, an API changelog, and the two sidebar entries in
  `documentation/.vitepress/config.mts`.
- **The page's own claim to be pinned is delivered**, because a page that presents itself as
  authoritative and names a pin it does not have is worse than no page:
  `web/src/overlay-plugins/registry.test.ts` reads the Markdown by repository-relative path and pins
  the declaration block field by field against the shipped entry, asserts the page documents every
  member of `OverlayPluginCapabilities`, asserts the module block returns every member
  `OverlayPluginModule` and the overlay shape declare, states the ordering rule, and asserts the page
  names that test file at all — so the sentence that makes the rest true cannot be deleted quietly.
  Nothing there checks prose, which is the shape the editor family's own block takes and the reason a
  reformat of the page is not a test failure.
- New `documentation/user-documentation/command-bar/clipboard.md` for the user-facing behavior,
  including the `clipboardHistoryMaxEntries` setting, plus the `Ctrl+Shift+V` / `Cmd+Shift+V` and `clip` rows in
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
- **The plugin's boundary permits exactly two imports**, its contract and the capture seam, rather
  than the contract alone. A plugin boundary that forbade the seam would have forced this plugin to
  subscribe through a static import from `copyText`, which is the one thing the seam exists to prevent.
- `shared/app-chords.ts` replaced a second hand-written reserved-chord list rather than correcting it,
  which is why `Ctrl+T` is now reserved and `Shift+Tab`'s owner is explicit (decisions 28 and 29).
- **`Ctrl+Shift+V` needs `eventChordId`, not `overlayChordId`, at the window handler.** The two shapes are
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
  before it yields that line with no postfix; `first\nsecond\nthird` reads `first` with `(3 lines)`;
  a copy that only ends in a newline has no postfix; leading blank lines are not counted; the label
  never carries an ellipsis; a text that is only whitespace never reaches the store.
- **The store** (`store.test.ts`): newest at the bottom; the cap keeps the configured number of
  entries and drops the oldest; re-copying existing text moves its one row to the bottom rather than
  adding a second; empty and whitespace-only copies are ignored; a cap lowered below the number held
  trims immediately; a cap that is not a positive integer falls back to 15; a dispose resets the cap
  to the default; a higher cap arriving from the source after start keeps more entries on later
  copies, and a lower one trims on the next open; the selection stays inside the rows that exist; a
  row keeps its identity as the list changes around it; a row's full text is readable separately from
  its label and postfix; and what the application copies is recorded while started and stops when
  disposed.
- **The configurable cap** (`src/config.test.ts`, which is where `loadConfig`, `decodeConfig`, and
  `updateConfig` are all exercised — there is no separate `config-decode.test.ts`): the default is 15
  when the key is absent, from a fresh config, and from an existing project config that predates the
  feature; a raised cap is honoured; `0`, a negative, a fraction, a string and `null` all fall back to
  15; a bad value for this field leaves a valid neighbour intact; `updateConfig` preserves the field
  when rewriting an unrelated key. The state event carries the resolved number, `useServerState` seeds
  it, and `src/commands/clip.test.ts` pins the server-side no-op twin's name, matching and no-op.
  `positiveIntegerValue` itself is covered by those cases rather than by a suite of its own.
- **The app's own chord table** (`web/src/shared/app-chords.test.ts`): every declared chord answers,
  nothing else does — including a chord id that names a prototype member — every id is written in the
  shape the plugin family canonicalizes to, and every chord has one owner, with the chords another
  module dispatches still reserved.
- **The extension point** (`registry.test.ts`): every shipped declaration is accepted and every id
  has a loader and every loader an id; a duplicate chord is refused; a wrong API version is refused; a
  command colliding with a built-in or with another plugin's is refused; each refusal is recorded
  rather than thrown and leaves the healthy plugins accepted; the reserved set now includes `Cmd+T`,
  which the list it replaced omitted, and keeps `Shift+Tab` for the contextual claim; `Ctrl+Shift+V`
  and `Ctrl+V` are not reserved; a plugin whose alternate chord collides with an earlier plugin's is
  refused, and an alternate counts as taken against the plugins after it; `declarationChords` lists the
  primary chord first and then the alternates; the shipped clipboard declaration claims
  `ctrl+shift+v` and `meta+shift+v`, neither reserved, and activates at startup; and the loader map
  holds a literal dynamic import per id with no static import of any implementation.
- **The host** (`host.test.ts`): a declared chord and command word route without loading anything; the
  plugin is reached on the *first* chord and the first command word, with no prior activation; two
  activations arriving before the chunk resolves run `start` once, load once, register once, and
  report one outcome to both callers; a plugin that throws on load, exports no overlay, claims a chord
  the application already uses, or had its declaration refused is disabled while the host keeps
  running; `dispose` withdraws the claims so a disposed host answers nothing; each plugin's `close` is
  bound to its own name and `dispose` takes its overlay away; a `dispose` that throws is survived; an
  alternate chord reaches the plugin on its first press, and an alternate the application owns
  disables the plugin at construction. At startup, `activateAtStartup` starts a `'startup'` plugin and
  registers its overlay without any opener, leaves an `'open'` plugin and one naming no activation
  unloaded, and disables and reports a startup plugin that fails to load; the capability's
  `maxEntries` reflects a grants value that changes after `start`; and a load that finishes after the
  host was disposed does not call `start` and reports nothing.
- **The seam** (`shared/contributed-overlays.test.ts`): an overlay publishes and withdraws; two
  plugins registering one name resolve in registration order; an earlier withdrawal leaves a later one
  in place; **a declared chord and command word answer before anything has registered** and the opener
  receives the name; withdrawing a declaration stops it answering; two plugins declaring one chord
  resolve in declaration order; `onOpen` is where a plugin resets its selection; the anchor is handed
  to the open route and forgotten on close; `claimsCommandBar` is read per open overlay; the version
  counter is stable between changes and is *not* bumped by a claim. Opening records the focused
  element as the focus origin and closing returns focus to it, but not when another text field holds
  focus or the origin has left the document; `closeContributedOverlays` closes an open overlay, clears
  its anchor, notifies once, returns no focus, and with nothing open does not notify.
- **Focus helpers** (`shared/text-entry.test.ts`, `shared/terminal/terminal/selection.test.ts`): the
  moved `isTextEntryElement` cases, and `isInsideTerminal` true inside a registered terminal container
  and false outside one.
- **The seam and the copy sites**: `copyText` notifies subscribers once per written text, not at all
  for an empty one, and still notifies when the browser withholds the clipboard; a throwing subscriber
  does not cost the others their copy; unsubscribing leaves a later registration in place. The
  editor's copy and cut each publish to the seam. The SQL grid publishes to the seam *and* still
  surfaces its denial message, which is what the published `copyText`'s failure callback buys. And the
  tree-scanning invariant: no file under `web/src/` but the seam's own writer writes to
  `navigator.clipboard` directly.
- **Paste resolution** (`paste-into-surface.test.ts`, pure over injected elements): the command bar's
  caret; the right-clicked field wins over the field holding the keyboard; an editor buffer is found
  through `data-editor-drop` and gets paste semantics; a harness tab writes bare text to the PTY with
  no trailing Enter and focuses that harness through `focusHarness`, which no other route calls; the
  command bar is the fallback; nothing to paste into is a no-op; an editor with no published handle,
  which is one no longer visible, is ignored rather than mis-pasted into; with an overlay open, a
  paste reaches the editor that held focus when it opened even though focus is elsewhere; and a
  focused terminal input goes to the PTY rather than being pasted into.
- **The real route end to end** (`clipboard-history/paste-routing.test.tsx`): the plugin's module
  started with the real paste capability on the real seam. With an editor's textarea focused,
  opening the overlay moves focus to the popup, Return pastes the newest entry through the editor's
  `pasteAtCaret`, closes the overlay, and returns focus to the textarea; the same with a click on a
  row. With a harness tab exposed, Return sends `ptyInput` and focus ends on the terminal, whether
  the terminal or the body held focus as the popup opened.
- **The popup** (`clipboard-history/Popup.test.tsx`, which covers the component and the module): title
  `clipboard`, empty row `(no clipboard history)`, one line per entry, a multi-line entry's first
  line with a separate `(2 lines)` element in `.clipboard-history-lines` and a single-line entry with
  none, the newest on open, a copy made while it is open appearing in it, a long line in a
  `clipboard-history-label` span inside a `.clipboard-history-row` rather than on the shared row, a
  clicked row pasting the *full* stored text — never the postfix — at the anchor it was handed and
  closing, the arrows clamped with no wraparound, Return pasting and closing, Escape closing without
  pasting, Tab closing and preventing the default, the popup holding focus once rendered, the command
  bar claimed while open, and `dispose` emptying the store.
- **Openers** (`useWindowKeys.test.ts`): `Ctrl+Shift+V` opens a contributed overlay and suppresses the
  browser's paste — asserted directly, because the regression it guards is silent: without it, the
  popup opens *and* the browser's own paste-as-plain-text runs, and nothing about the popup looks
  wrong. `Ctrl+V` is left entirely alone; a chord no plugin declares claims nothing; a key being
  composed claims nothing, so an IME is never interrupted; an open contributed overlay takes the key
  instead of the picker that would otherwise open under it; `Cmd+Shift+V` opens an overlay claiming
  `meta+shift+v` and prevents the browser default; and `Cmd+T` is dispatched, which is the handler
  side of the chord the reserved-chord table now carries. `window-chords.test.ts` lets `Ctrl+Shift+V`
  and `Cmd+Shift+V` out of a terminal and rejects either with Alt, `Ctrl+Cmd+Shift+V`, and the bare
  `Ctrl+V` and `Cmd+V`.
- **The seam in the registry** (`overlay-registry.test.ts`): a contributed overlay changes none of the
  core registry's answers and `undefined` is still returned when nothing core is open;
  `commandBarSuppressed` reflects a plugin overlay's own bit and drops again on close; and
  `commandBarDisabled` never reports one, because the popup inserts at the caret and the bar has to
  stay live.
- **The hook** (`useOverlayPlugins.test.tsx`, the first test to mount the hook at all): a rerender with
  new option identities returns the *same* host, a plugin registered on the seam is still registered
  afterwards, the cap reaches the plugin through the ref on the same host, an open overlay closes when
  `tabLabel` changes and stays open across a rerender with the same label, a copy made before the
  clipboard popup has ever been opened is listed once the startup activation settles, and unmounting
  disposes the host so its claims stop answering. Without these the memo lifecycle was untested, which is why a host
  rebuilt on an ordinary re-render went unnoticed.
- **Where it renders** (`MountedViewLayers.test.tsx` and `overlay-props.test.ts`): a harness tab
  renders the contributed overlay alongside the task picker and tab navigator, and carries none when
  no plugin has one open; a plugin tab renders no overlay at all.
- **The context menu** (`DefaultContextMenu.test.tsx` and `default-menu-target.test.ts`): the new
  entry is present with an empty history; present beside `Copy` and `Paste` when both apply; present
  where neither of them applies, which is the case that used to open no menu at all; opens the popup
  with the element the right-click landed on; and a right-click on an editor tab with an empty
  selection now answers. `Copy`, the terminal-selection withholding, and the plugin's own contributed
  group are unchanged.
- **The command word** (`useCommandBarSubmit.test.ts`): a word a plugin claims opens its overlay
  instead of being dispatched, and a word no plugin claims is dispatched unchanged.
- **The import boundaries** (`src/eslint-plugin-boundaries.test.ts` and
  `src/eslint-feature-boundaries.test.ts`): the new block rejects an overlay plugin reaching a host
  module and allows one importing `../api` or reading the capture seam; the new zone rejects a feature
  importing `web/src/overlay-plugins/`, allows one importing the shared seam, and allows the host
  importing a feature. These files are what stop the lazy chunk from silently folding into the entry
  bundle and the one-way flow from eroding, so they are not optional to the rest.
- **The documentation** (`registry.test.ts`'s own block): the page shows the declaration the repository
  ships, documents every capability the contract hands a plugin, returns every member the overlay
  contract requires, states the ordering a plugin inherits, and names that test file as its pin.

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
- **Changing the shared `.picker-row` truncation deliberately.** The shared rule was briefly given
  `overflow: hidden` and `text-overflow: ellipsis` for this popup and then reverted: it changes all
  thirteen overlays that share the class, and on this one it did not even draw the glyph. If altering
  their long-label behaviour was ever the intent, it needs to be said out loud and tested on its own.
- **Reserving the chords `handleTabShortcuts` dispatches** — `ctrl+arrow` and Shift-arrow tab moves —
  which the plugin contract's own rules already exclude from plugin chords. Adding them is a separate
  decision about whether an arrow chord is claimable at all.
- **The equivalent guard in the editor-plugin and tab-plugin hosts.** `start`-runs-once and the
  memoized activation belong to this family; those two are separate contracts this change does not read.
- **Rebuilding the host on every render, or accepting a throwing `start` twice** — the first is settled
  by decision 31, the second cannot happen now that `start` runs once.
- **Buffering copies in the shared capture seam** for a plugin that has not loaded yet. Startup
  activation is the declared trigger the plugin guidelines name, and a buffer would put the history's
  cap and retention back in shared code (decision 34).
- **Republishing claims after a StrictMode dispose.** The generation guard stops a stale activation
  from starting a plugin; what a disposed-then-reused host does with its withdrawn claims under the
  development-only effect replay is a separate lifecycle question.
- **Platform-specific chords.** `Ctrl+Shift+V` and `Cmd+Shift+V` are both claimed on every platform,
  matching how the application's other Cmd chords are bound.
- Focus behavior of the built-in pickers, and closing them on a tab change; decisions 33 and 35 are
  about contributed overlays.
- Changing how a paste reaches a PTY (bracketed paste and the like), and pasting into the shell PTYs
  embedded in an agent tab, which the paste capability does not route to.
- Windows `\r\n` handling in the line count beyond what splitting on `\n` already does.
- Any change to the existing `Paste`, `Copy`, or the tab plugin's contributed context-menu entry.
- The file navigator's own row menu, which keeps its own Paste that acts on files.
- Any server-side clipboard. The pasteboard stays unreachable from a shell.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step, and
  `./scripts/run.mjs pr-check-gate` before the branch is handed on.
- The production web build with chunk inspection, to confirm the clipboard popup's modules are in
  their own chunk and are not reachable from the entry bundle — the one check that fails loudly if
  the capture seam is wired by static import.
- A deliberate edit to `documentation/developer-documentation/overlay-plugins.md`'s example must fail
  `registry.test.ts`, which is the check that the pin is pinning something.
- Manual end-to-end: before opening the popup at all, copy four snippets of differing shapes from an
  editor selection, a terminal selection, a SQL grid's rows, and a transcript drag; confirm the first
  open lists them newest at the bottom with one line each and a `(N lines)` postfix on the multi-line
  one; copy one again and confirm
  its row moved to the bottom rather than duplicating; paste more than 15 and confirm the oldest
  falls off. Then set `"clipboardHistoryMaxEntries": 5` in `.janissary/config.json` and confirm a
  restart trims to 5, that `0` falls back to 15, and that deleting the key returns it to 15. With
  text half-typed and the caret mid-line, open the popup with `Ctrl+Shift+V` and confirm Return
  splices at the caret and leaves the surrounding text intact and the keyboard back in the bar; open
  it with `Cmd+Shift+V`; open it with `clip`; confirm Tab closes it like Escape and that switching tabs
  closes it without pasting; open it from the
  right-click menu on a terminal with nothing selected, and on an editor tab with nothing selected. In
  an editor tab, confirm the entry lands at the caret with the caret left at the start of the pasted
  text, and that the arrows moved the popup's selection rather than the editor's caret. On a harness
  tab, confirm the text is typed into the PTY and not submitted, and that typing afterwards reaches
  the prompt. Reload the page
  and confirm the history is gone.
