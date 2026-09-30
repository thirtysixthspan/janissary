# Let Tab Alternate Between the Search Term and the Results

**Complexity: 3/10** — one ref moves up to the tab that owns both focusable elements, two key
handlers are added, and three tests. No server, no payload, no new module, no stylesheet.

## Goal

Pressing Tab in the search tab should move the focus from the search term to the results, and Tab
again should move it back.

Today the two elements are focusable and neither can be reached from the other by the keyboard. The
result window is a `tabIndex={0}` div and the bar is a textarea, so both are tab stops — but
`ResultTable`'s rows are `tabIndex={-1}`, so the whole window is one stop, and nothing steps to it
from the bar. Tab in the bar leaves the plugin tab, and Shift+Tab out of the window reaches the
narrowing fields rather than the term.

The user has to reach for the mouse to look at what they just searched for.

## Approach

The two elements are the tab's only focusable children, so the tab is the right place to know how to
step between them — and it already owns the key handler for the window.

**The ref moves up.** `SearchBar` creates its own `inputRef` today, so nothing outside it can reach
the textarea. Lifting the ref into `SearchTab` and passing it down gives the tab both ends of the
hop. This is the same arrangement the agent tab uses: `inputRef` is created at the top and threaded
to the command bar rather than created inside it.

**Tab is taken, Shift+Tab is not.** Both directions are handled explicitly, and only on the bare key:

- Tab in the bar steps to the results, and Tab in the results steps back to the bar. The bar is the
  tab's last focusable child and the window the one before it, so plain Tab in the bar would
  otherwise leave the plugin tab entirely — that is the gap.
- Shift+Tab is left alone, in both directions. It is what a user presses to leave, and it must
  continue to walk backwards out of the tab — from the bar to the window, from the window to the
  narrowing fields, and from there out of the tab — rather than being folded into a two-element loop.
  Trapping a non-modal region is a different decision, and not one this makes.

The results' handler checks Tab *before* the arrow/Home/End keys, and neither list answers to Tab,
so the order is a readability choice; the bar's handler checks it before delegating to
`useCommandBarKeys`, whose guard would otherwise hand Tab back to the browser for default traversal.

## Implementation steps

1. **The ref belongs to the tab.** In `web/src/plugins/search/SearchBar.tsx`, take `inputRef` as a
   property instead of creating it, and thread it into `useCommandBarKeys`, the shell, and the
   focus-on-active effect exactly as before. In `web/src/plugins/search/SearchTab.tsx`, create the
   ref and pass it down beside the list ref `useResultSelection` already hands back — the tab then
   holds both focusable elements by name.

2. **Step out of the bar.** In `SearchBar`, take an `onFocusResults` property and compose its own key
   handler: a bare Tab is taken and handed to that callback, and every other key goes to
   `useCommandBarKeys` unchanged. The bar still owns nothing about the results beyond the one hop.

3. **Step out of the results.** In `SearchTab`, the window's key handler takes a bare Tab and focuses
   the bar's textarea, before the selection keys are asked. `useResultSelection` and the `Return`
   open are untouched.

## Tests

`web/src/plugins/search/SearchTab.test.tsx`:

- Tab in the bar moves the focus to the results window, and the default traversal is prevented so it
  does not also leave the tab.
- Tab in the results moves the focus back to the bar.
- Shift+Tab in the bar and in the results is left to the browser, so neither handler claims it —
  asserted by driving the shifted key at each and finding the focus where it started.
- A case asserting the result window is a focusable stop and precedes the bar in the tab's DOM, which
  is the ordering the two handlers agree with and the reason a change to the tab's children would
  need this work again.
- The existing cases that drive the arrow keys at the bar and at the results, and the ones that open
  a match on `Return` and on a click, are unchanged: none of them presses Tab.

## Out of scope

- Focus on the filter fields, which are ordinary inputs in document order and are left to the
  browser's traversal in both directions.
- Focus leaving the plugin tab. Shift+Tab keeps walking out of it, and no key is added for leaving
  forwards.
- Entry seven of this backlog, which is about the arrows scrolling the window rather than about how
  focus reaches it.
- Everything about what either element does once it has focus. The window's selection and the bar's
  caret and history are exactly as they were.
