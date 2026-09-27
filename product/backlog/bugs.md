# bugs

## ready

* Shift+Tab does not outdent in an editor tab; it does nothing at all, because an app-wide focus-cycling chord claims the key first. the spec says "Tab and Shift+Tab reach the same two commands: Tab indents whenever the selection spans more than one line, and Shift+Tab outdents in every case." reproduction: open a file whose first line is `  alpha`, put the caret on it, press Shift+Tab. observed: the text does not change, and no tab character is inserted either, which is the tell: if the editor's own key bindings had run, Shift+Tab would have fallen through to inserting a tab. the same buffer and the same caret position outdent correctly under the other chord, Cmd+[ turns `  alpha` into `alpha`, and a tab-indented line behaves the same way, Cmd+[ takes `\talpha` to `alpha` while Shift+Tab leaves it alone. a keydown trace pins where it goes: the Tab keydown with `shiftKey` set does reach the editor's textarea, but with `defaultPrevented` already true during the capture phase on `window`, and it never reaches the editor's own handler, so neither the indenting plugin's outdent nor the editor's fallback can run. that is `useSectionNav`, which claims Shift+Tab across the whole application as its "cycle keyboard focus across the currently-present application sections" chord and runs in the capture phase on `globalThis`, calling `preventDefault()` and `stopPropagation()` (`web/src/useSectionNav.ts:61-70`). its own comment says the capture phase is deliberate, so it wins ahead of xterm and ahead of the browser's focus traversal, and the editor's textarea handler is further down the same road. it already stands down while a modal dialog is open; it does not stand down for an editor tab. the net effect for a user is a dead key: in a layout with only the centre section present the chord refocuses the visible tab, so Shift+Tab appears to do nothing whatsoever. likely fix: let the editor claim the chord first, the way the modal case already does, by having `useSectionNav` return early when the event target is inside an editor tab (the editor root carries `data-doc-shot="editor-view"`), and keep the section cycle for the surfaces that do not use Shift+Tab. a plain Tab is a different chord from the yielded Shift+Tab, so indenting a multi-line selection with Tab keeps working either way.

* intermittent bug likely due to a race condition: on launch the window and UI are displayed but the command line does not have the keyboard focus and clicking on the command line does not recover the focus. the app must be restarted by closing the window. In rarer cases, the window opens but the UI fails to render entirely. again the app must be restarted by closing the window. 

## development


## deferred

* when closing harness tabs, the tab disappears, but the UI is not responsive for many seconds afterwards. the UI should retain responsible when closing harness tabs. Any teardown should be completed in the background, asynchronously. This may only apply to local tabs. more research needed.

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
