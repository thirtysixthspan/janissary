# Autoplay a video when its tab is opened

**Complexity: 2/10** — one client-side effect inside the bundled video plugin's view, plus tests and a spec/doc sentence. No server change, no contract change, no new state.

## Goal

Opening a video — `open <video>`, `video <path>`, or a file-navigator activation — starts playing it immediately instead of leaving a paused first frame that the user has to click. Everything else about playback is unchanged: the native controls still own play/pause, playback still survives tab switches, and a video whose tab is not on screen still keeps playing once started.

## Approach

1. **Play on mount, in the view.** The video tab's body mounts exactly once per open (the plugin tab layer keeps it mounted for the tab's life), so "the tab was opened" is the same moment as "the component mounted". An effect that calls `play()` once on mount is therefore the whole feature; no new payload field, intent, or server signal is needed.

2. **Only the visible tab autoplays.** The client remounts every open tab when the web page itself is reloaded. Without a gate, a reload of a session holding three video tabs would start three videos at once, none of which the user just opened. Gating the attempt on `capabilities.active` — which the host already supplies and which is true for a newly opened tab, since opening focuses it — limits a reload to at most the one video the user is actually looking at. The gate is read once, at mount: switching to a video tab later does not start it, which keeps "returns exactly as it was left" true for a tab the user paused.

3. **A blocked autoplay is a normal outcome, not a failure.** Browsers refuse to start playback with sound in some conditions, and `play()` reports that by rejecting its promise. The rejection is swallowed: the video stays paused with its native controls, exactly as today. It is not reported through `reportFailure` — that would disable the plugin over an ordinary policy decision — and nothing is muted to work around it, since silent playback is not what the issue asks for.

4. **`autoPlay` as an attribute is not enough on its own** — it gives no way to observe or ignore a refusal, and it re-arms whenever the element's source changes. The explicit call keeps the one-shot semantics and the swallowed rejection in the same place.

## Implementation steps

1. `web/src/plugins/video/VideoTab.tsx`: add a mount effect that calls `videoRef.current?.play()` when the tab is active, ignoring a rejected promise. It runs once per mount (empty dependency list, with the active flag read at mount) and does nothing when the decode-failure fallback is showing, since there is no player element then.

2. Keep the element otherwise untouched: same `src`, same `controls`, same `onError` fallback.

## Tests

`web/src/plugins/video/VideoTab.test.tsx` (stubbing `HTMLMediaElement.prototype.play`, which jsdom does not implement):

- Mounting a video tab whose plugin tab is active calls `play()` exactly once.
- Mounting a video tab that is not the visible one does not call `play()`.
- A `play()` promise that rejects (autoplay blocked) is swallowed: no unhandled rejection, no `reportFailure`, and the player still renders.
- Re-rendering the mounted view does not call `play()` again, so a paused video is not restarted by an unrelated update.
- An environment whose `play()` answers with nothing rather than a promise (jsdom, and older browsers) still renders the player instead of throwing out of the effect.

## Out of scope

- Muting the video to force autoplay past a browser policy, or any autoplay preference/setting.
- Autoplaying a video whose tab is opened in the background, or restarting playback when a tab becomes visible again.
- Any change to the external-player path, frame capture, or the unplayable fallback.
- Autoplay for any other view (an image or markdown tab has nothing to play).
