# Walk the rendered rows, not the payload's own order

**Complexity: 5/10** — one flattened ordering, one composed ref, and five interaction tests over a list whose order the payload does not decide.

The tab list renders its rows in tier order — `launcherTiers` in `web/src/plugins/launcher/tiers.ts` regroups by what needs attention, so a badged tab can be drawn above the tab the payload named first. Every index the list uses is an index into the *payload*: `useListSelection(rows.length)` counts payload rows, `LauncherTier` passes `rows.indexOf(row)` as a row's index, and the `Enter` handler reads `rows[selection.selected]`. So with the drawn order differing from the payload's, the highlight sits on the wrong row and Enter acts on a row the highlight is not on. Arrow keys jump through the list visibly out of order.

The second half is quieter. Both launcher lists attach the *caller's* ref to the list element, and `useListSelection` hands back a `listRef` of its own that nothing attaches. `rowClicked` calls `listRef.current?.focus()` and a `useEffect` calls `listRef.current?.querySelector(...)?.scrollIntoView(...)`, so with the hook's ref null neither the post-click focus nor the scroll-into-view ever happened — the highlight was the only half of the two that worked, and a selection moved into a scrolled-away part of a long list was simply invisible.

## Goal

The keyboard walks the rows in the order they are drawn, the highlight and Enter agree, and the shared selection hook can reach the mounted list so it focuses and scrolls it.

## Approach

1. **`web/src/plugins/launcher/TabList.tsx`** flattens the tiers into `displayed` — the exact order the rows are rendered in — and uses it for the selection's length, for each row's index, and for what Enter acts on. The tier component takes `displayed` instead of the payload's rows, so a row's index is its position on screen and nothing else.
2. **`web/src/plugins/launcher/list-ref.ts`** (new) composes two refs onto one node. The tab keeps its ref so it can move focus to a list when the docked view receives it; the selection hook keeps its own so it can scroll the highlighted row into view and focus the list after a click. Both launcher lists attach the composition, so both owners see the same element.
3. `CommandRail` takes the same composition. Its rows are not regrouped, so its indices were already right — but its focus and scroll were not.

### Rejected alternatives

- Numbering the rows by payload index and reordering the payload to tier order. The host publishes in strip order deliberately, so a row keeps its place within a tier; reordering it client-side would make the rail's rows jump under the `tabs` topic's republishes.
- Letting each list keep its own focus and scroll code. That is a second implementation of what the shared hook already does, and the reason neither worked here.
- Storing the selection as a row rather than an index. The hook is shared with the sessions, conversations, and search lists, and an index is what it was written against.

## Implementation steps

1. Add `useComposedListRef`.
2. Flatten the tiers in `TabList.tsx` and index everything off the flattened order.
3. Attach the composition in both lists.
4. Add the client tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: with a payload whose order differs from the tier order, the row drawn first carries index 0 and the highlight, and its label is the tier's first row rather than the payload's first row.
- ArrowDown then Enter focuses the row the highlight moved to.
- A click highlights and hands focus to the list, and the following ArrowDown steps from the clicked row rather than from the top.
- A keyboard selection landing on a row scrolls that row into view — which it can only do through the composed ref, so the test fails without it.

## Spec updates

- `product/specs/launcher.md`: keyboard navigation walks the drawn order, and a click hands the keyboard to the list.

## Out of scope

- The command rail's two-click confirmation and the tab list's own, which is a separate recorded entry about making tab focusing single-click.
- The other plugin lists sharing `useListSelection`. They attach the hook's own ref and were never given an external one.
