# Put the Search Modifiers on the Command Line and the Filters in the Metadata Bar

**Complexity: 3/10** — two chunks of markup move, one optional slot is added to the host's command
bar, and a stylesheet follows. No payload, no server, no new module.

## Goal

The three query modifiers belong on the command line, right-aligned, and the two narrowing fields
belong in the metadata bar above it.

`.*`, `Aa`, and `W` change how the *query* is read, and the query is typed on the command line; they
are sitting in the header today, so the control that governs what the command line means is a row
away from the command line. Conversely, **Files to include** and **Files to exclude** do not touch
the query at all — they narrow which files the query runs against — so they belong in the metadata
bar, where a tab's settings already live.

The metadata bar keeps the tab's actions, which are already right-aligned there, so after the move
the bar is settings on the left and actions on the right, and the command line is the query on the
left and its modifiers on the right.

## Approach

The command bar is the host's `CommandBarShell`, published on the plugin client API precisely so a
plugin renders the same bar the agent tab does. It already carries two slots — `above` for a row
over the line and `label` for text before the prompt glyph — and both were added for a caller that
needed them. This needs a third: content at the end of the line, which the shell floats right so the
plugin does not have to know how the line is laid out.

The slot is optional and no existing caller passes it, so the agent tab and the conversation
composer are unchanged by it.

## Implementation steps

1. **A trailing slot on the command bar.** In
   `web/src/shared/command-bar/CommandBarShell.tsx`, add an optional `trailing?: ReactNode` to
   `CommandBarShellProperties` and render it inside `.command` after `.input-wrap`. In
   `web/src/theme.css`, give `.command-trailing` `margin-left: auto` and `flex-shrink: 0`, the same
   two declarations `.plugin-actions` uses for the same job of pinning a control to the right of a
   flex line that fills. The shell stays presentational — it renders the slot and no more, so the
   search plugin still owns what a modifier looks like and what it does.

2. **The bar carries the modifiers.** In `web/src/plugins/search/SearchBar.tsx`, take a
   `trailing: ReactNode` property and pass it to the shell. The bar holds no notion of what that is.

3. **The tab relocates both.** In `web/src/plugins/search/SearchTab.tsx`, the `TOGGLES` map moves out
   of `.plugin-meta` and into the `trailing` slot the bar renders, and the two filter inputs move
   from their own `.search-filters` row into `.plugin-meta` alongside `splitAction`. The state, the
   handlers, and the intents each one sends are untouched — only where they are drawn changes, and
   nothing about what a click emits.

4. **The stylesheet follows.** In `web/src/plugins/search/search.css`, `.search-filters` becomes a
   metadata-bar child that shares the line with `.plugin-actions`, and `.search-toggles` becomes
   command-line chrome sitting flush with the caret's line box rather than a 12px row of its own.

## Tests

- `web/src/shared/command-bar/CommandBarShell.test.tsx`: add a case that the `trailing` slot renders
  inside the command line, after the input, and a case that a shell given no slot renders none — the
  second is what keeps the other two callers byte-identical.
- `web/src/plugins/search/search-style.test.ts`: pin the new placement — the toggles styled as command
  line chrome, the filters as a metadata-bar child — alongside the context rules already there.
- `web/src/plugins/search/SearchTab.test.tsx`: add a case placing each control relative to the frame
  it now lives in, asserting the three toggles are inside the command line and that the two filter
  fields are inside the metadata bar which still holds the split action. The existing toggle, filter,
  and intent cases are unchanged: they find the controls by accessible name and assert on the
  `search` intent, neither of which moved.

## Out of scope

- The modifiers' behavior. Each still toggles one mode and reruns the search with the same intent.
- The filters' behavior, including the glob syntax they accept — the next item in the backlog.
- The command bar's position and prompt text, which the item after this one moves.
- Every other `CommandBarShell` caller. The agent tab's command line and the conversation composer
  render exactly what they rendered before.
