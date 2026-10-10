# Show a row's label beside its alias in the hover card

**Complexity: 2/10** — one line that picks one of two strings, one line beside it for the other, and a test that already exercises the card.

`LauncherHoverCard` in `web/src/plugins/launcher/LauncherTabRowView.tsx` draws `{row.title ?? row.label}` as the card's first line. The row itself shows the title, so the card's job is to carry what the row has no width for — and `product/specs/launcher.md` promises "the tab's name, **its label when they differ**, its working directory". With an alias present the label is absent, because the same expression that picks the row's display name picks the card's. A user cannot tell from the card what to type into a command that addresses tabs by label — `focus <label>`, `close <label>` — for a tab they have renamed.

## Goal

The hover card shows a tab's alias and, when they differ, its label — the one thing the row's own width cannot carry.

## Approach

1. **`LauncherTabRowView.tsx`** draws the label as a second line whenever the row has a title and the two differ. It is not drawn when they are the same, because then it would be a line repeating the one above it.
2. **`launcher.css`** styles it as secondary text, which is what it is: the same fact as the name, in the form a command takes.

### Rejected alternatives

- Swapping the card to show the label instead of the title. The title is what the row shows and what the user named it; dropping it from the card loses the recognisable half.
- Showing the label always, even when it matches the title. It would be a line repeating the one above it on every unaliased tab, which is most of them.

## Implementation steps

1. Draw the second line in `LauncherHoverCard`.
2. Add its rule to `launcher.css`.
3. Extend the aliased-tab hover test and run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/launcher/LauncherTab.test.tsx`: the aliased-tab hover card carries both `Release agent` and `agent`, and a tab with no alias carries its label once rather than twice.

## Spec updates

- None needed. `product/specs/launcher.md` already promises "its label when they differ"; this is the card meeting it.

## Out of scope

- Showing a row's instance key, dot colour, or tier. The card is what the row has no width for, and those are either on the row already or are the host's business.
- Command-addressability of any other field.
