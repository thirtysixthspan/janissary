# Ctrl+G tab navigator in harness windows

**Complexity: 3/10** — mirrors an existing, working pattern (`Ctrl+A` task picker in harness tabs) key-for-key; no new state model, just extending the existing filter/render plumbing to a second chord.

## Goal

`Ctrl+G` should open the fuzzy tab navigator from a focused harness tab, exactly as `Ctrl+A` already
opens the task picker there. Today it does neither: `Ctrl+G` is not in `HarnessTab`'s
`harnessKeyFilter` allow-list, so xterm swallows the keystroke and sends it straight to the PTY
instead of letting it bubble to the window handler that calls `openTabNav`. Even if it did bubble,
the navigator overlay (`TabNavPicker`, rendered via `PickerOverlays` inside `AgentTabBody`) is never
mounted for a harness tab in the first place — `AgentTabBody` only renders when
`!isViewTab && !current.activePty`, which excludes every harness/PTY tab.

## Approach

Reuse the exact task-picker plumbing already in place for harness tabs:

1. `HarnessTab.harnessKeyFilter` — bubble `Ctrl+G` (like `Ctrl+A`) to the window handler instead of
   sending it to the PTY. Also bubble every key while the nav overlay is open (matching the
   existing `taskPickerOpen` blanket-bubble rule), so Up/Down/typing/Enter/Escape reach the window
   handler instead of the terminal while the picker is open over a harness tab.
2. `MountedViewLayers` — render `TabNavPicker` inside the current harness tab's body when `navOpen`
   is true, the same way it already renders `TaskPicker` there for `taskPickerOpen`.
3. `App.tsx` — pass `navOpen`, `navQuery`, `navIndex`, and `selectNavTab` through to
   `MountedViewLayers` (the `tabs` array is already passed through for the harness-tab rendering
   loop, and `TabNavPicker` needs exactly `{ tabs, query, selected, onPick }`).

No changes to `useWindowKeys`, `keyboard-handlers.ts`, `useTabNav`, or `TabNavPicker` — the
query/selection/open state machine is already tab-type-agnostic; the only gap is (a) the keystroke
never reaching it and (b) the overlay never being mounted, from a harness tab.

## Reuse map

| Piece | Where | What it already does |
|---|---|---|
| `harnessKeyFilter` | `web/src/HarnessTab.tsx:14` | Bubbles `Ctrl+A` and blanket-bubbles all keys when `taskPickerOpen` — mirror both for `Ctrl+G` / `navOpen` |
| Task picker rendered in harness body | `web/src/MountedViewLayers.tsx:46-48` | `{taskPickerOpen && t.label === current.label && ... && <TaskPicker .../>}` — same shape for `TabNavPicker` |
| `TabNavPicker` props | `web/src/TabNavPicker.tsx:53` | `{ tabs, query, selected, onPick }` — no new props needed |
| State already computed in `App.tsx` | `web/src/App.tsx:93` | `navOpen, navQuery, navIndex, ..., selectNavTab` — just needs threading to `MountedViewLayers` |
| Existing harness-tab task-picker tests (pattern to mirror) | `web/src/HarnessTab.test.tsx:110-131`, `web/src/MountedViewLayers.test.tsx:171-211` | Ctrl+A bubble test, blanket-bubble-while-open test, render-inside-current-harness-tab test |

## Implementation steps

1. **`web/src/HarnessTab.tsx`** — extend `harnessKeyFilter` to take a `navOpen` flag and treat
   `Ctrl+G` like `Ctrl+A`:
   ```ts
   function harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean, navOpen: boolean): boolean {
     if (e.type !== 'keydown') return true;
     if (taskPickerOpen || navOpen) return false;
     const isTabSwitch = (e.shiftKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
       || (e.metaKey && e.shiftKey && ['[', '{', ']', '}'].includes(e.key));
     const isTaskPicker = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'a';
     const isTabNav = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'g';
     return !(isTabSwitch || isTaskPicker || isTabNav);
   }
   ```
   Add a `navOpen?: boolean` prop to `Properties`, pass it into the `keyFilter` closure, and update
   the component's top comment block to mention the new chord and blanket-bubble condition.

2. **`web/src/MountedViewLayers.tsx`** — add `navOpen`, `navQuery`, `navIndex`, `onPickTab` to
   `Properties`, pass `navOpen` through to `HarnessTab`, and render `TabNavPicker` alongside
   `TaskPicker` in the harness tab body:
   ```tsx
   <HarnessTab ... navOpen={!!navOpen && t.label === current.label} ... />
   <StatusPanels .../>
   {taskPickerOpen && t.label === current.label && onPickTask && onToggleTaskDir && (
     <TaskPicker .../>
   )}
   {navOpen && t.label === current.label && onPickTab && (
     <TabNavPicker tabs={tabs} query={navQuery ?? ''} selected={navIndex ?? 0} onPick={onPickTab} />
   )}
   ```
   Import `TabNavPicker` from `./TabNavPicker`.

3. **`web/src/App.tsx`** — pass `navOpen`, `navQuery`, `navIndex`, and `onPickTab={selectNavTab}`
   into the existing `<MountedViewLayers ... />` call (~line 170-171), alongside the task-picker
   props already threaded there.

## Tests

- **`web/src/HarnessTab.test.tsx`** (mirror the existing Ctrl+A tests at `:110-131`):
  - `key handler returns false (bubble) for Ctrl+G`
  - `key handler returns true (send to PTY) for Ctrl+Shift+G`
  - `key handler returns false (bubble) for a regular key when navOpen is true` (mirrors the
    `taskPickerOpen` blanket-bubble test, using an arbitrary key like `'a'` with no modifiers)
- **`web/src/MountedViewLayers.test.tsx`** (mirror the existing task-picker tests at `:171-211`):
  - `renders the tab navigator inside the current harness tab when navOpen is true`
  - `does not render the tab navigator in a harness tab that is not current`
  - `does not render the tab navigator when navOpen is false`

## Spec update

- **`product/specs/tab-navigator.md`** — "Opening the navigator" section currently doesn't mention
  tab-type scoping at all (unlike `task-picker.md`, which explicitly calls out harness-tab support
  and the shell-tab exception). Add a sentence parallel to task-picker's: `Ctrl+G` opens the
  navigator from an agent/transcript tab or a harness tab; it overlays whichever tab was focused
  when it opened.

## Docs

- `help.md` and `documentation/user-documentation/command-bar/tab-navigator.md` describe `Ctrl+G`
  opening the navigator without claiming any tab-type restriction, so neither is factually wrong
  today — no changes needed there.

## Out of scope

- Any change to `useWindowKeys.ts`, `keyboard-handlers.ts`, `useTabNav`, or `TabNavPicker.tsx` — the
  state machine already works once the keystroke and render gap are closed.
- Shell tabs (`view: 'shell'` / `ShellTabLayer`) — out of scope; the issue only asks about harness
  windows, and shell tabs have their own PTY-passthrough rationale (same as `Ctrl+A` today, per
  `task-picker.md`).
