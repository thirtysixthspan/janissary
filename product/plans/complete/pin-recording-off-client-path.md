# Pin the not-recording fact's path from the tab envelope to the drawn flag

**Complexity: 2/10** — no production lines or files, 8 requirements, 7 test scenarios (p=3.89)

## Goal

A shell or harness tab opened under `"logEnabled": false` must draw its film flag as `not recording`. The server already marks those tabs and mirrors `recordingOff` onto their views, and the two metadata rows already draw the flag correctly when they're handed the value. What nobody tests is the hand-off in between. On the plugin row the fact travels from the tab envelope through `PluginBody`, `usePluginCapabilities` and `createPluginClientCapabilities` before `ShellTabMeta` reads it. On the harness row `HarnessTab` passes `harness.recordingOff` to `HarnessTabMeta`. Drop any one of those forwards in a later refactor and the tab draws the plain `recording` flag while every unit test still passes. This plan adds tests at the two entry points so the path is pinned end to end, the same way `recording`'s path already is.

## Requirements

1. "hands a docked plugin recordingOff when its envelope carries it": a plugin tab whose envelope carries `recordingOff: true` hands its plugin body a capabilities object whose `recordingOff` is `true`.
2. "omits recordingOff when its envelope does not": a plugin tab whose envelope has no `recordingOff` hands its plugin body a capabilities object with no `recordingOff` key.
3. "`createPluginClientCapabilities` includes `recordingOff` only when it is `true`": with `recordingOff` absent from the options, the result has no `recordingOff` key.
4. "independently of `recording`": with both `recording` and `recordingOff` supplied, the result carries both, and `openRecording` is still supplied because of `recording`.
5. "never supplies `openRecording` because of it": with `recordingOff` supplied and no `recording`, the result has no `openRecording` and no `recording`.
6. "a harness view carrying `recordingOff: true` renders the flag with the title `not recording` and no button".
7. "one without it keeps the title `recording`": a harness view with no `recordingOff` draws the flag titled `recording` and draws no `not recording` flag.
8. "No production change is expected; if a test exposes a missing forward, fix that site in the same work."

## Design decisions

- The plugin row is pinned through the sidebar, in `web/src/plugins/DockedPluginBody.test.tsx`, because that file already renders the real `PluginBody` and `usePluginCapabilities` under a stub plugin that surfaces what it was handed. Its "hands a docked plugin the recording its envelope carries" case is the model (Existing functionality 1).
- The stub plugin gains one data attribute that tells "absent" from "present and true", because Requirement 2 is about the key being left out, which a plain `String(value)` would blur with a literal `undefined`.
- `createPluginClientCapabilities` is pinned directly in `web/src/plugins/plugin-client-capabilities.test.ts`, by letting that file's `setup` helper take option overrides. The sidebar test can't see `openRecording`'s origin, and the pure function is where the "independently of `recording`" rule lives (Assumption 2).
- The harness row is pinned in `web/src/harness/HarnessTab.test.tsx` by rendering a real `HarnessTab` from a `HarnessView`, the same wiring-from-the-view approach that file already uses for the remote attach control (Existing functionality 3).
- The existing `RecordingFlag`, `HarnessTabMeta` and `ShellTabMeta` tests stay untouched. They pin what the flag draws once handed the value, and this plan only pins that the value arrives.

## Preserved behavior

1. A docked plugin is handed the recording its envelope carries, along with an opener. It must not lose `recording` or `openRecording` when the stub gains a new attribute. Pinned by `web/src/plugins/DockedPluginBody.test.tsx` "hands a docked plugin the recording its envelope carries".
2. A docked plugin with no recording is handed neither a path nor an opener. It must not be handed an opener with no path behind it. Pinned by `web/src/plugins/DockedPluginBody.test.tsx` "hands a docked plugin neither when its envelope carries no recording".
3. The harness metadata row draws `not recording` as a plain, unpressable flag when handed `recordingOff`. It must not draw a `recording` button. Pinned by `web/src/harness/HarnessTabMeta.test.tsx` "draws the not-recording flag when the tab is not recording".
4. The shell metadata row draws `not recording` as a plain, unpressable flag when its capabilities carry `recordingOff`, even with an opener supplied. It must not draw a `recording` button. Pinned by `web/src/plugins/shell/ShellTabMeta.test.tsx` "draws the not-recording flag when the tab is not recording".
5. The capability factory's existing callers keep working when `setup` takes overrides. The `openConnection` cases must not change what they send. Pinned by `web/src/plugins/plugin-client-capabilities.test.ts` "sends a durable record id bound to the plugin tab label".

## Assumptions

1. `PluginBody` forwards the envelope's flag into the capability hook: `web/src/plugins/PluginBody.tsx:162` `recordingOff: plugin.recordingOff,`.
2. The factory spreads the flag only when it is true, apart from the `recording` spread: `web/src/plugins/plugin-client-capabilities.ts:97` `...(recordingOff === true && { recordingOff }),`.
3. The hook lists the flag in both its option `Pick` and its memo dependencies: `web/src/plugins/usePluginCapabilities.tsx:26` `| 'recordingOff'` and `web/src/plugins/usePluginCapabilities.tsx:102` `recording, recordingOff, transcript, remoteCapabilities, tabState],`.
4. The docked body renders the real `PluginBody`: `web/src/plugins/DockedPluginBody.tsx:44` `<PluginBody`.
5. `HarnessTab` forwards the view's flag to the row: `web/src/harness/HarnessTab.tsx:76` `recordingOff={harness.recordingOff}`.
6. The off flag's title and accessible name are `not recording`: `web/src/shared/tab/flag-display.ts:31` `recordingOff: { icon: recordingIcon, label: 'not recording' },`.
7. The plugin envelope type carries the flag: `src/protocol/plugin.ts:19` `recordingOff?: true;`.

## Existing functionality

1. The stub plugin that surfaces its capabilities as data attributes: `web/src/plugins/DockedPluginBody.test.tsx:39` `function registerCountingPlugin(id: string, mounts: () => void)`.
2. The capability factory test helper: `web/src/plugins/plugin-client-capabilities.test.ts:8` `function setup(tabState?: TabPluginState)`.
3. The harness view builder: `web/src/harness/HarnessTab.test.tsx:49` `function makeHarness(overrides: Partial<HarnessView> = {}): HarnessView`.

## Implementation steps

1. **Plugin row through the sidebar.** In `web/src/plugins/DockedPluginBody.test.tsx`, add `recordingOff?: true` to the stub plugin's capabilities type in `registerCountingPlugin` and a `data-recording-off` attribute that reads `absent` when the key is missing and the value otherwise. Add the two cases listed under Tests beside "hands a docked plugin the recording its envelope carries". Build command: `$janissary/scripts/run.mjs check-diff`.
2. **The capability factory.** In `web/src/plugins/plugin-client-capabilities.test.ts`, let `setup` take a second `Partial<PluginClientCapabilityOptions>` argument spread over its defaults, and add a `recordingOff capability` describe block with the three cases listed under Tests. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Harness row.** In `web/src/harness/HarnessTab.test.tsx`, add the two cases listed under Tests beside the metadata-row cases. If any test in steps 1 to 3 fails because a forward is missing, fix that one site and record it in this plan before moving on. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No UI changes. The tests pin the existing `not recording` flag on the shell and harness metadata rows.

## Tests

- `web/src/plugins/DockedPluginBody.test.tsx` "hands a docked plugin recordingOff when its envelope carries it": envelope carries `recordingOff: true`, body reads `data-recording-off="true"` and `data-can-open-recording="false"` (Requirement 1).
- `web/src/plugins/DockedPluginBody.test.tsx` "omits recordingOff when its envelope does not": plain envelope, body reads `data-recording-off="absent"` (Requirement 2).
- `web/src/plugins/plugin-client-capabilities.test.ts` "leaves recordingOff out when the tab will record": no `recordingOff` key in the result (Requirement 3).
- `web/src/plugins/plugin-client-capabilities.test.ts` "carries recordingOff beside a recording without changing its opener": both values present and `openRecording` supplied (Requirement 4).
- `web/src/plugins/plugin-client-capabilities.test.ts` "never supplies openRecording because of recordingOff": `recordingOff` true, no `recording`, no `openRecording` (Requirement 5).
- `web/src/harness/HarnessTab.test.tsx` "draws the not-recording flag for a harness view carrying recordingOff": flag titled and labelled `not recording`, no `recording` button, no `recording` title (Requirement 6).
- `web/src/harness/HarnessTab.test.tsx` "keeps the recording flag for a harness view without recordingOff": flag titled `recording`, no `not recording` title (Requirement 7).

## Out of scope

- Production code in the plugin host, the harness tab, or the metadata rows, unless a test exposes a missing forward (Requirement 8).
- The server side of the flag, already pinned by `src/tab/view.test.ts` "mirrors recordingOff onto the harness view and the plugin view".
- The centre-strip plugin layer, which renders the same `PluginBody` the sidebar does.
- The functional specs: `product/specs/harness-recording.md` § The recording flag already describes the `not recording` flag, and this plan changes no behavior.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Delete `recordingOff: plugin.recordingOff,` from `web/src/plugins/PluginBody.tsx` and rerun `npm run test:diff:web`: "hands a docked plugin recordingOff when its envelope carries it" fails. Restore it, then delete `recordingOff={harness.recordingOff}` from `web/src/harness/HarnessTab.tsx` and rerun: "draws the not-recording flag for a harness view carrying recordingOff" fails. Restore it. A pass with either forward deleted means the test does not pin the path.
3. Set `"logEnabled": false` in `.janissary/config.json`, launch the app, open a shell tab and a harness tab, and hover the film icon in each metadata row: both tooltips read `not recording` and neither icon can be pressed. A tooltip reading `recording`, or a green icon, is a failure.
