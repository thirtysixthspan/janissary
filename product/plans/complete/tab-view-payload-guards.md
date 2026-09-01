# Give the tab record real narrowing for its view-specific payloads

Complexity: 6/10

## Goal

Replace the non-null assertions that recover the tab record's "payload present only for this view kind" invariant with type guards that check it, so a view kind whose payload is genuinely absent — a harness tab caught mid-provision, a plugin record dropped by a failed activation — degrades instead of throwing a `TypeError` inside a render or an event handler.

## Approach

Two guard modules, one per shape, because the server holds a `Tab` and the client holds a `TabView`:

- `src/tab/view-guards.ts` — one predicate per payload-bearing view (`isHarnessTab`, `isEditorTab`, `isFilesTab`, `isPluginTab`, `isMonitorTab`), each typed `tab is Tab & { view: '<kind>'; <kind>: <Payload> }` and each checking **both** the discriminant and the payload's presence.
- `web/src/shared/tab-view-guards.ts` — the same five over `TabView`. It lives under `web/src/shared/` because two client features (`harness`, `editor`) and the app shell all need it, and the feature-zone lint forbids a feature importing a sibling.

Payload types are spelled `NonNullable<Tab['harness']>` rather than imported by name, so they cannot drift from the record and the `monitor` payload — which is declared inline on both shapes and has no exported name — needs no new type to be introduced for it.

The `Tab` declaration itself is left alone. Converting it into a true discriminated union reaches far more code and belongs in its own change; this run only stops the consumers asserting.

### Adoption, site by site

`src/monitor/window.ts` is the leverage point: `monitorTabs` filters on `t.view === 'monitor'` but returns `Tab[]`. Filtering with `isMonitorTab` and returning `MonitorTab[]` narrows all five monitor dereferences at once — the one in `pushSuggestion` and the four in `src/monitor/suggestions.ts` — without either file naming a guard. `makeMonitorTab` and `openMonitorTab` return `MonitorTab` to match.

`web/src/MountedViewLayers.tsx` needs care. Its `tabs.map((t, index) => ({ t, index })).filter(...)` pairs each tab with its index in the **unfiltered** strip, and that index is what identifies the tab to the pane layout, `closeTab`, and `onSplit` — so filtering the tabs before pairing them would renumber and misroute those handlers. The fix is a small `indexedTabs(tabs, guard)` helper in the client guard module that pairs first and filters with a predicate that narrows the pair, keeping the original index. All three `.map(...).filter(...)` chains go through it.

`web/src/harness/HarnessTabLayer.tsx` takes `t: HarnessTabView` instead of `TabView`; `MountedViewLayers` already hands it a narrowed tab.

`web/src/editor/useEditorConnections.ts` keeps its `tab: TabView` parameter and guards inside `closeRow` instead. Narrowing the parameter would cascade into `EditorTab`'s own `tab` prop and every one of its ~25 test call sites, which is churn for no safety this change does not already deliver: the early return is the degradation the guard is for.

`src/plugins/notifications.ts` and `src/tab/openers.ts` are the two sites where the existing predicate tests the **payload** (`tab.plugin?.id === id`, `t.editor?.path === view.path`) rather than the view discriminant. Adding a view check there would tighten a filter that today matches on payload alone, so their assertions are removed by narrowing what is already tested — a `flatMap` in the first, a typed `find` predicate in the second — leaving the set of matched tabs exactly as it is.

## Implementation steps

1. Write `src/tab/view-guards.ts` with the five predicates and their narrowed types.
2. Write `web/src/shared/tab-view-guards.ts` with the same five over `TabView`, plus the `indexedTabs` helper.
3. Adopt in `src/monitor/window.ts` (`monitorTabs`, `makeMonitorTab`, `openMonitorTab`, `pushSuggestion`); `src/monitor/suggestions.ts` should then need no edit beyond dropping its assertions.
4. Adopt in `src/plugins/notifications.ts` and `src/tab/openers.ts`.
5. Adopt in `web/src/MountedViewLayers.tsx`, then `web/src/harness/HarnessTabLayer.tsx`, then `web/src/editor/useEditorConnections.ts`.
6. Confirm no non-null assertion on a view payload remains at any of the named sites.

## Tests

- Add `src/tab/view-guards.test.ts`: each predicate accepts a tab with the right view **and** payload, and rejects three ways — wrong view, right view with the payload absent, and another kind's tab.
- Add `web/src/shared/tab-view-guards.test.ts`: the same five, plus `indexedTabs` — that it keeps each surviving tab's index from the **unfiltered** list, which is the property a naive filter-then-map would break.
- `web/src/MountedViewLayers.test.tsx` and `web/src/MountedViewLayers.video-playback.test.tsx` cover the rendering paths being touched; `src/monitor/window.test.ts` covers the suggestion paths. All must keep passing.
- Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

The user-visible change is a degradation, not a feature: a tab whose payload is missing renders nothing for that layer instead of taking the tab body out. `product/specs/` describes what each view shows, not what it does when its payload is absent, so there is nothing there this contradicts. No `help.md` or `documentation/user-documentation/` update expected.

## Out of scope

- Converting `Tab` (or `TabView`) into a true discriminated union.
- Guards for `agent` and `notifications`, which carry no payload of their own.
- Narrowing `EditorTab`'s `tab` prop, and the test churn that follows it.
- Any assertion outside the named call sites.
