# Keep a live tab's summary when a later reply omits it

**Complexity: 4/10** — one merge in the flush's intent handler, an early return that has to stop being one, and three tests that hold the distinction between "not asked about" and "nothing to say".

The `summarize` intent replaces `state.summaries` wholesale with whatever the reply carried, filtered to the tabs that were live when the flush read them. A flush asks about the tabs that *moved*, so the reply normally names only those — and every other tab's paragraph is discarded. The only thing protecting an untouched tab was that it was usually named anyway; the moment it was not, the rail lost its recap until the next prompt that happened to include it, which may be never.

The same line has the opposite defect in the other direction: a reply with nothing in it returns early, so a paragraph for a tab that has since closed is not pruned either. It is invisible, because the row is gone, but the label is recycled the moment a tab closes, and a stale entry under a recycled label is a paragraph about a dead tab waiting to be shown.

## Goal

A flush keeps every live tab's existing paragraph, overlays the paragraphs this reply actually delivered, and drops the paragraphs of tabs that have closed — whether the reply carried anything or not.

## Approach

1. **`src/plugins/launcher/activate.ts`**'s `summarize` intent stops replacing the map and starts merging into it. Three steps, in this order:
   - keep only the entries whose label is still live, which is the pruning that a closed tab needs and that the old early return skipped;
   - overlay the reply's entries, filtered the same way — a line naming a tab that has closed is dropped rather than misattributed to whatever inherited the name;
   - publish from the result.
2. The old `if (summaries.size === 0) return null;` goes, because the pruning it skipped is now the point. Its other job — not republishing on a flush that had nothing to say — is kept by publishing only when the map actually moved: either a reply delivered a paragraph, or a closed tab took one away. A flush that asked nothing, on a set of tabs that has not changed, still costs no broadcast.

### Rejected alternatives

- Prompting for every live tab on every flush rather than only the moved ones. It is the ACP bill the cursor exists to avoid, and it would make the whole question moot by paying for the answer.
- Letting the client hold the summaries and merge them from the rows it renders. The map is host state keyed on labels only the host can resolve, which is why it rides the payload at all.
- Dropping the early return and republishing unconditionally. An idle rail would broadcast an identical payload on every 30-second tick.

## Implementation steps

1. Replace the wholesale assignment in the `summarize` intent with keep-then-overlay, and gate the publish on the map having moved.
2. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/activate.test.ts`: two tabs summarised, then one of them advances and is flushed on its own — the other tab's paragraph survives.
- A partial reply: both tabs advance, the reply names only one, and the other's paragraph is still there.
- A close with no new transcript activity: a tab closes and the flush is answered with nothing at all, and its paragraph is gone while the survivor's stays.
- The existing cases keep their meaning: a first paragraph publishes, a closed tab's paragraph drops with its row, and a flush that asked nothing publishes nothing.

## Spec updates

- `product/specs/launcher.md`: the summary section says a tab keeps its paragraph until it closes or until a reply replaces it, and that a flush asks only about the tabs that moved.

## Out of scope

- Rejecting a late reply that describes a tab incarnation the flush never read — its own entry.
- Whether the tabs a flush reads are re-read after the prompt returns — its own entry.
