# Fuzzy Tab/Workspace Navigator

## Summary

Add a command-mode picker for tabs, analogous to `hist`'s command-history picker. A keybinding (`Ctrl+G` or a `nav` command) opens a fuzzy-searchable modal list of every open tab — agent, harness, SSH, viewer, reporting — filterable by typing part of its label, with arrow/Enter to jump straight to it. The picker reuses the `hist` UI pattern, just pointed at tabs instead of command history.

## Decisions (to be confirmed with user)

1. **Trigger: dedicated keybinding + command.** `Ctrl+G` in the default keymap opens the navigator. A `nav` command (with optional fuzzy query: `nav depl`) provides a command-line entry point for agents and scripting. If the navigator is already open, `Ctrl+G` / `nav` dismisses it.
2. **Picker UI model: modal overlay, not a tab.** The picker renders as a floating modal above the command bar, mirroring the `HistPicker` / `RouteChooser` pattern. It is NOT a tab — no strip entry, no transcript, no persistence.
3. **Filtering: fuzzy substring on tab label + number.** Typing `deploy` matches tabs containing "deploy" anywhere in their label. `3` matches tab number 3 or labels containing "3". Numbers are also matched as-is for quick jump (type `3`, see tab #3 at the top).
4. **Controller model: server-owned, client-rendered.** Tab list comes from the server via the existing `StateEvent` snapshot — no new RPC needed. Selection dispatches `setActiveTab` with the chosen index. Server involvement is zero beyond serving state and honoring `setActiveTab`.
5. **Keybindings within the picker:** `Ctrl+G` (toggle), `Up`/`Down` (navigate), `Enter` (select and dismiss), `Escape` (dismiss), `Ctrl+N`/`Ctrl+P` (navigate), type-to-filter (input intercepts all printable keys).

## Verified codebase facts that shape the design

- **`hist` already provides the picker pattern.** `HistoryPicker.tsx` (22 lines) renders a floating `HistPicker` component with a filtered list, arrow selection, Enter to submit, Escape to dismiss. The tab navigator copies this pattern with a different data source, matching the keyboard-first design principle.
- **Tab list is already mirrored in the client.** `App.tsx` receives `tabs[]` via `useState<TabView[]>` updated on every `StateEvent`. No new RPC needed — the picker simply reads the same `tabs` array that `App.tsx` already holds.
- **`setActiveTab` is the only action needed.** The server's `TabManager.setActiveTab()` handles focus rules (harness tabs get PTY focus, editor tabs get editor focus). The picker just dispatches the index.
- **Modal overlays are well-established.** `RouteChooser.tsx` (18 lines) demonstrates the floating-modal-above-command-bar pattern. `HistoryPicker.tsx` adds fuzzy filtering. The navigator is a composition of both.
- **Keyboard handler pattern exist.** `keyboard-handlers.ts` processes key events in `App.tsx`, translating chords to actions. `Ctrl+G` would be added here, probably with a guard to prevent firing inside a focused PTY or editor.

## Proposed changes

### 1. Web UI — `TabNavPicker` component

- New module `web/src/TabNavPicker.tsx`:
  - Props: `tabs: TabView[]`, `onSelect: (index: number) => void`, `onDismiss: () => void`.
  - State: `query: string`, `selectedIdx: number` (index into filtered list).
  - Filtering: `tabs.filter(t => t.label.toLowerCase().includes(query.toLowerCase()))` — fuzzy substring match. Could be upgraded to a more sophisticated fuzzy scorer later, but substring-with-highlight is sufficient for v1.
  - Sorting: exact number matches sort first, then by label alphabetical. Direct dot-color injection is a stretch goal; v1 uses the tab's label text.
  - Each row: `tab.number` + dot color swatch (inline CSS background-color from `tab.dotColor`) + label text with highlighted match substring.
  - Keyboard handling: `useEffect` with `keydown` listener — `ArrowUp`/`ArrowDown` navigate `selectedIdx`, `Enter` calls `onSelect`, `Escape` calls `onDismiss`, `Ctrl+P`/`Ctrl+N` navigate, all others typed into `query` (via `e.key` when printable).
  - Styling: `tab-nav-picker` CSS class in `theme.css`, following `hist-picker` styling (~`position: absolute`, bottom-anchored above command bar, `max-height: 50vh`, `overflow-y: auto`, dark background with border).
- `TabView`: no changes needed. The picker reads `tabs[i].label`, `tabs[i].dotColor`, `tabs[i].number`.

### 2. Keyboard handler

- In `web/src/keyboard-handlers.ts`, add a `'g'` handler under `Ctrl` modifier (no Shift): dispatches a `toggle-tab-nav` event or sets a `navOpen` state. Guard: not inside a focused PTY input or editor.
- Alternative: add a `nav` command handler in `CommandInput.tsx` that toggles the picker, for command-line and agent-initiated access.

### 3. App integration

- `App.tsx`: add `const [navOpen, setNavOpen] = useState(false)` and a `handleNavSelect(index)` that calls `setActiveTab` RPC and sets `navOpen = false`.
- Render `TabNavPicker` above the command area when `navOpen` is true. The picker is position-absolute, so no layout restructure needed.
- `CommandInput.tsx`: when `nav` (or fuzzy `nav <query>`) is typed, toggle the picker instead of sending to the server. Pass the query string through to pre-populate the filter.
- The `hist` button in the command bar already serves as a chooser opener; the tab navigator could co-locate a second button or use `Ctrl+G` exclusively.

### 4. Specs

- New `specs/tab-navigator.md`: keybinding, `nav` command, picker UX (modal overlay, keyboard-only operation), filtering rules (substring, number match), data flow (server state → client render), and the `Escape` / click-outside-to-dismiss behavior.
- `specs/keyboard-navigation.md`: add `Ctrl+G` → tab navigator to the keybinding table.

### 5. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `web/src/TabNavPicker.test.tsx`: renders tab list, filters by query substring, navigates with arrows, Enter selects and calls onSelect with the correct index, Escape dismisses, Ctrl+P/N work, number matching.
- `web/src/keyboard-handlers.test.ts`: `Ctrl+G` dispatches toggle when not in PTY/editor mode.
- `web/src/App.test.tsx`: picker opens on `Ctrl+G` from `keyboard-handlers`, selecting a tab dispatches `setActiveTab` RPC.

## Implementation order

1. `TabNavPicker` component with fuzzy filtering and keyboard navigation, tests.
2. Keyboard handler: `Ctrl+G` integration, tests.
3. App integration: render the picker, wire `setActiveTab` dispatch, `hist` button companion if desired, tests.
4. `nav` command handler in `CommandInput`, tests.
5. Specs: new `tab-navigator.md` + `keyboard-navigation.md` amendment.
6. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
