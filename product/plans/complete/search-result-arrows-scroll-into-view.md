# Pin That the Result Arrows Scroll the Selection Into View

**Complexity: 2/10** — the behavior is already provided and needs no change; what is missing is any
test that can see it. The work is a spy in place of a blind stub, and the cases that read it.

## Goal

While the result window has focus, the arrow keys should move the highlighted entry and scroll the
window as far as it must to keep that entry visible.

Both halves already hold, and neither was believed until this item was checked rather than assumed.
`useResultSelection` answers `ArrowDown` and `ArrowUp` from the host's shared `nextListSelection`, and
`useListSelection` runs an effect on every selection change that finds the row carrying that index
and calls `scrollIntoView({ block: 'nearest' })` on it. A probe against the real component confirmed
it: the right row, with `block: 'nearest'`, on mount and on every move; nothing at all when a
streaming batch lands beneath the selection.

What does not exist is a test. `SearchTab.test.tsx` installs
`Element.prototype.scrollIntoView = vi.fn()` in a file-level `beforeEach` — because jsdom implements no
layout, so without a stub the shared selection throws — and then discards it. Every case in the file
exercises the scroll path and none of them can say anything about it. A change to
`useListSelection`, to `useResultSelection`, or to the row markup would take the scroll away and this
suite would stay green, on a promise the spec now makes.

## Approach

Make the existing stub legible, and then assert against it. The stub is the mechanism; the fix is
turning it into something a test can read.

**A spy, not a throwaway.** In `web/src/plugins/search/SearchTab.test.tsx`, install a spy that
records the element it was called on, reset it in the same `beforeEach`, and expose it from the
`renderTab` harness the way the harness already exposes `intent`. Every existing case keeps working
unchanged — a spy still absorbs the call — and the cases below can now ask which row was scrolled.

**Assert on the row, not the count.** The row is the thing that carries a position in the window, so
the assertions name the row whose `data-index` was scrolled rather than counting calls: `ArrowDown`
scrolls row 1, `ArrowDown` again row 2, `End` the last, `Home` the first, and `Return` on a
selection already in view scrolls nothing new.

**Assert the negative, which is the part most likely to regress.** A batch of streaming rows must
neither move the highlight nor scroll the window. That is the guarantee the previous item's
bottom-anchored window depends on — a scroll fired by an arriving row would yank the window away from
the first match, which is the thing sitting at the bottom edge.

**Assert it survives the reversal.** The window is a `column-reverse` column, so row 0 is the entry at
the bottom edge. A test that walks the selection to the end and back has to keep saying "row 0" and
not "the first row on screen", because the two are no longer the same row.

## Implementation steps

1. **The spy.** In `web/src/plugins/search/SearchTab.test.tsx`, replace the file-level
   `Element.prototype.scrollIntoView = vi.fn()` with a spy that records the element it was called on
   and the options it was given, reset per test, and return it from `renderTab` as `scrolled`. The
   comment stays accurate — jsdom lays nothing out, so the call has to be absorbed — and now says why
   it is a spy rather than a stub.

2. **The cases.** Add to the same file: the initial selection being scrolled into view when the tab
   opens on a result; each arrow scroll being the row it moved to and nothing else; `Home` and `End`
   scrolling to the first and last row; a streaming batch scrolling nothing and leaving the highlight
   where it was; and a `Return` opening the selected row without scrolling, since it is already the
   one in view.

## No source change

Nothing under `src/` or `web/src/` outside the test file changes. The behavior this item describes is
`useListSelection`'s, it is correct, and re-implementing it in the search plugin would put a second
copy of a rule the plugin API exists to share.

## Tests

The tests are the change. The existing thirty-six cases are unchanged and remain the ones that say
what the rows, the states, the toggles, the fields, and the history do; the cases above are the ones
that will now say what the arrows do to the window.

## Out of scope

- The scroll rule itself, and `block: 'nearest'` in particular. A row taller than the window aligns its
  top edge under `nearest`, so a long match can sit below the fold; changing the block is a change to
  the shared hook every plugin list uses, and not one this item asks for.
- Scrolling ancestors other than the window. `scrollIntoView` walks them all, and a plugin tab has no
  scrollable ancestor of its own to walk into.
- The direction the arrows move the highlight. It follows the order the scan produced, which is what
  the shared selection rule does and what `Home` and `End` are defined against; the window renders
  that order upward, and inverting the arrows would make this the one plugin list whose arrows do not
  mean what they mean everywhere else.
- `Return` opening the selected row, which is a separate promise with a test of its own.
