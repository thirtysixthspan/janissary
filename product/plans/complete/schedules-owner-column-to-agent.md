# Rename the Schedules tab "Owner" column to "Agent"

**Complexity: 2/10** — a pure label rename touching two heading strings, one existing test assertion, and one spec sentence. No data model, wire protocol, or CSS class changes required (the CSS class name `schedules-owner` is an internal identifier, not user-visible text, so it stays as-is).

## Goal

The Schedules tab (`web/src/SchedulesTab.tsx`) currently labels the column showing the owning tab's name as "Owner" in both the full and compact table headings. Rename this column header to "Agent" to better reflect that the value shown is the tab (agent) that owns the scheduled command.

## Approach

Change only the visible heading text in `FullHeadings` and `CompactHeadings`. Leave the underlying data field (`entry.tab`), the CSS class (`schedules-owner`), the `focusOwner` helper name, and all other internals untouched — those are implementation details, not the user-visible label the issue refers to.

## Implementation steps

1. In `web/src/SchedulesTab.tsx`, `FullHeadings` (~line 138): change `<span>Owner</span>` to `<span>Agent</span>`.
2. In `web/src/SchedulesTab.tsx`, `CompactHeadings` (~line 153): change `<span>Owner</span>` to `<span>Agent</span>`.

## Tests

- Update `web/src/SchedulesTab.test.tsx:42` — the existing assertion `expect(container.querySelector('.schedules-headings')?.textContent).toContain('Owner')` must change to assert `'Agent'` instead (the heading text changed; this is an existing test being updated to match new behavior, not a new test case since the column-heading behavior itself is already covered).

## Spec updates

- `product/specs/scheduling.md:41` — update the column list from `` `#`, `Owner`, `Id`, `Next`, `Spec`, `Command` `` / `` `#`, `Next`, `Id`, `Owner` `` to use `Agent` in place of `Owner` in both orderings.

## Docs

- Checked `help.md` and `documentation/user-documentation/` for any mention of the "Owner" column — none found referencing this specific column heading. No documentation update needed.

## Out of scope

- Renaming the `schedules-owner` CSS class or the `focusOwner` function — internal identifiers, not user-visible, and renaming them would expand the diff beyond the label fix.
- Renaming `entry.tab` or any wire-protocol field — the underlying data model is unaffected; only the displayed heading text changes.
