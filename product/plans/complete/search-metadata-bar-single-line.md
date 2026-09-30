# Keep the Search Tab's Metadata Bar on One Line

**Complexity: 1/10** — one missing stylesheet import in the plugin's client entry, and one test that pins it. No markup or rule changes.

## Goal

The search tab's metadata bar should be one line: the two narrowing fields on the left and the split icon floated to the right edge. Today the split icon drops onto a second line of its own, at the left edge, below the fields.

## Cause

The layout the bar depends on is the shared plugin frame in `web/src/plugins/shared.css`: `.plugin-tab` makes the tab a padded flex column, `.plugin-meta` makes the bar a flex row, and `.plugin-actions` pushes the action group to the right with `margin-left: auto`. Every other plugin that renders that frame loads the sheet from its lazy entry (`import '../shared.css'` in `audio`, `conversations`, `image`, `markdown`, `pdf`, `sessions`, and `video`). The search entry, `web/src/plugins/search/index.tsx`, imports only `./search.css`.

So when the search tab is the first plugin opened in a session, none of those rules exist. `.plugin-meta` is an ordinary block, the filters' flex `div` fills the first line, and the split button's inline `span` wraps below it at the left edge. Rendering the bar in a real browser confirmed it: with the three stylesheets present the bar is one 22px line at 360px, 700px, and 1280px wide, with the split button at the right edge; without `shared.css` the bar is 41px tall and the button sits on the second line at x = 0. It only looks right when some other plugin happened to load the sheet first.

## Approach

Import `../shared.css` from the search entry, the way every other plugin entry already does. The existing rules then do exactly what the entry asks for: `.search-filters` is `flex: 1; min-width: 0`, so the fields take the room beside the actions and shrink rather than wrap, and `.plugin-actions` floats the split icon to the right.

No new rule is needed. Adding one to `search.css` would restate the shared frame rather than load it, and would leave the tab's padding and column layout still missing.

## Implementation steps

1. **The entry.** In `web/src/plugins/search/index.tsx`, add `import '../shared.css';` above `import './search.css';`, matching the order the other plugin entries use so the plugin's own rules come after the shared frame.

## Tests

In `web/src/plugins/search/search-style.test.ts`, following `web/src/plugins/sessions/sessions-style.test.ts`:

- The entry, read raw, imports `../shared.css`, and imports it before `./search.css`.
- The shared sheet lays `.plugin-meta` out as a flex row and gives `.plugin-actions` `margin-left: auto`, the two rules that put the fields and the split icon on one line.

## Spec

`product/specs/search-tab.md`: state that the narrowing fields share one line with the tab's split control, which sits at the right-hand end.

## Out of scope

- Any change to the shared plugin frame itself.
- The remaining entries in the pull request's backlog, including the scrollable result frame, which is its own entry.
