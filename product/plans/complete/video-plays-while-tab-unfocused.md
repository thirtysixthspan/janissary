# Video plays while its tab is unfocused

**Complexity: 1/10** — no source change is required. The behavior this issue asks for became true when video tabs moved onto the persistent-mount path (`video-tab-playback-across-tab-switches.md`), and this plan's job is to prove it, pin it against regression, and say it plainly in the spec, which currently only implies it.

The backlog asks that "videos should continue to play, even when the tab is no longer focused." Video tabs are now rendered by `MountedViewLayers` (`web/src/MountedViewLayers.tsx`), which keeps every video tab mounted for the life of the tab and hides the unfocused ones with `display: none` instead of unmounting them. Hiding a media element does not pause it — nothing in the app pauses or reloads it either — so an unfocused video tab goes on playing, audio included. Verified against the current tree before this plan was written: the `<video>` DOM node is the identical object before and after a focus change, stays connected to the document, and neither `pause()` nor `load()` is called on it.

That is the whole of the requested behavior. What is missing is not code but **guarantees**: nothing in the suite currently fails if a future change adds a pause-on-blur effect, re-keys the layer, or moves video tabs back to `ViewTabBody`, and the spec describes the outcome only in passing ("a video that was playing when the tab lost focus is still playing when it regains it") rather than stating that playback continues *during* that time.

## Goal

A video keeps playing while its tab is not the focused one, and that stays true — a change that silently reintroduces pause-on-switch fails the suite rather than shipping.

## Approach

**Pin the mechanism, not the pixels.** jsdom implements no media pipeline: `play()` is unimplemented and `paused` never reflects real decoding, so no test in this project can assert that frames actually advance. What *can* be asserted is every link in the chain that would have to break for playback to stop — the element is never torn down and recreated, never removed from the document, never paused, and never reloaded. Those four assertions together are the regression guarantee; real playback stays a manual verification step.

**Test against the real `VideoTab`, in its own file.** `web/src/MountedViewLayers.test.tsx` mocks `VideoTab` away to a bare `<div>` at module scope, which is right for the layout assertions it makes but leaves no `<video>` element to inspect. A `vi.mock` cannot be undone for a single test in that file, so these assertions live in a sibling file that renders the real component. This follows the code guidelines' preference for small, focused modules over widening an existing one.

**State the behavior in the spec, including its cost.** Background playback is a deliberate choice with an obvious consequence — audio from a tab you cannot see — and the spec should say so, and say how to stop it (pause before leaving, or close the tab), rather than leaving a user to discover it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Persistent mounting and `display: none` hiding — the mechanism under test | `web/src/MountedViewLayers.tsx` (the video block) |
| Tab-view fixtures and handle-ref helpers to mirror | `web/src/MountedViewLayers.test.tsx:35`–`:70` |
| The spec section this extends | `product/specs/video-tab.md` → "Playback survives a tab switch" |

## Implementation steps

1. **No source change.** Confirm — do not modify — that `MountedViewLayers` renders the video layer for every video tab regardless of focus, that visibility is driven only by the `display` style, and that neither the layer nor `VideoTab` registers a blur/visibility effect that touches the element. If any of those turns out to be false, stop and revise this plan before writing code.

2. **Add `web/src/MountedViewLayers.video-playback.test.tsx`** — a focused file rendering the real `VideoTab` through `MountedViewLayers`, with a video tab and a plain agent tab, switching `current` between them.

3. **Extend the spec's playback section** in `product/specs/video-tab.md` to state that playback continues while the tab is unfocused, that this includes audio, and how to stop it.

## Tests

All in the new `web/src/MountedViewLayers.video-playback.test.tsx`:

- The `<video>` element is the **identical DOM node** after its tab loses focus, and is still connected to the document — the element that was playing is the element that is still there.
- Losing focus hides the body (`display: none`) and regaining it shows it (`display: flex`), with the same element throughout — visibility alone changes, never mounting.
- `HTMLMediaElement.prototype.pause` is **never called** across a focus change in either direction.
- `HTMLMediaElement.prototype.load` is **never called** on a focus change, so the media is not re-fetched and the playback position is not reset.

## Out of scope

- **Any pause-on-blur behavior**, including pausing when the whole application window loses focus. The issue asks for the opposite.
- **A tab-strip indicator for which tab is producing audio**, and any per-tab mute or global "pause all" control. Real gaps, but separate features rather than part of this issue.
- **Playing a video whose tab has been closed.** Closing a video tab unmounts it and stops playback; that is unchanged and correct.
- **Asserting real decoding or audio output.** Not reachable in jsdom; it stays a manual verification step.
- **Docking a video tab into a sidebar.** Video tabs are not dockable, and this plan does not make them so.
