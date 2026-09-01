# Colocate the quick-open picker and the route chooser

## Complexity

3/10 — six file moves, relative-import adjustments inside them, and two importing files updated. No logic changes.

## Goal

Every other picker — history, theme, app theme, queue, task, profile, tab navigation — already lives in `web/src/pickers/`, but the quick-open component with its hook, and the route chooser, sit in the flat `web/src` root. The pickers feature's own overlay stack therefore climbs out of its directory with `../QuickOpen` and `../RouteChooser` to render two of the overlays it owns, which is §1 (organize by feature, not by a flat root) unapplied. Move all three into the pickers directory so the feature holds every picker it renders, and so the pickers lint zone covers them.

## Approach

Move the three modules and their three colocated tests into `web/src/pickers/`. Nothing about behavior changes — only paths. Inside the moved files, every relative specifier pointing at a module that stays at the root gains a `../`; specifiers pointing at another moved file stay `./`.

- `web/src/QuickOpen.tsx` — imports `./fuzzy-match` and `./rel-path`, both of which stay at the root and become `../`.
- `web/src/useQuickOpen.ts` — imports `./ws` and `./fuzzy-match`, both become `../`.
- `web/src/RouteChooser.tsx` — imports only `react`; nothing to rewrite.
- `web/src/QuickOpen.test.tsx`, `web/src/useQuickOpen.test.ts`, `web/src/RouteChooser.test.tsx` — each imports the module under test (stays `./`) plus, for the first two, a type from `./fuzzy-match` or `./ws` (becomes `../`).

`web/src/fuzzy-match.ts` deliberately stays at the root: the editor's find bar imports it too, so it has a second real consumer and is correctly shared under §2. The pickers feature keeps reaching outward for its match type, which is the right outcome, not a leftover.

Consumers: `web/src/pickers/PickerOverlays.tsx` drops the `../` from its two imports, and `web/src/App.tsx` points at `./pickers/useQuickOpen`. `App.tsx` is app shell, so importing a feature module is allowed under §3.

## Implementation

1. `git mv` `QuickOpen.tsx`, `QuickOpen.test.tsx`, `useQuickOpen.ts`, `useQuickOpen.test.ts`, `RouteChooser.tsx`, and `RouteChooser.test.tsx` from `web/src/` into `web/src/pickers/`.
2. Rewrite the `./fuzzy-match`, `./rel-path`, and `./ws` specifiers inside the moved files to `../fuzzy-match`, `../rel-path`, and `../ws`.
3. Change `PickerOverlays.tsx` to import `./RouteChooser` and `./QuickOpen`.
4. Change `App.tsx` to import `useQuickOpen` from `./pickers/useQuickOpen`.
5. Run `./scripts/run.mjs check-diff` after the moves and again after the import rewrites.

## Tests

No new tests. The three moved suites are the cover and must keep passing from `web/src/pickers/` with no change beyond their own relative imports: `QuickOpen.test.tsx` asserts the rendered result rows, `useQuickOpen.test.ts` the query-and-select flow, and `RouteChooser.test.tsx` the chooser's keyboard picks.

## Out of scope

- Moving `web/src/fuzzy-match.ts` — it has a second consumer in the editor feature and stays shared at the root under §2.
- Changing the props `PickerOverlays.tsx` threads down from `App.tsx` and `AppMain.tsx`, or collapsing the quick-open prop list.
- Any change to the modules' contents beyond their relative import paths.
- Adding an ESLint feature zone — `pickers` is already one.

## Verification

- `./scripts/run.mjs check-diff` passes.
- `grep` across `web/src` shows no remaining `../QuickOpen`, `../RouteChooser`, or root-relative `./useQuickOpen` import.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor; nothing a user can observe changes.
