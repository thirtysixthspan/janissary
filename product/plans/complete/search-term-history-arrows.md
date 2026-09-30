# Walk the Search Terms With the Arrow Keys

**Complexity: 3/10** — a five-line pure module, one piece of state in the tab, a history prop, and
the tests that drive the arrows. No server, no payload, no new module beyond the one, no stylesheet.

## Goal

While the search term has focus, the up and down arrows should walk back and forward through the
terms this tab has searched.

`SearchBar` composes the host's command bar with `history: []`, deliberately: *"a search query is not
a command this tab remembers."* That is true today — nothing records a term, and the shared history
walk is handed an empty list, so `ArrowUp` and `ArrowDown` recall nothing and the keys are inert.

The consequence is that the way to get back to a search you have already run is to retype it, and the
way to widen a previous one is to retype it. The bar has the keymap for this already; it is only ever
given nothing to walk.

## Approach

The premise behind the empty list is the thing this item removes: the tab does now remember. So the
history is a piece of the tab's own state, exactly as the query, the three modes, and the two filter
fields are — none of them are server state, and none of them need to be.

**What counts as a term is one pure function.** `recordSearch(history, term)` is a small module with
no React in it, so the two decisions are testable on their own: a blank term is not recorded, and a
term already in the list is not recorded twice — its earlier occurrence is dropped and it becomes the
newest entry. Deduping this way rather than in place is what keeps `ArrowUp` answering with what was
searched most recently, which is what someone pressing it is asking for, and it keeps a user who
walks back and re-runs a term from filling the list with copies of it.

**The term is recorded where the term becomes a search, and nowhere else.** That is the one place the
debounce fires, which is also the only place a *new* term arrives: toggling a mode or editing a
narrowing field reruns the term already in the bar, and recording that again would only shuffle the
list for no reason. A tab opened by `search <phrase>` has already searched that phrase, so its phrase
seeds the list rather than waiting for a keystroke that will never come.

**The shared hook is then given something to walk**, and the ghost comes with it because the ghost is
derived from the same list inside `useCommandBarKeys`. That is the right answer rather than a change:
the bar's comment ruled out history *and* ghost together on the grounds that the tab remembered
neither, and it now remembers the terms. Suppressing the ghost would leave the hook's ArrowRight and
End completing to a suggestion nothing is showing.

The walk's own rules are the host's and are unchanged: `ArrowUp` steps back from the newest entry,
`ArrowDown` returns toward it and then hands back the draft the walk started from, and a query that
has wrapped onto a second line leaves the arrows to the caret.

## Implementation steps

1. **The rule, on its own.** Add `web/src/plugins/search/search-history.ts` exporting
   `recordSearch(entries, term)`: trim, return the list unchanged for a blank term, and otherwise
   return the list without any earlier occurrence of the term plus the term. No React, no cap — the
   list is a handful of short strings, and there is no stated reason for a limit.

2. **The tab keeps the list.** In `web/src/plugins/search/SearchTab.tsx`, hold `history` in state
   seeded from `payload.query` when it is not blank, so a tab opened by `search <phrase>` starts with
   that phrase as its newest entry. The handler the bar calls when its debounce fires records the
   term and then sends the `search` intent, so recording and searching are the one step and cannot
   come apart.

3. **The bar walks it.** In `web/src/plugins/search/SearchBar.tsx`, take `history` as a property and
   hand it to `useCommandBarKeys` in place of the empty list, and pass the hook's `ghost` to the
   shell. The comment that recorded the empty list is replaced by the one that explains why the list
   is now there.

## Tests

- `web/src/plugins/search/search-history.test.ts` (new): the blank term, the first term, a term
  appended after others, a term re-searched moving to the newest position without leaving a copy
  behind, a term differing only in surrounding whitespace recording as the trimmed term, and the
  input list not being mutated.
- `web/src/plugins/search/SearchTab.test.tsx`:
  - `ArrowUp` in the bar recalls the term last searched, and repeated `ArrowUp` steps further back —
    driven through the bar's own keys, which is where the item's promise lives;
  - `ArrowDown` returns toward the newest term and then hands back the draft the walk started from;
  - a term typed and left to settle is recalled, which is the recording rule reaching the bar;
  - a term re-searched appears once, so the walk does not stop on two copies of it;
  - a tab opened by `search <phrase>` starts with that phrase in the list;
  - a tab whose first walk has nothing behind it leaves the term where it is, which is what an empty
    list must do rather than throw;
  - the existing case that the arrows in the bar do not open a match is unchanged, and the existing
    cases that drive the arrows at the *results* are unaffected — the walk belongs to whichever
    element has focus.

## Out of scope

- Where the list lives beyond the tab's lifetime. It is tab state like the query, so closing the tab
  forgets it, exactly as closing the tab forgets the query.
- Resetting the walk when the user edits the term. The host's rule is to reset on submit, and the
  search bar submits on Enter; changing that is a different decision from this one.
- What Enter does in the bar, which is to clear it.
- The ghost's appearance, which follows from the history rather than being chosen here, and the
  transcript search bar's own history, which is a different list for a different line.
