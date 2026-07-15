# Tab alias shown in the tab picker

**Complexity: 2/10** — one display-string swap plus matching the same alias in the filter predicate, confined to a single component and its test file.

## Goal

The `Ctrl+G` / `nav` tab picker (`TabNavPicker`) currently renders and filters by `tab.label` only. When a tab has been renamed (`rename <alias>`), the tab strip (`TabItem`) shows the alias (`tab.title ?? tab.label`) but the nav picker still shows the raw internal label, so a renamed tab looks unlabeled/wrong in the picker and typing the alias does not find it. The picker should show and match the alias the same way the tab strip already does.

## Approach

Mirror the `tab.title ?? tab.label` pattern already used in `web/src/TabItem.tsx:68` inside `web/src/TabNavPicker.tsx`:

- Compute a display label once per entry (`tab.title ?? tab.label`) and use it for both the filter match and the rendered/highlighted text.
- Extend `filterTabs`'s substring match to also check `tab.title` (when present), so typing the alias finds the tab.
- Keep the existing number-match and label-based sort exactly as is — sort by the same display label so a renamed tab sorts by its alias, matching what the user sees in the strip.

## Implementation steps

1. In `web/src/TabNavPicker.tsx`, add a small `displayLabel(tab: TabView): string` helper returning `tab.title ?? tab.label`.
2. Update `filterTabs`'s match predicate to include `tab.title` (case-insensitive substring), not just `tab.label`.
3. Update the `byLabel` sort comparator to sort by `displayLabel(...)` instead of `tab.label`.
4. Update `highlightLabel` call site in the render function to pass `displayLabel(tab)` instead of `tab.label`.

## Tests

Add to `web/src/TabNavPicker.test.tsx`:

- `filterTabs` matches by substring on `title` when the tab has been renamed (alias differs from label).
- `filterTabs` still matches by `label` when the tab has no `title`.
- `TabNavPicker` renders the alias (`title`), not the raw `label`, for a renamed tab.
- `TabNavPicker` highlights the matched substring within the alias when filtering by alias text.

## Out of scope

- Any change to `TabItem.tsx` or the tab strip — already correct.
- Any change to how `rename` sets `title` server-side — already correct.
- Filtering/matching by `tab.number` — unchanged, already covered by existing tests.

## Verification

- `./scripts/run.mjs check-diff` after implementation and after tests.
- Manual verification not possible in this environment (no running app); covered by the added unit tests.
