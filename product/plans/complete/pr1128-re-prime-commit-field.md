# PR 1128: re-prime the commit-message field when it is re-targeted while open

Complexity: 3/10

## Goal

When the commit-message field is already open and the user re-targets the commit — choosing
`Commit to origin` on a row, then clicking back to the tree, then clicking the header's commit
button — the field still shows the earlier invocation's pre-filled text while the paths that will
travel with the commit are the new target's. `FileNavigatorCommitPopup` seeds its input from
`defaultMessage` through `useState`, which reads the prop only on mount, and the popup element
stays mounted at the same position across a re-target. The field must re-prime with the new
default.

The chosen resolution is the proposal's first option: **a re-target is a new field**. React
remounts the popup, re-seeding it from the new default. A half-typed sentence is discarded on a
re-target; the alternative — refusing `request` while one is open — would trade a wrong message
for a lost one, and the re-target case is one the user chose deliberately.

Also fixed while in the same area: opening the Search-files pop-up over an open commit field drew
the two cards on top of each other (they share one `top`/`right`/`z-index` rule in `theme.css`).
The commit field now closes when the search pop-up opens.

## Approach

1. **`web/src/file-navigator/useFileNavigatorCommit.ts`** — give `PendingCommit` an `id: number`,
   a monotonically increasing value set by `request` (an id rather than the paths, since two
   requests can legitimately name the same paths).
2. **`web/src/file-navigator/FileNavigatorOverlays.tsx`** — pass
   `key={commit.pendingCommit.id}` on the `FileNavigatorCommitPopup` element so React remounts the
   field and re-seeds it from the new default.
3. **`web/src/file-navigator/FileNavigatorTab.tsx`** — the header's Search-files handler closes
   any pending commit first, so the two single-input cards never stack.
4. **`product/specs/file-navigator-tab.md`** — the "Committing to origin" section gains the
   re-target rule and the search-closes-commit rule; it is silent on both today.
5. **Tests** noted below; `FileNavigatorCommitPopup.test.tsx`'s 'keeps its text and sends nothing
   when it loses focus' case is the behavior that must not move and must pass untouched.

## Out of scope

- The popup's no-blur-dismiss behavior — untouched.
- Any change to `manager-commit.ts`, the reports, or the button flash.
- Offsetting the two pop-up cards rather than closing one.

## Tests

- `FileNavigatorOverlays.test.tsx`: rerendering with a new pending commit shows the new default
  rather than the old text.
- `FileNavigatorTab.test.tsx`: a row-menu commit followed by a header commit click shows the
  whole-tree default; opening the search field closes a pending commit field.
