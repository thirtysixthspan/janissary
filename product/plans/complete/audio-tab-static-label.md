# Audio tab always labeled "audio"

**Complexity: 2/10** — the dynamic title is computed in one function and set in one other spot, both in a single file; the fix removes the computation rather than adding any.

## Goal

The audio player tab's label in the tab strip must always read `audio`, never the name of the currently playing track.

## Approach

`src/plugins/audio/activate.ts` currently derives the tab title from the playing track's file name: `titleOf()` reads it off the payload, and both the tab-creation factory in `queue()` and every subsequent `updateTab` call (through `tabUpdate()`) apply it. Since the label must now be constant, set it once — to the literal `audio` — when the tab is created, and stop supplying a title on every later update; `TabPluginTabUpdate.title` is already optional and omitting it leaves the tab strip's label alone, which is exactly what a constant label needs. This removes `titleOf()` and `tabUpdate()` entirely rather than replacing them with a constant-returning version, since there is nothing left for them to compute.

## Implementation steps

1. In `src/plugins/audio/activate.ts`: delete `titleOf()` and `tabUpdate()`. In `queue()`, change the `openOrFocusTab` factory to return `{ title: 'audio', payload: playlist }` instead of using the track's file name. Change the `updateTab` call in the append branch and the one in `push()` to return `{ payload: playlist }` / `{ payload: next }` with no `title`.
2. Update the four title assertions in `src/plugins/audio/activate.test.ts` (tab creation, append, select-track, remove-track) to match: the opened tab's title is `'audio'`, and update payloads no longer carry a title. Rename the two intent test descriptions that reference "retitles"/"retitling" since the tab is no longer retitled.
3. Update `product/specs/audio-tab.md`: the "named after the playing track" behavior (Playlist behavior section, and the Tab strip section) becomes a fixed `audio` label.
4. Promote this plan to complete and remove only the fixed backlog line.

## Tests

- `src/plugins/audio/activate.test.ts`:
  - Opening the first file titles the tab `'audio'` (not the file name).
  - Appending a second file leaves the update's title unset.
  - `select-track` and `remove-track` intents leave the update's title unset.

## Out of scope

- Changing the tab's body content (`web/src/plugins/audio/AudioTab.tsx`), which already shows the track name separately and is unaffected.
- Changing `tabLabelPrefix` in the manifest, which is a distinct host-side grouping value, not the rendered title.
- User-supplied tab renames, which are a separate, pre-existing mechanism this plan does not touch.
