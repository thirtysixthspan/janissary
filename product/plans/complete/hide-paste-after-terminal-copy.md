# PR 1129 — no Paste option once a terminal copy region is set

Complexity: 3/10

## Goal

Backlog entry: "there should be no paste option in the context menu after the copy region has been set after a mouse drag."

Since `pr-1129-copy-menu-on-drag-complete.md` landed, finishing (or right-clicking) a terminal
Shift+drag opens the default menu with **Copy** for the held terminal selection. But
`defaultMenuGroups` in `web/src/context-menu/default-menu-target.ts` computes the Paste entry from
`pasteTarget` alone — a field the click landed in or that holds focus — with no regard for whether
the click's selection is a terminal copy region. Because a terminal surface itself is never a paste
target and the click's `restoreFocus` can still point at a text field (the field that had focus
before the Shift+drag began), the same menu that offers Copy for the frozen selection can also offer
Paste into that unrelated field, which is not what the drag was for: a copy region should present a
committed, single-purpose action (Copy), not an incidental Paste borrowed from whatever had focus
earlier.

## Approach

`DefaultMenuTarget.selectionSource` already distinguishes a terminal selection from DOM/editor text,
and `defaultMenuGroups` already reads `selectionText` and `pasteTarget` independently. Make Paste's
inclusion also depend on the selection *not* being a terminal copy region: when `selectionSource ===
'terminal'` and `selectionText` is non-empty, omit the Paste entry even if `pasteTarget` resolved to
something. A terminal selection with no text (`selectionText === ''`) still allows Paste when a
target resolved, since that case has no active copy region.

## Implementation steps

1. `web/src/context-menu/default-menu-target.ts`: in `defaultMenuGroups`, destructure
   `selectionSource` from `target` alongside `selectionText` and `pasteTarget`. Change the
   `pasteEntry` condition from `pasteTarget ? [...] : []` to also require that the selection is not
   a non-empty terminal one: `pasteTarget && !(selectionSource === 'terminal' && selectionText)`.
2. Update the file's comment above `defaultMenuGroups` (the "single group" comment) if it needs
   clarifying that Paste is withheld for a live terminal copy region, matching the style of the
   existing comments in that file.

## Tests

- `web/src/context-menu/default-menu-target.test.ts`: add a case that `defaultMenuGroups` omits
  Paste when `selectionSource: 'terminal'` and `selectionText` is non-empty, even with a resolved
  `pasteTarget`; add a case confirming Paste still appears for a terminal target with empty
  `selectionText` (no active copy region) and a resolved `pasteTarget`; confirm the existing DOM/editor
  "offers Copy and Paste... when both apply" case still passes with `selectionSource` left at its
  `'dom'` default.

## Out of scope

The copy overlay's colour/spacing fidelity (a separate, unresolved backlog entry — rated too
architecturally significant to take alongside this one, since it requires capturing the terminal
buffer's per-cell style attributes rather than the two flat colours the overlay uses today). Any
change to how `pasteTarget` itself is resolved, or to Copy's own visibility rules.
