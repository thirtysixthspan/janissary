# Fix: give every diff tab file entry a disclosure chevron

**Complexity: 4/10** — one piece of state per entry, a chevron in the header, its stylesheet rule, and the rendering tests. No wire, server, or parser change.

## Goal

Every file entry's header carries a disclosure chevron: clicking it collapses that entry to its header and
clicking it again restores exactly what was there, one entry at a time, with the chevron turning to show
which state the entry is in. An entry that starts collapsed — a whole-file change, or one over the line
cap — opens with the same chevron, so the header's reason note and the control agree.

## Approach

The header already collapses for two automatic reasons, and `FileEntry` already holds the state that
answers them. The chevron needs one state that holds three answers: the automatic one, the user's own,
and nothing yet — which is a tri-state, because a collapse the user made must survive the refresh that
adds the reason a whole-file would have collapsed for anyway.

1. **One state, three answers.** `collapsed` is the automatic reason — whole-file or over the cap —
   unless the user has flipped it, in which case the user's answer stands. The double-click and the
   chevron flip the same value, so the two controls never disagree about an entry.
2. **The chevron.** A `.diff-chevron` button at the start of the header carries the application's own
   `collapsedIcon` and `expandedIcon` carets — the same pair the file navigator's rows and the pickers
   use — in the muted small size those use, turned by the state rather than by a transform of its own.
3. **The button answers the button.** The chevron clicks collapse the entry and never open the file,
   which is the name button's own answer.

## Implementation steps

1. Give `web/src/plugins/diff/FileEntry.tsx` the flipped-state model and the chevron button, importing the icons from `@shared/icons`.
2. Add the `.diff-chevron` rule to `web/src/plugins/diff/diff.css`.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Extend `web/src/plugins/diff/DiffTab.test.tsx` with the cases below.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Update `product/specs/diff-tab.md` with the chevron and what it does.
7. Check `help.md` and `documentation/user-documentation/` for an entry-layout claim, and update it only if present.

## Tests

- Every file entry's header carries the chevron.
- Clicking the chevron collapses an ordinary entry's hunks, and clicking it again restores them.
- Clicking one entry's chevron leaves another entry's rows rendered.
- The chevron opens an entry that starts collapsed, and the double-click still expands the same entry.

## Out of scope

- A chevron that collapses an entry's single hunk, which is not an entry-level control.
- The keyboard walk, which crosses collapsed entries and keeps counting their hunks.
- The reason notes, which the collapsed header already carries.
