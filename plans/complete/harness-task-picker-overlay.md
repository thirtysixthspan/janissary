# Ctrl+A task picker overlays the harness tab, not the agent tab

**Complexity: 4/10** — the picker components, the "is this the last tab" style predicates, and the
positioning CSS all already exist and work correctly for the agent-tab case; the fix is rendering
the existing `TaskPicker` inside the harness tab's own (already `position: relative`) container
instead of only in the agent-tab body. No new CSS, no new state — one component gets a few new
optional props and a conditional render.

## Goal

When a harness tab (a full-tab AI/ACP/shell terminal) is focused and Ctrl+A opens the task picker,
the picker overlays *that* harness tab, matching where the keystroke was pressed. Today it silently
sets global `taskPickerOpen` state but renders nothing until the user switches to a plain agent
tab, where it then unexpectedly appears.

## Design decisions

**Render `TaskPicker` directly inside `MountedViewLayers`'s harness div, not the whole
`PickerOverlays` stack.** `PickerOverlays` is a mutually-exclusive stack of *every* picker/chooser
(route, theme, nav, history, queue, tasks) driven by the various Ctrl-chords in
`useWindowKeys.ts`'s `ctrlChordOpener`. But `HarnessTab.tsx`'s `harnessKeyFilter` only ever lets
Ctrl+A (and Shift+←/→ for tab switching) bubble past the terminal — every other chord (Ctrl+R/G/E)
reaches the PTY instead, matching normal shell/readline bindings. So `taskPickerOpen` is the only
picker state that can ever be true while a harness tab is displayed; duplicating the full
`PickerOverlays` (and its ~20 props) into `MountedViewLayers` would be dead weight for a case that
can't occur. A bare `<TaskPicker />`, gated on `taskPickerOpen`, is the entire overlay surface
actually reachable there.

**No CSS change needed.** `.picker` (theme.css) is `position: absolute; ...; bottom: 0`, anchored
to the nearest positioned ancestor — the agent-tab case works because `.main` is
`position: relative`. The harness tab's own wrapper div in `MountedViewLayers.tsx` already sets
`position: 'relative'` inline (for `StatusPanels`), so dropping `TaskPicker` in there anchors it
identically, for free.

**New `MountedViewLayers` props are optional**, following the existing `TabStrip.onFocusCommandBar?`
precedent — this keeps the file's 8 existing tests (which don't render a task picker) unchanged;
only a new test needs to pass them.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `TaskPicker` component (4 props: `rows`, `selected`, `onPick`, `onToggleDir`) | `web/src/TaskPicker.tsx` |
| Harness div already `position: relative` | `web/src/MountedViewLayers.tsx:26` |
| `.picker`'s absolute/bottom positioning | `web/src/theme.css:234-239` |
| `taskPickerOpen`/`visibleTasks`/`taskPickerIndex`/`pickTask`/`toggleTaskDir` (already computed in `App.tsx` via `useTaskPicker`) | `web/src/App.tsx:98-101`, `web/src/useTaskPicker.ts` |
| Ctrl+A bubbling only from harness tabs (confirms no other picker can appear there) | `web/src/HarnessTab.tsx:10-15` |

## Web changes

1. **`web/src/MountedViewLayers.tsx`** — add optional props `taskPickerOpen?: boolean`,
   `taskRows?: VisibleTaskRow[]`, `taskPickerIndex?: number`, `onPickTask?: (path: string) => void`,
   `onToggleTaskDir?: (path: string) => void`. Inside the harness-tab `.map()`, after `StatusPanels`,
   render `<TaskPicker rows={taskRows ?? []} selected={taskPickerIndex ?? 0} onPick={onPickTask} onToggleDir={onToggleTaskDir} />`
   when `taskPickerOpen && t.label === current.label && onPickTask && onToggleTaskDir`.
2. **`web/src/App.tsx`** — pass `taskPickerOpen`, `taskRows={visibleTasks}`, `taskPickerIndex`,
   `onPickTask={pickTask}`, `onToggleTaskDir={toggleTaskDir}` into the existing `<MountedViewLayers />` call.

## Tests

- **`web/src/MountedViewLayers.test.tsx`** — new cases: renders `TaskPicker` inside the current
  harness tab's div when `taskPickerOpen` is true; does not render it in a harness div that isn't
  the current tab; does not render it when `taskPickerOpen` is false/omitted (covers the 8 existing
  untouched cases still passing with no picker props).

## Verification

- `./scripts/run.mjs check-diff` — lint, incremental typecheck, and the related web tests.
- Manual (not run in this environment): focus a harness tab (e.g. an ACP agent tab), press Ctrl+A —
  confirm the task picker overlays that harness tab in place, rather than appearing only after
  switching to a plain agent tab.

## Out of scope

- Any other Ctrl-chord picker (history/nav/queue/theme/route) appearing over a harness tab —
  `harnessKeyFilter` never lets those chords bubble, so they cannot occur there today.
- Editor tabs — Ctrl+A there is the browser/editor's native "select all", a separate concern the
  issue doesn't raise.
