# Let the window shortcuts through while an editor tab holds the keyboard focus

**Complexity: 4/10**: the root cause is one unconditional line in `web/src/editor/useEditorInteractions.ts`. Removing it makes the window chords fire, but two more pieces are needed for the result to be usable. A picker opened from the editor must actually render over the editor tab, and while it is open the buffer must hand it every key instead of editing underneath it. The change touches four web files and adds one test file. There is no server change.

## Root cause

`onKeyDown` in `web/src/editor/useEditorInteractions.ts` calls `event.stopPropagation()` on its second line, before it decides whether the key is one of its own. That stops the native keydown at the React root, and `useWindowKeys` (`web/src/useWindowKeys.ts`) listens on `globalThis` in the bubble phase, so it never sees any keydown from the buffer. `useCmdW` registers in the capture phase, which is why Cmd+W is the one chord that still works.

Removing that line exposes two gaps that were hidden behind it:

- **No overlay renders over an editor tab.** `PickerOverlays` is mounted only inside `AgentTabBody` (the focused agent tab's body), and `MountedViewLayers` renders only the task picker and tab navigator, and only over a harness tab. With an editor tab current, Ctrl+G would open the navigator's state with nothing on screen, and the window handler's modal chain would then claim keys for an invisible overlay.
- **The buffer would keep eating the overlay's keys.** The tab navigator, history picker, and route chooser don't take focus. They read keys from the window handler while focus stays where it was. With focus still in the buffer, ArrowDown, Enter, and letters would move the caret and edit the file, and they would never reach the picker.

## Correct behavior

With keyboard focus in an editor buffer, a key the buffer does not bind reaches the window key handler, so the window shortcuts work exactly as from any other tab. That covers Cmd+Shift+[ / Cmd+Shift+], Ctrl+G, Ctrl+R, Cmd+P, Cmd+T, Ctrl+← / Ctrl+→, Ctrl+T, and Ctrl+O. A chord the buffer binds stays the buffer's alone. That covers Shift+arrows, the Emacs subset (Ctrl+A/E/F/B/N/P/D/K/Y), Ctrl/Cmd+S, Cmd+F, Escape, Tab, and plugin chords. `web/src/editor/keys.ts` and the plugin/suggest handlers remain the only place that says what the buffer binds. The specs back this: `product/specs/editor-tab.md` names Cmd+Shift+[ / ] as how the editor switches tabs, and `product/specs/keyboard-navigation.md` names Cmd+P "from any focused tab", Ctrl+G, Ctrl+R, Cmd+T, and Ctrl+← / →. An overlay opened from an editor tab appears over it and takes every keystroke while it is open (keyboard-navigation "Overlay priority"). The buffer is not edited underneath it and its caret is hidden (editor-tab "Caret"). When the overlay closes, keyboard focus is back in the buffer.

## Reproduction

The scratch app was built from `master@f052d4de` and started against a scratch project directory holding `alpha.txt`. An `e2e-driver` batch ran `edit alpha.txt`. Before each chord it clicked the editor tab and focused `textarea.editor-textarea`, and asserted that `document.activeElement` was that textarea. It then pressed each of Ctrl+G, Ctrl+R, Cmd+P, Ctrl+←, Ctrl+→, Cmd+Shift+], Cmd+Shift+[, Ctrl+E, and Cmd+T. For all nine, the tab strip stayed `["janus", "alpha.txt [active]"]`, no `.picker` appeared over the editor, and none was open on the root tab afterwards. Focus stayed in the editor textarea throughout.

## Approach

1. **Stop propagation only for keys the buffer claims.** Split the body of `onKeyDown` into a `claimKey(event): boolean` that returns whether the buffer handled the key. It keeps every existing branch and its `preventDefault` calls unchanged, returns `true` on each handled branch, and returns `false` when there is no action and no plugin claims the key. `onKeyDown` then calls `event.stopPropagation()` only when `claimKey` returns true. Add a one-line comment above that call. It says the buffer stops only the keys it claims, so every other chord bubbles to the window key handler.
2. **Yield every key while a window overlay is open.** `useEditorInteractions` takes a new `overlayOpen: boolean`. While it is true, `onKeyDown` handles nothing and stops nothing. It only calls `preventDefault` when `actionForKey` would have claimed the key, so no text reaches the hidden textarea. `onPaste` cancels the paste and returns.
3. **Tell the editor whether an overlay is open, and render the overlays over it.** `AppMain` passes `MountedViewLayers` two new props: the `PickerOverlays` element it already builds, and `overlayOpen = firstOpenOverlay(pickers.overlays) !== undefined`. `MountedViewLayers` renders that element inside the current editor tab's body, which becomes `position: relative` as the harness body already is. It passes `overlayOpen` to every `EditorTab`.
4. **In `EditorTab`:** forward `overlayOpen` to `useEditorInteractions`. Add `!overlayOpen` to the focus effect's condition and dependencies, so focus returns to the buffer when an overlay closes. Pass `active && !overlayOpen` to `EditorLines`, so the caret hides while a picker is up.

## Implementation steps

1. Add the regression test file (below) and run it against the unfixed code to watch the window-chord cases fail.
2. Refactor `useEditorInteractions` into `claimKey` plus a conditional `stopPropagation`, and add `overlayOpen` to it. Run `check-diff`.
3. Add the `overlayOpen` prop to `EditorTab` (interactions, focus effect, caret). Run `check-diff`.
4. Add `pickerOverlays`/`overlayOpen` to `MountedViewLayers` and pass them from `AppMain`. Run `check-diff`.
5. Add the `MountedViewLayers` test case. Run `check-diff`.

## Regression test

`web/src/editor/EditorTab.window-keys.test.tsx` uses the same client and fetch stubs as `EditorTab.test.tsx`. It attaches a `keydown` spy on `window`, fires keydowns on the loaded buffer's textarea, and asserts:

- Each of Ctrl+G, Ctrl+R, Cmd+P, Cmd+T, Cmd+Shift+], Cmd+Shift+[, Ctrl+←, and Ctrl+→ reaches the window listener. This fails without the fix.
- Each of Shift+←, Ctrl+E, Ctrl+P, Escape, Cmd+F, and a printable `x` does not reach the window listener.
- With `overlayOpen`, ArrowDown and `x` reach the window listener, the buffer text and caret are unchanged, and the default of `x` is prevented. A paste leaves the buffer unchanged.
- With the overlay open and focus moved off the buffer, re-rendering with `overlayOpen={false}` puts focus back in the textarea.

`web/src/MountedViewLayers.test.tsx`: the `pickerOverlays` element renders inside the current editor tab's body and not inside a hidden one.

## Verification

- `./scripts/run.mjs check-diff` clean.
- Live: rebuild the fixed working tree, start a scratch instance, and rerun the replication driver extended to check the fixed behavior. With focus asserted in the editor textarea before every press:
  - Ctrl+G shows a `.picker` titled `nav` over the editor. ArrowDown/Escape drive and close it without changing the buffer text, and focus is back in the textarea afterwards.
  - Ctrl+R shows `history`, and Cmd+P shows Quick Open.
  - Ctrl+← / Ctrl+→ move the editor tab in the strip, and Cmd+Shift+] / [ switch the active tab.
  - Cmd+T adds an agent tab.
  - Ctrl+E and Shift+← leave the tab strip unchanged and open no overlay.

## Spec

- `product/specs/editor-tab.md` "Keyboard input": the window shortcuts the buffer doesn't bind keep working while the buffer has focus, and the chords it binds stay the buffer's. An overlay opened from the editor appears over it and takes the keys until it closes, and then focus returns to the buffer.
- `product/specs/keyboard-navigation.md`: a paragraph beside the file-navigator one stating the editor buffer's capture rule.

## Out of scope

- Which chords the buffer binds. `keys.ts` is unchanged, so Ctrl+A and Ctrl+E stay line-start and line-end in the buffer rather than opening the task picker and command queue.
- Window chords while the in-editor agent query line holds focus, or while a suggestion is pending. Those surfaces deliberately claim every key, and that is unchanged.
- Server handling of commands run from an editor tab (history-picker picks, Cmd+T's `agent`).
