# Shell tab single overlay path

**Complexity: 3/10** — a client-only cleanup in the mounted view layers: delete three render branches production never reaches, gate the explicit tab navigator on the tab not hosting the command bar, and drop two props nothing else reads.

## Goal

Draw exactly one tab navigator over a shell tab, and remove the shell overlay branches in `MountedViewLayers` that can never render.

`AppMain` always passes `pickerOverlays` (a `<PickerOverlays>` element, never `null`) into the mounted layers, so the `hostsCommandBar(t) && !pickerOverlays && …` branches for `quickOpenOverlay`, `appThemePickerOverlay`, and `contributedOverlay` are dead. Meanwhile the current plugin tab's overlay always renders the explicit `TabNavPicker` when the navigator is open, and a command-bar plugin tab (the shell) also renders `pickerOverlays`, whose `tabNav` case is that same navigator. With `Ctrl+G` or `nav` in a shell, two navigators stack.

## Approach

A plugin tab that hosts the command bar takes its overlays from the full `pickerOverlays` stack only, which already includes the tab navigator. Every other plugin tab keeps the explicit `TabNavPicker`, because the navigator is the one overlay its chord can open there. The source-tab rule for the stack stays as it is: when a picker records a source tab, the stack renders over that tab only.

`contributedOverlay` remains in `PickerOverlayProps` because the harness layer still renders it. `quickOpenOverlay` (built in `AppMain`) and `appThemePickerOverlay` (built in `mountedPickerOverlayProps`) have no other consumer, so both go.

Rejected: keeping the explicit navigator for shells and suppressing the `tabNav` case inside `pickerOverlays`. The stack is the one ordered registry for which overlay wins, and carving a case out of it for one tab kind would make the shell the exception the registry exists to avoid.

## Implementation steps

1. In `web/src/MountedViewLayers.tsx`, replace the plugin tab overlay with: for a `hostsCommandBar` tab, `pickerOverlays` when there is no picker source tab or the source is this tab; otherwise the explicit `TabNavPicker` when the navigator is open. Delete the three `!pickerOverlays` branches and the `quickOpenOverlay` and `appThemePickerOverlay` props.
2. In `web/src/AppMain.tsx`, stop building `quickOpenOverlay` and drop the now-unused `QuickOpen` import.
3. In `web/src/pickers/picker/overlay-props.ts`, remove `appThemePickerOverlay` from `PickerOverlayProps` and from `mountedPickerOverlayProps`, with the imports only it used.
4. Update the tests (below) and the shell-tab spec.

## Tests

- `web/src/MountedViewLayers.test.tsx`: a current shell tab with `navOpen` and a real `PickerOverlays` stack whose navigator is open renders exactly one `.tab-nav-picker`.
- `web/src/MountedViewLayers.test.tsx`: a non-shell plugin tab with `navOpen` still renders the explicit navigator (existing cases keep passing).
- `web/src/MountedViewLayers.test.tsx`: the app theme picker reaches the current shell, and only that tab, through a real `PickerOverlays` stack — replacing the case that passed the dead `appThemePickerOverlay` prop.
- `web/src/MountedViewLayers.test.tsx`: a contributed overlay is drawn once over a shell, from the stack, even when the harness-only `contributedOverlay` prop is also set — replacing the case that exercised the dead branch.
- `web/src/pickers/picker/overlay-props.test.ts`: the projected key list no longer contains `appThemePickerOverlay`, and the app-theme projection case is removed.

## Spec

`product/specs/shell-tab.md`: the `nav` paragraph states the navigator appears once over the shell tab.

## Out of scope

- Which tab a picker opens over when its source tab is hidden or docked (a separate pull-request backlog entry).
- Navigator duplication over a non-shell plugin tab while a picker's source is a docked shell.
- Any change to the harness layer's overlay subset.
