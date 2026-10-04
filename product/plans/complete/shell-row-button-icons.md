# Give the shell tab's own row buttons a glyph

**Complexity: 2/10** — publish two icon objects a plugin cannot otherwise reach, and use them.

**Goal.** Make the shell row's file navigator and new-agent buttons pressable. They were present in the DOM and carried no glyph at all, which collapsed each to its own padding: 8 pixels wide, zero high, so a click waited forever for an element that could never become visible.

**Approach.** Publish the host's own icon objects rather than descriptors. `FontAwesomeIcon` given `{ prefix, iconName }` has to resolve the name against a library a plugin cannot add to, and an unregistered name renders nothing — which is worse than an obviously broken button, because the element still exists. The host imports real icon objects from `@fortawesome/free-solid-svg-icons`, which carry their own path data and render anywhere.

The existing comment claimed this was already handled — "spelled out because a plugin may not import the host's icon module" — and it was handled for the workspace flag alone. The two row buttons were simply never given icons to use, and the name was wrong besides: the host's glyph is `faFolder`, not `folder-open`.

## Implementation

1. Publish `openFilesIcon` and `newTabIcon` from `web/src/plugins/api.ts` beside the icons already there, and say in the comment why they are objects rather than descriptors.
2. Use them in `web/src/plugins/shell/ShellTabMeta.tsx` and delete the hand-written descriptors.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`: each of the row's own buttons contains an `svg`. jsdom reproduces the failure exactly — with the descriptor restored, the button has no child element — so this pins the cause rather than the symptom.

## Out of scope

- The status-window and split buttons, which are host components and already render glyphs.
- Any change to the icons themselves. A plugin drawing its own glyph is the drift the published surface exists to prevent, and `shell.css` has no icon rules to add.