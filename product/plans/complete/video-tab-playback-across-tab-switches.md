# Video tab playback across tab switches

**Complexity: 3/10** — the app already has the mechanism this needs (`MountedViewLayers`, which keeps harness, editor, and page tabs mounted precisely so their state survives a tab switch). The fix moves the video tab from the unmount-on-switch path onto that one: one new layer block, one line in the render-body exclusion list, one branch removed from `ViewTabBody`, and the spec paragraph that promised the old behavior.

Switching away from a video tab today destroys the player. `ViewTabBody` renders the video tab (`web/src/ViewTabBody.tsx`), and `AppCenterActionArea.renderBody` only renders a body for the focused/visible tab, so leaving the tab unmounts the `<video>` element. Coming back mounts a fresh one at time zero: the position is lost, the paused/playing state is lost, and the volume and playback-rate the user set on the native controls are lost with them. For anything longer than a short clip that makes the tab unusable — glancing at another tab costs you your place.

The video tab was deliberately left off `MountedViewLayers` when it was built ("Keeping playback alive across tab switches" was listed out of scope in `video-opener-and-video-tab.md`). This is the follow-up that puts it there.

## Goal

Switching away from a video tab and back returns the player exactly as it was left: same position, same paused/playing state, same volume and playback rate.

## Approach

**Move the video tab onto the persistent-layer path.** `MountedViewLayers` (`web/src/MountedViewLayers.tsx`) renders every harness, editor, and page tab all the time, hiding the ones that are not visible with `display: none` rather than unmounting them. A hidden `<video>` element keeps its `currentTime`, `paused`, `volume`, and `playbackRate` — and, because `display: none` does not pause media, keeps playing. Reusing this path is a smaller change than caching playback state and restoring it on remount, and it is the pattern the codebase already uses for exactly this requirement.

**Key the layer on the tab label, not the payload url.** The editor layer keys on `t.label` specifically so that a payload change (a rename moving `editor.url`) does not tear the component down; the page layer keys on `t.page.url` because navigating a page tab *should* remount it. A video tab wants the editor's behavior: nothing about a payload refresh should restart playback. This is a deliberate difference from the `key={tab.video.url}` the tab used while it lived in `ViewTabBody`, where the key was only ever a remount hint.

**Remove the `ViewTabBody` branch rather than leaving both.** With the layer in place, `AppCenterActionArea.renderBody` must return `null` for a video tab the same way it already does for harness, editor, and page tabs — otherwise the tab renders twice, with two players fighting over the same file. `ViewTabBody`'s video branch becomes unreachable and comes out; its two tests change to match the precedent the page tab already sets there ("returns null when view is page (page tabs are rendered by MountedViewLayers)").

**Nothing moves to the server.** Playback state stays a view-local concern living in the DOM element, which is what architecture principle 1 asks for — the client may own ephemeral view-local state, and playback position is the definition of that. No new payload field, no wire-type change, nothing persisted, and no change to `--relaunch` behavior.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Persistent mounting, visibility, pane placement, split wiring | `web/src/MountedViewLayers.tsx:70` (the page-tab block, the closest model) |
| The render-body exclusion list that stops a double render | `web/src/AppCenterActionArea.tsx:41` |
| Visible-label computation for the primary/secondary pane | `web/src/AppCenterActionArea.tsx:38` |
| Left-border color for a visible-but-unfocused body | `web/src/tab-body-border.ts` (`tabBodyBorder`) |
| The video tab body itself — unchanged by this plan | `web/src/VideoTab.tsx` |
| Layer test patterns (render / hidden / flex / missing-payload) | `web/src/MountedViewLayers.test.tsx:297`–`:352` (the page-tab set) |

## Implementation steps

1. **Add the video layer to `MountedViewLayers`.** A fourth block mirroring the page block: filter `tabs` to `t.view === 'video' && t.video`, render a `.tab-body` wrapper carrying `data-pane-index`, `borderLeft` from `tabBodyBorder(t.dotColor, t.label === current.label)`, `display: visibleLabels.includes(t.label) ? 'flex' : 'none'`, and the `gridColumn`/`gridRow` placement the other blocks use. Inside it render `<VideoTab video={t.video!} client={client} onSplit={onSplit ? () => onSplit(index) : undefined} />`, keyed on `t.label`. Update the component's header comment to say harness, editor, page, **and video** tabs stay mounted, and why video is among them.

2. **Stop `AppCenterActionArea` rendering a second copy.** Add `'video'` to the `['harness', 'editor', 'page']` list at `web/src/AppCenterActionArea.tsx:41`, so `renderBody` returns `null` for a video tab.

3. **Remove the now-unreachable branch from `ViewTabBody`.** Drop the `tab.view === 'video' && tab.video` branch and the `VideoTab` import, and update the file's header comment (which currently lists video among the tabs it renders) to move video into the "rendered separately in App (via MountedViewLayers)" sentence alongside harness, editor, and page.

## Tests

- `web/src/MountedViewLayers.test.tsx` — a `makeVideoTab` helper beside the existing `makePageTab`, then the same four cases the page tab has: the layer renders a `.tab-body`; it is `display: none` when the tab is not current; it is `display: flex` when it is; and a `view: 'video'` tab with no payload renders nothing.
- `web/src/MountedViewLayers.test.tsx` — **the regression this fix is about**: a video tab that goes from current to not-current and back is never unmounted. Mock `VideoTab` with a mount counter (the file already does exactly this for `EditorTab`) and assert the count stays at 1 across both re-renders, so the `<video>` element — and with it the playback position — survives.
- `web/src/MountedViewLayers.test.tsx` — the layer keys on the label, not the payload: changing `video.url` on the same tab does not remount (mirrors the existing editor rename test).
- `web/src/ViewTabBody.test.tsx` — replace the two video cases with one asserting `ViewTabBody` renders nothing for a `view: 'video'` tab, matching the page-tab case already there.

## Out of scope

- **Restoring playback position across app restarts.** The video tab stays live and in-memory; `--relaunch` and `profile launch` still do not reopen it, and reopening a file still starts at the beginning.
- **Pausing a video when its tab loses focus.** This plan makes playback survive a tab switch, which means audio from a hidden video tab keeps playing. That is the behavior the backlog asks for next ("videos should continue to play, even when the tab is no longer focused"); no pause-on-blur behavior is added here or later.
- **A playback-position indicator in the tab strip**, or any tab-strip change at all.
- **Tab-scoped playback keys** (space to pause, arrows to seek) — still the native controls' job.
- **Any server-side or wire-type change.** No new `VideoView` field, no persistence.
