# Focus the Create button when the harness launch dialog reopens with remembered settings

**Complexity: 2/10** — one component, one ref, one effect; no server or protocol changes.

## Goal

When the **New harness** launch dialog (`web/src/HarnessLaunchDialog.tsx`) opens and its fields
are pre-filled from a previous launch in the same app run (the module-level `remembered` state),
keyboard focus should land on the **Create** button instead of the dialog container. That lets a
user who wants to relaunch with the same settings just hit Return immediately. On a fresh dialog
(no remembered settings yet — first open of the run), focus behavior is unchanged: it stays on the
dialog container as today.

## Approach

`useDialogKeyboard` (`web/src/useDialogKeyboard.ts:15`) always focuses the dialog's outer `<div>`
on mount and is shared by four dialogs, so its generic behavior stays untouched. Instead,
`HarnessLaunchDialog` adds its own mount effect that runs after `useDialogKeyboard`'s and, only
when the dialog was initialized from `remembered` (not from `initialFields`), moves focus to the
Create button.

Whether the dialog started from remembered settings must be captured once, before any `update()`
call can overwrite the module-level `remembered` variable — a lazy `useState` initializer that
runs exactly once on mount is the right tool, mirroring the existing `fields` initializer pattern
right above it.

## Implementation steps

1. In `web/src/HarnessLaunchDialog.tsx`:
   - Add `const createButtonRef = useRef<HTMLButtonElement>(null);` alongside the existing
     `dialogRef`.
   - Add `const [hadRemembered] = useState(() => remembered !== null);`, placed directly after the
     `fields` state declaration so both read the same pre-mount value of `remembered`.
   - Add a `useEffect` (imported from `react`) after the `useDialogKeyboard(...)` call:
     ```ts
     useEffect(() => {
       if (hadRemembered) createButtonRef.current?.focus();
     }, [hadRemembered]);
     ```
     Declaring it after `useDialogKeyboard` ensures it runs after that hook's mount-time
     `dialogRef.current?.focus()`, so it wins.
   - Add `ref={createButtonRef}` to the Create `<button>` (line 93).
2. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `web/src/HarnessLaunchDialog.test.tsx`:

- `Create button is not focused on a fresh dialog (no remembered settings)` — render the dialog
  with `resetHarnessLaunchDialogMemory()` already called (via `beforeEach`), assert
  `document.activeElement` is not the Create button.
- `Create button is focused when the dialog reopens with remembered settings` — render, change a
  field (e.g. click Workspace) to populate `remembered`, `unmount()`, render again, assert
  `getByText('Create')` (or a ref-based query) is `document.activeElement`.

Mirror the existing "restores the previous selections when reopened within the run" test's
render/unmount/render-again pattern (`web/src/HarnessLaunchDialog.test.tsx:81`).

## Spec updates

`product/specs/harness.md`, "New harness launch dialog" section (~line 41): add a sentence after
"the dialog's selections are remembered in memory for the rest of the app run (reopening restores
them)" noting that reopening with remembered settings also focuses the Create button, so Return
relaunches immediately.

## Out of scope

- Changing `useDialogKeyboard`'s shared focus behavior for other dialogs.
- Any change to the Enter-key submit behavior itself — Enter already calls `create()` via the
  dialog's key handler regardless of literal DOM focus; this fix is about where visual/assistive
  focus lands, not about making Enter work.
- The other two backlog issues (sidebar default width, Effort dropdown) — separate fixes.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: open the harness launch dialog, change a setting, close it (Cancel or launch a harness),
  reopen with bare `harness` — Create button should show the browser's focus ring and pressing
  Return should launch immediately. Not run in this environment (no browser); covered by the
  automated `document.activeElement` tests instead.
