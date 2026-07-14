# Task picker keyboard navigation and injection on a harnessed tab

**Complexity: 3/10** — two localized, well-understood bugs in existing, otherwise-correct wiring (xterm's capture-phase keydown listener swallowing events before they bubble to the window handler, and `pickTask` having no harness-aware branch). No changes to the shared `useWindowKeys`/`task-picker-keys.ts` dispatch chain, which is already correct and used unmodified by every other picker.

## Goal

Today, opening the task picker (Ctrl+A) over a harness tab shows the overlay, but Up/Down/Left/Right/Enter/Escape all reach the harness's PTY instead of the picker (arrow keys send cursor-key escape sequences, Enter sends `\r`, Escape sends ESC into the running program) — only a mouse click on a row reaches the picker's own `onClick`. After this fix, the same keys that drive every other picker (Up/Down move the selection, Right/Left expand/collapse or move to a directory's first child/parent, Enter selects, Escape closes) work identically over a harness tab, and selecting a task while a harness tab is active injects `execute ./ai/tasks/<path>` into that harness's PTY (there is no command line on a harness tab to populate instead).

## Root cause

**Bug 1 — xterm swallows the keydown before it reaches the window handler.** `HarnessTab.tsx`'s `harnessKeyFilter` only excludes two chords (Shift+Arrow, Ctrl+A) from reaching the PTY; every other key, including plain arrows/Enter/Escape, returns `true` ("send to PTY"). `useXterm.ts` wires this into `term.attachCustomKeyEventHandler`, and xterm.js registers its own keydown listener on its hidden textarea in the **capture phase**, calling `stopPropagation()` for any key it handles. Because capture-phase listeners run before bubble-phase listeners, and `stopPropagation()` cuts the event off entirely, `useWindowKeys.ts`'s `window.addEventListener('keydown', onKey)` (bubble phase, the mechanism every picker including this one relies on via `dispatchModalKey` → `dispatchTaskPickerKey`) never sees the event. Mouse clicks bypass this entirely since `TaskPicker.tsx`'s `onClick` fires directly on the DOM row.

**Bug 2 — even if the key reached the handler, "select" has nowhere to go on a harness tab.** `useTaskPicker.ts`'s `pickTask` unconditionally writes into the command line via `recallRef`/`inputRef`. On a harness tab there is no command bar in the DOM at all (`CommandArea` only renders when `!isViewTab && !current.activePty`, and `isViewTab` includes `'harness'`), so the picked text has nowhere to land.

## Approach

**Fix 1:** Give `HarnessTab` a `taskPickerOpen` prop (already computed as App-level state and already threaded down to `MountedViewLayers` for rendering the `TaskPicker` overlay itself — this just also passes it into `HarnessTab`). When `taskPickerOpen` is true, `harnessKeyFilter` returns `false` (bubble, don't send to PTY) unconditionally, matching how the existing Shift+Arrow/Ctrl+A exclusions already work. The picker's own keys (`HANDLED_KEYS` in `task-picker-keys.ts`) then reach `dispatchModalKey`, which already returns `true` whenever `taskPickerOpen` is set — so no other key leaks through to tab-shortcut handling while the popup is open, consistent with every other modal.

**Fix 2:** Give `useTaskPicker` the active tab's harness `ptyId` (`undefined` when the active tab isn't a harness) and the `client`. `pickTask` branches: if a harness `ptyId` is present, send the picked text as `ptyInput` to that PTY (`client.send({ method: 'ptyInput', params: { id: ptyId, data: text } })` — the identical shape `useXterm.ts` already uses for terminal input) instead of writing to `recallRef`. The command-line-population behavior for non-harness tabs is unchanged.

No changes are needed to `TaskPicker.tsx`, `task-picker-keys.ts`, `useWindowKeys.ts`, `ShellTab.tsx`, or `TerminalCard.tsx` — the task picker never opens over a shell tab (Ctrl+A reaches the shell terminal itself there, per `specs/task-picker.md`), so their analogous static `keyFilter`s are out of scope.

## Implementation steps

1. `web/src/HarnessTab.tsx`:
   - Add `taskPickerOpen?: boolean` to `Properties`.
   - Change `harnessKeyFilter` to `harnessKeyFilter(e: KeyboardEvent, taskPickerOpen: boolean): boolean`, returning `false` immediately when `taskPickerOpen` is true, before the existing Shift+Arrow/Ctrl+A checks.
   - Pass `keyFilter: (e) => harnessKeyFilter(e, !!taskPickerOpen)` into `useXterm` (a new closure each render is fine — `useXterm` already re-reads `keyFilterRef.current` on every render without recreating the terminal).
   - Update the file's header comment describing which keys bubble.
2. `web/src/MountedViewLayers.tsx` — pass `taskPickerOpen={!!taskPickerOpen && t.label === current.label}` into each rendered `<HarnessTab>` (only true for the currently active harness tab that has the picker open over it; other mounted-but-hidden harness tabs are unaffected).
3. `web/src/useTaskPicker.ts`:
   - Add two parameters: `client: JanusClient` and `harnessPtyId: string | undefined`.
   - In `pickTask`, branch: if `harnessPtyId` is set, `client.send({ method: 'ptyInput', params: { id: harnessPtyId, data: text } })`; otherwise keep the existing `recallRef.current?.(text); inputRef.current?.focus();` path. `setTaskPickerOpen(false)` runs either way.
   - Update the file's header comment to describe the harness-injection branch.
4. `web/src/App.tsx` — change the `useTaskPicker` call site to pass the two new arguments: `client` (already in scope) and `current?.view === 'harness' ? current.harness?.ptyId : undefined`. This is a single-line edit to the existing call (no net line-count change, keeping the file at its current line-count ceiling per the project's 200-line lint limit).

## Tests

- `web/src/HarnessTab.test.tsx` — add cases mirroring the existing key-handler tests:
  - `key handler returns false (bubble) for ArrowUp/ArrowDown/ArrowLeft/ArrowRight/Enter/Escape when taskPickerOpen is true` (render with `taskPickerOpen` prop set, assert `capturedKeyHandler` returns `false` for each).
  - `key handler returns true (send to PTY) for a regular key when taskPickerOpen is false` (confirms the existing "regular keys go to PTY" test still holds now that the filter takes a second argument, i.e. no regression when the picker is closed).
- `web/src/useTaskPicker.test.ts` — add:
  - `pickTask sends ptyInput to the harness when harnessPtyId is set` — construct the hook with a mock `client` and a `harnessPtyId`, call `pickTask`, assert `client.send` was called with `{ method: 'ptyInput', params: { id: harnessPtyId, data: 'execute ./ai/tasks/<path>' } }` and that `recallRef`/`inputRef` were *not* used.
  - Existing `pickTask populates the command line...` test updated to pass `harnessPtyId: undefined`, confirming the non-harness path is unchanged.

## Spec updates

- `specs/task-picker.md` — the "Openers" section already says "On an agent or transcript tab, or a harness tab, `Ctrl+A` opens the picker" and "Picker behavior" already documents the same Up/Down/Left/Right/Enter/Escape table for all cases; no behavioral change to *document* there since the fix makes the harness case match the already-documented behavior. Add one clarifying sentence to "Picker behavior" noting that on a harness tab, selecting a task sends it directly into the harness's terminal input (there is no command line to populate there) rather than the "Copies `execute ./ai/tasks/<path>` into the command line" wording, which is specific to tabs that have one.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, typechecks affected projects, runs related web tests.
- Manual: not performed in this environment (no way to drive the Electron/web app here); behavior is covered by the new automated tests exercising the key-filter bubbling and the harness-aware `pickTask` branch directly.

## Out of scope

- `ShellTab.tsx` / `TerminalCard.tsx` — the task picker never opens over a shell tab or terminal card; their static `keyFilter`s are unaffected and untouched.
- Any change to `dispatchModalKey`, `useWindowKeys.ts`, or `task-picker-keys.ts` — already correct and shared by every picker; the harness tab just wasn't letting keys reach them.
- Explicit re-focus of the harness terminal after picking/closing — DOM focus never leaves xterm's hidden textarea during this interaction (the picker overlay renders on top visually but is not itself focusable), so no refocus call is needed.
