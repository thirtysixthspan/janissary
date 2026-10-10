# Toggle focus between the launcher lists

**Complexity: 2/10** — the launcher already owns refs for both list containers and handles each list's keyboard events locally. The change is limited to routing Tab and Shift+Tab between those containers and covering both directions.

## Goal

Pressing Tab or Shift+Tab while either launcher list has focus moves focus to the other list, keeping keyboard users within the two primary launcher areas.

## Approach

Handle Tab on each list container, prevent the browser's default tab order, and focus the other list through a callback supplied by `LauncherTab`. Tab and Shift+Tab use the same destination because both keys toggle between the two lists.

## Implementation steps

1. Add a focus-toggle callback to `LauncherCommandList` and `LauncherTabList`; on Tab, prevent the default and focus the other list.
2. Wire the callbacks in `LauncherTab` using its existing refs.
3. Add tests showing Tab and Shift+Tab move focus between the command and tab lists in both directions.
4. Update the launcher behavior spec to describe the keyboard toggle.

## Tests

Extend `web/src/plugins/launcher/LauncherTab.test.tsx` with the four key transitions and assert the destination list container is `document.activeElement`.

## Out of scope

- Changing arrow-key selection, Enter behavior, or click behavior within either list.
- Changing normal focus traversal outside the launcher lists.
