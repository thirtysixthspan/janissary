# Launch focus on the janus shell command bar

**Complexity: 2/10** — no source change is required. The behavior the issue asks for is already what the running application does, and this plan's job is to prove it end to end, pin it against regression at the level where it can break, and say it plainly in the spec.

The backlog asks that "on application launch, the keyboard focus should be on the janus shell tab command bar." Verified against the current tree before this plan was written, by building the app, launching it with `--no-open` in a scratch project, and driving it through the attached end-to-end browser:

- From the moment the shell tab's body mounts (about half a second after the page loads), `document.activeElement` is the `Shell command` textarea of the `janus` tab, and it stays there for the following ten seconds, through zsh's startup, the hook install, and the terminal reveal.
- Typing `echo hi` straight after launch, with no click, lands the text in the janus command bar.
- With focus emulation turned off, so the page loads while its window does not have focus, the textarea is still the document's active element, and it takes the keyboard the moment the window is brought to the front.

The mechanism is the shell tab's own: it focuses its command bar on mount when it is the visible tab, and `ShellTab.test.tsx` already pins that for the component in isolation. What nothing pins is the launch path as a whole — the App mounting from its first state snapshot, the plugin layer, and the lazily loaded shell body. A change anywhere along it (an App-level focus effect that lands on a command bar the shell tab does not render, a layer mounting hidden, a sidebar or overlay grabbing focus on mount) would break the launch behavior with every existing test still green. And the spec says only that "the command bar is focused when the tab opens", not that this is where the keyboard is when the application comes up.

## Goal

When the application launches, the keyboard is in the `janus` launch shell's command bar, so the first thing typed reaches it without a click — and a change that moves launch focus elsewhere fails the suite.

## Approach

**Pin the launch path, not the component.** The new test renders `App` from a launch-shaped first state snapshot — one tab, labelled `janus`, carrying the shell plugin's envelope — and asserts that once the lazily loaded shell body has mounted, the active element is its command bar. This is the same path a launch takes, so it covers the App's own tab-switch focus effect, the plugin layer's visibility, and the shell's mount effect together.

**Stub only what jsdom cannot run.** xterm's renderer and its fit addon are stubbed as `ShellTab.test.tsx` does, and `ResizeObserver` and `WebSocket` are stubbed as `App.initial-state.test.tsx` does. Everything else is real.

**Keep it in its own file.** `App.initial-state.test.tsx` mocks `useXterm` for an agent-shaped `janus` tab; the module-level `vi.mock` for `@xterm/xterm` this test needs would leak into it, so the launch-focus case lives in a sibling file.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The shell tab's focus-on-mount effect and `autoFocus` command bar | `web/src/plugins/shell/ShellTab.tsx` |
| The fake socket and first-snapshot launch harness to mirror | `web/src/App.initial-state.test.tsx` |
| The xterm and fit-addon stubs to mirror | `web/src/plugins/shell/ShellTab.test.tsx` |
| The spec paragraph describing the launch shell | `product/specs/shell-tab.md` |

## Implementation steps

1. **No source change.** Confirm — do not modify — that nothing between the App's first render and the shell body's mount moves focus away from the shell's command bar. If the new test fails, stop and revise this plan before writing code.
2. **Add `web/src/App.launch-focus.test.tsx`**, rendering `App` from a first snapshot whose only tab is the `janus` shell plugin tab.
3. **Extend the launch-shell paragraph** in `product/specs/shell-tab.md` to state that the launch shell is the visible tab when the window first appears and its command bar holds the keyboard.

## Tests

In the new `web/src/App.launch-focus.test.tsx`:

- After `App` renders from a launch snapshot whose only tab is the `janus` shell tab, the `Shell command` textarea is the document's active element once the shell body has mounted.
- The terminal is not what holds focus: the stubbed emulator's `focus` was never called.

## Out of scope

- **Activating the application window itself.** Whether the operating system makes a newly launched Chrome window the key window is decided outside the page; once the window is active, the browser hands the keyboard to the focused command bar, as verified above.
- **Focus after `profile launch`**, which opens and focuses other tabs by design (see the profiles spec).
- **Focus after a browser reload or reconnect.** Same mount path, but not what the issue asks about.
