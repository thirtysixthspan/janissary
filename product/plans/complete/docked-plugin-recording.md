# Pass a docked plugin tab's recording through

**Complexity: 2/10** — one prop becomes a read of a field the component is already handed, plus two test cases. No new component, capability, protocol, or state.

## Summary

A docked plugin tab never receives its recording. `PluginTabLayer` passes `recording={tab.plugin.recording}` into `PluginBody` for the centre strip, but `DockedPluginBody` — the path every tab docked into a sidebar takes — does not, so its capabilities carry neither `recording` nor `openRecording` and `ShellRecordingFlag` always takes its inert branch. A docked shell tab therefore shows a grey recording flag forever, whatever its shell has printed, and nothing on screen distinguishes "not yet" from "never".

The fix is smaller than the review entry proposed, and the reason is visible in the code rather than in a preference. `PluginBody` already receives `plugin: NonNullable<TabView['plugin']>`, and `recording` is a field **on** that envelope. So `PluginBody` can read `plugin.recording` itself rather than being handed it beside, and doing so fixes the centre strip and the docked strip in the same change — with no prop for a future third surface to forget, which was the exact residual risk the entry named.

## Design decisions

1. **The prop goes away rather than being threaded through a second surface.** `recording` was a separate `PluginBody` prop only because the centre strip happened to be the first caller. Reading it off `plugin` makes the envelope the single place a tab's recording lives on the client, which is what the server already treats it as — one field, mirrored onto the plugin view. `PluginTabLayer` loses its prop, `Sidebar` never needed one, and `DockedPluginBody` needs no change at all.

2. **The memoized capability object still keys on the same value.** `PluginBody` builds its capabilities in a `useMemo` whose dependency list exists to keep the object stable across re-renders — a plugin component holding it must not re-mount because its capabilities changed identity. Replacing the prop with a read of `plugin.recording` puts the same string in that dependency list, so a new recording still rebuilds the capabilities exactly when the path first appears, and nothing else does.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The field, already on the pushed envelope | `PluginTabView.recording` in `src/protocol/plugin.ts` |
| Where the centre strip passes it today | `web/src/plugins/PluginTabLayer.tsx` |
| The capability pair it becomes | `recording` / `openRecording` in `web/src/plugins/api.ts` |
| The docked surface that drops it | `web/src/plugins/DockedPluginBody.tsx`, called from `web/src/Sidebar.tsx` |

## Proposed changes

- `web/src/plugins/PluginBody.tsx` — drop the `recording?: string` prop from its parameter type, and read `const recording = plugin.recording` where the capability object is built. Its `useMemo` dependency list keeps `recording` in the same position.
- `web/src/plugins/PluginTabLayer.tsx` — stop passing `recording={tab.plugin.recording}`, which the prop removal makes a type error.
- `web/src/plugins/DockedPluginBody.tsx` and `web/src/Sidebar.tsx` — **unchanged.** That is the point: the docked surface was never wrong, only the shape it was reading from.

## Tests

Two cases added to `web/src/plugins/DockedPluginBody.test.tsx`, which already renders the real `Sidebar` and a registered fixture plugin, so it reaches the docked surface the way the application does:

- A docked plugin tab whose envelope carries a `recording` hands its plugin a capability set with `recording` and `openRecording` present.
- A docked plugin tab whose envelope carries none hands its plugin neither.

Each needs the fixture plugin to surface what it was handed. `registerCountingPlugin` reads only `active` and `dock`, so extend it — or add a sibling that renders `capabilities.recording` — rather than reaching past the plugin into `PluginBody`. The existing `data-active` / `data-dock` attributes are the shape to mirror.

No existing case covers the recording field on either surface, so nothing regresses and nothing else needs updating: `web/src/plugins/PluginBody.test.tsx` builds its props directly, and removing an optional prop from the type cannot change a case that never passed it.

## Out of scope

- Changing the shell plugin's own rendering. `ShellRecordingFlag` reads `capabilities.openRecording` and takes its inert branch when absent, which is correct behavior for a tab with no recording; the bug was that a tab *with* one looked identical.
- The harness and ssh rows, which read `TabView.harness.recording` directly and never went through the plugin capability path.
- Any spec or documentation change. `product/specs/shell-tab.md` already states that a shell tab is dockable and that its flag is pressable from the first output — this fix makes the code match what the spec already says.

## Verification

- `./scripts/run.mjs check-diff` after the change.
- Manual: `zsh`, then dock the tab into a sidebar with the dock-cycle control, run a command so it prints, and confirm the film flag in the docked tab's metadata row is green and pressing it opens the recording. Undock it and confirm the flag still works, which is what it did before the fix either way.