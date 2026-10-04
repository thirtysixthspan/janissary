# Shell history picker parity

**Complexity: 5/10** — the shell already has its own local history and picker state; reuse the application's existing picker UI and key handler while preserving the shell-specific “return to the command line” selection behavior.

## Goal

The shell tab's `Ctrl+R` history picker uses the same styling and keyboard navigation as the application's history picker. Selecting a line still places it in the shell command bar without running it.

## Approach

Promote the presentation-only `HistoryPicker` into the shared command-bar layer so both the application and shell plugin can use it without crossing feature boundaries. Publish the existing `handlePickerKey` helper through the tab-plugin host API. The shell picker renders the shared component and routes key events through the same handler. Keep shell history local and ordered oldest-first so the newest entry is selected at the bottom, matching the app picker.

## Implementation steps

1. Move `HistoryPicker` and its tests from `web/src/pickers/` to `web/src/shared/command-bar/`, adding optional presentation props for a caller-specific class and empty-state text while preserving existing defaults. Update `PickerOverlays` to import the shared component directly.
2. Expose the shared `HistoryPicker` and existing `handlePickerKey` helper through `web/src/plugins/api.ts` for bundled plugin reuse.
3. Update `web/src/plugins/shell/ShellHistoryPopup.tsx` to render `HistoryPicker`, use the shared keyboard handler, and keep its `onPick` behavior as command-line recall. Pass shell history oldest-first from `web/src/plugins/shell/ShellTab.tsx` and position the shared picker above the shell command bar in `web/src/plugins/shell/shell.css`.
4. Update the shell-history cases in `web/src/plugins/shell/ShellTab.test.tsx` to assert shared picker styling and keyboard behavior, including Up/Down selection, Enter-to-recall, Escape-to-close, and click-to-recall.
5. Update `product/specs/shell-tab.md` to state that the picker shares the application's presentation and navigation while returning a selected command to the shell bar.

## Tests

- `web/src/shared/command-bar/HistoryPicker.test.tsx`: optional class and empty-state props render while existing default behavior remains unchanged.
- `web/src/plugins/shell/ShellTab.test.tsx`: the shell uses the shared picker markup and keyboard handler while preserving its local-history data and recall-without-execution behavior.
- Existing keyboard-handler and picker tests continue to pass.

## Out of scope

- Changing the application history picker's order, empty state, selection rules, or execution behavior.
- Changing which shell lines are stored or the shell's `Ctrl+R` chord claim.
- Updating public history documentation, which already documents the picker keys and the shell's local history distinction.
