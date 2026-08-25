# Move the tab-nav matching rules into a pure module

**Complexity: 3/10** — a twenty-line ranking function, its one-line helper, and a type alias move out of a component file into a new pure module; four production files and two tests repoint imports, and the nine existing `filterTabs` cases move to a colocated test that needs no DOM. No behavior changes.

## Goal

`filterTabs` at `web/src/TabNavPicker.tsx:18-37` is the tab navigator's whole ranking algorithm: it filters out docked and reporting tabs, substring-matches label and alias case-insensitively, prefix-matches the tab number, then partitions number matches from label matches and sorts each group by display label. It is declared inside the picker component, alongside `displayLabel` (`:11`) and the `TabNavEntry` alias (`:7`).

Three modules beneath the component import back up into it: `web/src/useTabNav.ts:4` imports `filterTabs` and memoizes it at `:12`, and `web/src/useWindowKeys.ts:9` and `web/src/keyboard-handlers.ts:2` import the `TabNavEntry` type from the same component file. A hook importing a component is §8 of [`react-code-organization.md`](../../../ai/guidelines/react-code-organization.md) — imports flow downward only — and keeping the ranking rules in the component that draws them is §5, components render, they do not decide.

The concrete cost is that the rules cannot be exercised without React and FontAwesome in the module graph: `TabNavPicker.test.tsx` pulls in `@testing-library/react` to test nine cases of a pure function over an array. `keyboard-handlers.ts` is a plain module of key handlers, yet its type dependency reaches into a `.tsx` file that renders `<mark>` elements.

Leave the matching rules in a module that any of the four consumers can import downward.

## Approach

Create `web/src/tab-nav-match.ts` — a pure module in the sense of §8's first row, exercised by plain function calls. It takes the three declarations verbatim with the comments already on them:

- `export type TabNavEntry = TabEntry`, from `TabNavPicker.tsx:7`.
- `displayLabel(tab)`, from `:11`, which must now be **exported** — the component still calls it at `:73` to render each row's highlighted label, so it is no longer file-private.
- `export function filterTabs(tabs, query)`, from `:18`.

The three belong together: `displayLabel` is both the sort key inside `filterTabs` and the string the picker highlights, so the module owns one definition of "what this tab is called" that the ranking and the rendering agree on. Its imports are `type { TabView }` from `@shared/protocol` and `isReportingTab`/`type { TabEntry }` from `./tab-entries` — the module that landed in the preceding backlog entry — so the new module sits at the same pure layer and imports only sideways within it.

`TabNavPicker.tsx` keeps the component and `highlightLabel`, the JSX-returning helper that has no business outside the file that renders it. It imports `filterTabs` and `displayLabel` from the new module, and drops its `./tab-entries` and `./icons`-adjacent matching concerns entirely. Nothing is re-exported from the old home — §2 says move the file, don't leave a copy behind or re-export it — so `useTabNav.ts`, `useWindowKeys.ts`, and `keyboard-handlers.ts` each import from `./tab-nav-match` directly.

The picker keeps its current `tabs`/`query` props and keeps calling `filterTabs` in its render body. Passing `navTabs` down from `useTabNav` instead of re-filtering is the follow-on the backlog entry itself names as separate: it changes the component's public props and therefore both of its call sites (`PickerOverlays.tsx:93` and `HarnessTabLayer.tsx:73`) plus the `PickerOverlayProps` contract, which is a different change with a different blast radius. This entry moves the rules; it does not rewire who computes them.

## Implementation steps

1. Create `web/src/tab-nav-match.ts` with `type { TabView }` from `@shared/protocol` and `isReportingTab`, `type { TabEntry }` from `./tab-entries`. Move `TabNavEntry`, `displayLabel` (now exported), and `filterTabs` into it with their existing comments.
2. `web/src/TabNavPicker.tsx` — delete the three moved declarations and the now-unused `isReportingTab`/`TabEntry` import; import `{ filterTabs, displayLabel }` from `./tab-nav-match`. Keep `highlightLabel`, the component, and the `TabView`/`statusDotIcon` imports the markup still needs.
3. `web/src/useTabNav.ts` — import `filterTabs` from `./tab-nav-match`.
4. `web/src/useWindowKeys.ts` and `web/src/keyboard-handlers.ts` — import `type { TabNavEntry }` from `./tab-nav-match`.
5. `web/src/keyboard-handlers.test.ts` — repoint its `type { TabNavEntry }` import the same way.
6. `web/src/TabNavPicker.test.tsx` — drop `filterTabs` from its `./TabNavPicker` import and delete the `describe('filterTabs')` block, which moves to the new module's colocated test. Keep the `makeTab` factory: the remaining `TabNavPicker` render cases still use it.

Relative imports in `web/src/` stay extensionless.

## Tests

`web/src/tab-nav-match.test.ts` (new) — the nine `filterTabs` cases currently in `TabNavPicker.test.tsx:16-69`, moved unchanged along with a copy of the `makeTab` factory they need, plus two cases the move makes worth pinning on the newly-exported helper:

- All nine existing cases: empty query returns every tab in order; docked and reporting tabs are excluded while full-list indices are preserved; case-insensitive label substring; tab-number prefix; number matches sorted ahead of label-only matches; alphabetical within each group; non-matching tabs excluded; alias (title) substring matching; label matching when there is no alias.
- `displayLabel` returns the alias when the tab has been renamed, and the internal label when it has not — the behavior both the ranking sort and the picker's highlight now depend on from one place.

The file imports only `vitest`, the shared protocol type, and `./tab-nav-match`, which is the point of the move — the ranking rules are now testable without React or a DOM.

`web/src/TabNavPicker.test.tsx` keeps its five render cases unchanged. They exercise the component through the same `filterTabs` path as before, now via the import.

## Out of scope

- Passing `navTabs` down from `useTabNav` to `TabNavPicker` instead of re-filtering in the render body. The backlog entry names it as the natural follow-on; it changes the component's props and both of its call sites.
- `highlightLabel`, which stays in `TabNavPicker.tsx` — it returns JSX and has one caller in that file.
- The `QuickOpen` picker, which models itself on `TabNavPicker` but has its own separate ranking in `fuzzy-match.ts`.
- Any change to how the Ctrl+G overlay is opened, keyed, or dismissed.

## Documentation

None. `filterTabs` and the tab navigator's matching order are unchanged, so what `product/specs/tab-navigator.md`, `help.md`, and `documentation/user-documentation/` already describe stays accurate.
