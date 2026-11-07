# Thinking marker decoration for shell echo rows
**Complexity: 4/10** — the shell's first interactive xterm decoration: it must sit a cell after text that reflows, flip between two states in place, hide with the alternate screen, and keep presses away from xterm, all verified only against a fake terminal; there is no server or state logic.

## Goal

Add `web/src/plugins/shell/thinking-marker-decoration.ts`, a module that draws one marker on one terminal row as an xterm decoration, plus its stylesheet rules and its tests. The marker is either `Thinking` with a spinning icon, or a `see thought process` link, and one marker switches between the two in place. It knows nothing about replies, receipts, or connections: it is given a row marker, a state, and a click callback. Nothing calls it until `06-marker-lifecycle`, so the running app does not change.

## Design decisions and dependencies

This subplan is client-only and depends on no earlier subplan. `06-marker-lifecycle` consumes the three exports defined here. `05-reply-writers-plumbing` is independent of it.

Source plan requirements carried here: "Shell client changes" bullets on `thinking-marker-decoration.ts` and on `shell.css`; "UI design" for Surface, Placement, Look, Interaction (pointer only, pointer cursor), Accessible name and tooltip, States (hide for a full-screen program, resize re-places, not terminal text), and Motion (always spins); "Once the prompt settles" (the link reads `see thought process`, is styled as a link, shows no literal brackets); "While the prompt runs" (`Thinking` is capitalized, has no ellipsis, and carries nothing else); the client-side `thinking-marker-decoration.test.ts` entry in "Tests"; "Code organization" (the xterm drawing lives in this module, in the shell plugin's own directory, with no import from another feature).

- Exports (names chosen here, consumed unchanged by `06`): `addThinkingMarker(terminal, marker, view)` returns a handle with `show(view)` and `remove()`. `view` is `{ kind: 'running' | 'link'; name: string; onOpen: () => void }`. The module takes an xterm marker instead of creating one because the two callers get theirs differently: the echo row's marker is registered after the echo is parsed, and the reply head row's after the head is parsed (`05-reply-writers-plumbing`). Registration, timing, and state live in the callers; this module only draws.
- Drawing follows `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts`: `terminal.registerDecoration` on the `top` layer, an `onRender` handler that fills the element once and positions it on every render, and the same hide rule as its `position` helper (display none while `terminal.buffer.active.type` is not `normal`, or while the row is outside the viewport). `allowProposedApi` is already on in `useShellTerminal.ts`. xterm creates a decoration's element lazily on first render, so the module keeps the current view in its own state and builds from it on first render; a `show` before then only updates that state.
- Placement. On each render the module finds the row to place against: from the marker's row it walks forward while the next buffer row `isWrapped`, to the last row of that logical line. This is an addition to the source plan's "reads the row's text width": a resize that narrows the window reflows the line into more rows, and the marker may then sit on an earlier row than the text's last one, so the module does not assume the marker's row is the last. It reads that row's text with `terminal.buffer.active.getLine`, trims trailing blanks, counts the cells the text occupies (wide characters count two), and places the element one cell after that, converting cells to pixels with the screen's width over `terminal.cols`. When fewer cells remain than the element needs (measured from the rendered element, not guessed), it moves to the row's right edge over the last cells, and it has the terminal background behind it (`var(--bg)`) so it reads cleanly over whatever text is there. xterm sizes a decoration's element in whole cells, so the module overrides the element's own width and left offset in pixels and keeps it only as wide as its content; a full-row-wide element would swallow clicks meant for the row. `.harness-body.shell-body` already clips decorations to the terminal body, which is what makes the right-edge case safe.
- No screen. When there is no `.xterm-screen` to measure against (no `terminal.element`, as in `ShellTab.test.tsx`'s stub, or a screen with no height yet), the module still builds and updates the content on render and simply places nothing, as `markdown-block.ts` declines to place a block it cannot measure. A later render places it. `07-client-wiring` relies on this.
- Content. Running: the text `Thinking` followed by the spinner. The spinner is built with `icon(faSpinner, { classes: ['fa-spin'] })` from `@fortawesome/fontawesome-svg-core`, with `faSpinner` from `@fortawesome/free-solid-svg-icons`, because a decoration is plain DOM and not React (the React equivalent is `FontAwesomeIcon` with `spin` in `web/src/shared/RemoteSessionButton.tsx`). This is the first runtime use of `@fortawesome/fontawesome-svg-core` under `web/src` (the existing imports are type-only); it is already a direct dependency in `package.json`. The spin keyframes come from the stylesheet the library injects on first use, the same one `FontAwesomeIcon` relies on, so confirm in the running app that the icon actually turns (a manual step in `08-docs-and-verification`). Link: the text `see thought process`, with no square brackets. The marker carries nothing else, no elapsed time, no model name, no activity kind.
- State switching. `show(view)` rebuilds the content and the attributes on the same element, so a running marker becomes the link without a new decoration or a flicker. The element's click handler calls the `onOpen` of the current view, so it never calls a stale one.
- Accessibility. The element has `role="link"`, and its `title` and `aria-label` are `Open <name>` in both states, with `name` taken from the view (for example `Open acp:ask:shell`). The spinner icon is decorative. There is no tab stop and no key handler: the feature is pointer-only, with no new key binding or command (`help/keys.md` is not affected).
- Presses. The element stops its own `mousedown` from propagating, so a press on it starts no terminal selection and no reply selection (`holdReplySelection` in `reply-selection.ts` is the precedent for presses on a decoration). The capture-phase listener that `holdFocusOffSinglePress` (`press-focus.ts`) puts on the tab body still runs first, so the keyboard stays in the command bar. A click is not stopped: it bubbles to the tab body's `onClick`, which gives focus to the command bar, so the draft is kept and the user returns to it.
- Lifetime. `remove()` disposes the decoration and its marker and is idempotent. xterm disposes markers and decorations with the terminal and when a row scrolls out of the scrollback or is cleared, so every handle operation after that must be a safe no-op. When `registerDecoration` returns nothing, the handle is inert.
- Theme and motion. The marker takes the terminal theme's colors through CSS variables, so it follows the light and dark themes as reply blocks do. The spinner always spins; honoring the OS reduced-motion setting is app-wide future work and out of scope.
- Correction to the source plan's reference: the rule that styles links in a rendered reply, `.line.markdown a { color: var(--accent); }`, lives in `web/src/theme.css` (line 550), not in `shell.css`. `shell.css` holds only `.shell-output-block`.
- Non-test files in a client plugin directory may import only `../api`, `../shared.css`, `@shared/error-text`, `@shared/plugins/<id>/shared`, packages, and sibling files (the client block of `eslint.plugin-boundaries.mjs`). This module needs only `@xterm/xterm` types and the two FontAwesome packages, so it stays inside that rule.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| HTML anchored to a scrollback row | `insertMarkdownBlock`, `position`, `fill` in `web/src/plugins/shell/markdown-block.ts` | The pattern, including the hide rule. Not modified. |
| Decoration press precedent | `holdReplySelection` in `reply-selection.ts`; `holdFocusOffSinglePress` in `press-focus.ts` | Why `mousedown` is stopped and why capture-phase focus handling still works. |
| Spinner | `faSpinner` with `spin` in `web/src/shared/RemoteSessionButton.tsx` | The glyph; here through `icon()` because the DOM is not React. |
| Link look | `.line.markdown a` in `web/src/theme.css` | The settled link's colour and underline. |
| Reply block styles and clipping | `.shell-output-block` and `.harness-body.shell-body` in `web/src/plugins/shell/shell.css` | Style precedent and the clip that bounds the right-edge case. |
| Fake terminal | `fakeTerminal` in `web/src/plugins/shell/markdown-block.test.ts` | Extended in the new test with `getLine` rows and a decoration that exposes `onRender` and an element. |
| Stylesheet assertions | `web/src/plugins/shell/shell-style.test.ts` (reads `shell.css?raw`) | Gains rules for the marker. |
| Spin assertion precedent | `web/src/plugins/models/ModelsTab.test.tsx` (`toHaveClass('fa-spin')`) | How the spinner is checked in jsdom. |

## Proposed changes

- `web/src/plugins/shell/thinking-marker-decoration.ts` (new): the module and its three exports (`addThinkingMarker`, and the `ThinkingMarkerView` and `ThinkingMarkerHandle` types). Under 200 counted lines. If the placement arithmetic grows it, move it into a sibling pure module (cells and pixels in, a left offset and a visible flag out) and import it back; do not compact.
- `web/src/plugins/shell/shell.css`: a marker block. The running text is muted (`var(--muted)`) and not bold; the font family, size, and line height are the terminal's own, read from `var(--mono)`, `var(--terminal-font-size)`, and `var(--terminal-line-height)` (the custom properties `createAppTerminal` reads in `web/src/shared/terminal/app-terminal.ts`; a decoration element does not inherit them from xterm), so the text and the spinner are cell-sized; the cursor is `pointer`; the element is `white-space: nowrap` with `background: var(--bg)`; the link state matches `.line.markdown a` (the `var(--accent)` colour and the underline an anchor carries). A pointer cursor shows over both states.

## Tests

Client (vitest project `client`), colocated:

- `web/src/plugins/shell/thinking-marker-decoration.test.ts` (new), with a fake terminal built like `markdown-block.test.ts` (a `.xterm-screen` element with fixed `clientWidth`, `rows`, `cols`, a `buffer.active` with `type`, `viewportY`, and `getLine`, a `registerDecoration` whose result exposes `onRender`, an element, and `dispose`, and `offsetWidth` mocked):
  - the element sits one cell after the row's text, and at the right edge over the last cells when the row is full;
  - after the row's text changes and it renders again, the element has moved; a wrapped continuation row is placed after the last row of the logical line;
  - it hides while the alternate buffer is active and returns when the normal buffer does, and hides when its row is outside the viewport;
  - it fills once however often it renders, and a `show` before the first render is honored by it;
  - with no screen to measure against it still fills the content and sets no position;
  - it switches from `Thinking` to the link in place on the same element, the link text is `see thought process` with no brackets, and the text, `role`, `title`, and `aria-label` change together;
  - in both states it carries `role="link"` and the `Open <name>` title and accessible name;
  - the spinner has the `fa-spin` class;
  - a click calls the current view's `onOpen`, once, and the click still bubbles; a `mousedown` on it does not reach a listener on the terminal's element;
  - `remove()` disposes the decoration and marker, a second `remove()` and a later `show()` do nothing, and an undefined `registerDecoration` result gives an inert handle.
- `web/src/plugins/shell/shell-style.test.ts`: the marker rule is muted and not bold, has the pointer cursor, and the link state uses the accent colour.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npx vitest run --project client web/src/plugins/shell/thinking-marker-decoration.test.ts web/src/plugins/shell/shell-style.test.ts web/src/plugins/shell/markdown-block.test.ts`. Search the new module for imports to confirm none reaches outside `@xterm/xterm`, the two FontAwesome packages, and sibling files.

There is no manual check at this stage: nothing calls the module, so the running app is unchanged. The first visible check is in `07-client-wiring`. Until `06-marker-lifecycle` lands the module's exports are unused; ESLint does not flag that, but `knip`, which only `npm run check:full` runs, would.

## Out of scope

- When a marker is added, which row it goes on, and how it settles (`06-marker-lifecycle`).
- Registering the row markers and returning values from the writers (`05-reply-writers-plumbing`).
- Reading the receipt or the reply (`07-client-wiring`).
- Keyboard access, elapsed time, model name, activity kind, and the OS reduced-motion setting.
- Any server change.
