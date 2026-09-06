# Show an attached e2e browser as a metadata-row flag

**Complexity: 2/10** — one more entry in the existing tab-flag pipeline. The flag mechanism, the wire field, the icon registry, and the rendering loop all already exist and already carry two flags; this adds a third. No new component, no new wire shape, no data-model change.

## Goal

A harness launched with `-b`/`--browser` gets its own headless Chromium, and nothing in the tab says so. The tab already tracks it (`Tab.browser`, set once at spawn in `src/harness/manager.ts:171` and kept so `profile save` can write it back), but that field never reaches the client. Show it in the metadata row as a third flag icon, next to the workspaced box and the auto-permit bolt, so a glance at the row answers "does this harness have a browser?".

## Approach

`buildTabView` (`src/tab/view.ts:51`) derives `flags` from server-side tab fields, and `tabFlagDisplay` (`web/src/shared/tab-flag-display.ts`) maps each identifier to an icon and a tooltip label. `AgentTabMeta` walks `flags` and renders whatever it finds, skipping identifiers with no display entry — so adding a flag is two entries and no rendering change.

The flag means *this tab has a browser right now*, not *this tab was launched with `-b`*. Those diverge when the browser dies: `browserGone` (`src/harness/manager.ts:243`) records the reason on `harness.browserError`, the tab keeps running, and nothing restarts the browser. Leaving the icon lit there would claim a capability the harness no longer has, and the tab is already showing the gone-browser band right underneath. So derive the flag from `tab.browser && !tab.harness?.browserError` rather than from `tab.browser` alone. `Tab.browser` itself is untouched — profile save still reads it — and `browserError` is written once and never cleared, so the icon drops on the same broadcast that raises the band.

Icon: `faGlobe` from `@fortawesome/free-solid-svg-icons`, already a dependency. It reads as "web browser" at flag size and collides with none of the twenty-odd glyphs already in `web/src/icons.ts`. Registered under the semantic name `browserIcon`, per that file's one-place-per-glyph rule.

Tooltip label: `E2E browser` — the name the harness spec and the New harness dialog already use for this flag.

## Implementation steps

1. `web/src/icons.ts` — add `faGlobe as browserIcon` to the solid re-export block.
2. `web/src/shared/tab-flag-display.ts` — import `browserIcon` and add `browser: { icon: browserIcon, label: 'E2E browser' }` after the `autoApprove` entry, so the icon renders to the right of the auto-permit bolt.
3. `src/tab/view.ts` — append `...(tab.browser && !tab.harness?.browserError ? ['browser'] : [])` to the `flags` array, after the `autoApprove` term, with a comment recording why a dead browser drops the flag.
4. `src/protocol/tab.ts` — extend the `flags` comment's example list to name the third identifier.

Run `./scripts/run.mjs check-diff` after each step.

## Tests

`src/tab/view.test.ts` (mirrors the existing `workspaced`/`autoApprove` flag cases):

- includes `'browser'` in flags when the tab has `browser` set
- omits `'browser'` once the tab's harness reports a `browserError`
- orders all three identifiers `['workspaced', 'autoApprove', 'browser']` when every one is active

`web/src/shared/AgentTabMeta.test.tsx` (mirrors the two existing flag-rendering cases):

- renders the browser flag as a globe icon with the accessible label `E2E browser`
- renders all three flag icons together, in wire order

## Spec updates

- `product/specs/tabs.md` — the flags paragraph says "Today there are two possible flags". Make it three, describe the globe icon and its `E2E browser` tooltip, and state that the flag tracks a live browser rather than the launch flag.
- `product/specs/harness.md` — in the `-b`/`--browser` section, note that the tab's metadata row carries the flag while the browser is alive, and that the flag clears alongside the gone-browser band.

## Docs

- `documentation/user-documentation/getting-started/tabs.md` already lists the flags a reader will see ("📦 workspaced, ⚡ auto-permitting"). That list is now wrong, so add the browser flag to it.
- `help.md` does not mention the metadata row or its flags. Nothing to change.

## Out of scope

- Clearing or recomputing `Tab.browser` itself. It records the launch flag for `profile save`, and repurposing it as a liveness field would change what a saved profile round-trips.
- Any signal for a browser that is still starting. The endpoint is handed out before Chromium finishes coming up, deliberately, and the tab has no provisioning state for it to show.
- Shell tabs and agent tabs. `browser` is harness-only; those tabs never set it and their rows are unchanged.
