# Preserve image save completion across docking

**Complexity: 5/10** — the repair synchronizes one image snapshot and its dirty handle through the existing per-tab state capability, with one App-level remount regression test.

## Goal

When an image save succeeds after the centre body has remounted in a sidebar, update the still-open tab's saved baseline and active dirty handle. Failed saves and edits made after the save starts must remain unsaved.

## Approach

The centre and sidebar bodies share a label-scoped `TabPluginState` accessor, but that accessor currently has no way to notify a newly mounted hook when an old hook's request completes. Add an optional subscription to the accessor and have its store notify listeners when values change. On successful save, merge the operations sent by that request into the latest shared image snapshot, preserving the current model, then let the mounted hook observe the new baseline and re-register its dirty handle. A failed intent never changes the snapshot. The saved baseline remains the operations captured at request start, so later edits stay dirty.

## Implementation

1. Extend `TabPluginState` with an optional change subscription and implement label-scoped notifications in `PluginTabStateStore`. Keep closed-label cleanup authoritative and remove listeners when accessors are disposed.
2. Update `useImageEdit` to persist the current model before asynchronous completion can race it, merge a successful save checkpoint into the latest snapshot, and observe shared baseline changes so the active hook updates its dirty state and handle. Keep save failures from changing the snapshot.
3. Add an App integration test that holds `save-edit` unresolved, docks the edited image before resolving it, then checks that the unsaved marker clears and a later `quit` opens only the ordinary quit confirmation. Confirming it sends the quit command without opening the save-changes dialog. Keep the existing failed-save and edit-during-save tests.
4. Update the image and tab-plugin specs plus the existing developer and user documentation that describe image saves and docking.

## Tests

- Add store coverage that `set` notifies a subscriber and disposal stops notifications for a closed label.
- Extend `web/src/App.test.tsx` with the unresolved save, centre-to-sidebar remount, cleared-marker, and clean-quit flow.
- Keep `web/src/plugins/image/ImageEditor.test.tsx` coverage for failed saves and edits made while a save is in flight.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- No server protocol or image save intent changes.
- No changes to image operation rendering, undo, redo, or the quit dialog wording.
- No changes to when centre and sidebar bodies mount.
