# Plugin chords outside a plugin tab

**Complexity: 3/10** — one branch removed from the chord registry, one field added to the window key handler's snapshot, and the shell tests updated to name the tab they press the chord in.

## Goal

A chord a plugin tab declares fires only in that tab. With a shell docked in a sidebar and focus in an agent tab's command bar, `Ctrl+R` opens the application's history picker, whatever the number of docked shells. A shell that is the current centre tab keeps its own `Ctrl+R` even when the keyboard has fallen back to the page body, for example after a click on its metadata row.

## Approach

`createPluginChordRegistry().run` in `web/src/plugins/PluginChords.tsx` falls back to the only registered claim when it is given no focused tab label. Agent tab bodies carry no `data-tab-label`, so with one visible docked shell the shell's claim runs from inside an agent tab, while two docked shells make the fallback refuse. Remove the fallback, so a chord with no tab label stays with the application.

That alone would also take `Ctrl+R` away from an undocked current shell whenever focus sits on the body, since `handleChordKeys` in `web/src/useWindowKeys.ts` reads the label only from the focused element's `[data-tab-label]` ancestor. So the window key handler's snapshot gains a `currentPluginTab` field, the current tab's label when that tab is a plugin tab, and `handleChordKeys` uses it only when no element holds focus (the event target is the window, the document, or the body). Focus inside an element with no tab label, such as an agent tab's command bar, still resolves to no label.

## Implementation steps

1. In `web/src/plugins/PluginChords.tsx`, make `run` return `false` when `focusedTabLabel` is undefined, and update the comments.
2. In `web/src/useWindowKeys.ts`, add `currentPluginTab?: string` to `StateSnapshot`, and resolve the chord's tab label in a small helper: the focused element's `[data-tab-label]`, else `currentPluginTab` when the target is not an element below the body, else undefined.
3. In `web/src/App.tsx`, pass `currentPluginTab: current.plugin ? current.label : undefined` in the window-key bag.
4. In `web/src/plugins/shell/ShellTab.test.tsx`, pass the tab's label to `chords.run` where a case stands in for the window handler.
5. Update `product/specs/shell-tab.md` to say a docked shell's `Ctrl+R` does not fire from an agent tab, and change "on a visible shell tab" to "in a shell tab" in `documentation/user-documentation/getting-started/keyboard.md`, since a visible docked shell no longer takes the chord from the tab beside it.

## Tests

- `web/src/useWindowKeys.test.ts`: with a registered shell claim and a focused textarea that has no `data-tab-label`, `Ctrl+R` opens the application history picker and leaves the claim alone.
- `web/src/useWindowKeys.test.ts`: with focus on no element and the current tab a plugin tab holding the claim, `Ctrl+R` runs the claim (the existing precedence cases, now naming the current plugin tab).
- `web/src/useWindowKeys.test.ts`: with focus on no element and no current plugin tab, `Ctrl+R` opens the application history picker.
- The existing per-tab dispatch and release cases keep passing.

## Out of scope

- Adding `data-tab-label` to agent, editor or harness tab bodies.
- Changing which chords the shell declares (the `Cmd+T` claim is a separate backlog entry).
- Changing how a docked tab becomes the focused plugin tab for `Cmd+W`.
