# Fix: stop the periodic refresh from blinking the tab's body

**Complexity: 2/10** — one removed publish on the recompute's own path, one added publish where a rescope still needs its blank canvas, and the activation test's settle helper. No client, wire, or parser change.

## Goal

The tab keeps showing what it already shows while a recompute runs, so the once-a-second refresh never blanks the body. On an empty change set the **No changes** message stays put instead of vanishing and returning with every redraw.

## Approach

`recompute` in `src/plugins/diff/session.ts` published `{ state: 'loading' }` before awaiting git, and the client's empty state renders only while `state === 'done'` — so every recompute, including the interval's once a second, unmounted the message and everything under it. The payload the recompute finally publishes is the only thing the tab needs to see, and the answer arrives whole: a recompute repaints the tab when it lands, not when it starts. Nothing on the client reads `loading`, and nothing else publishes it.

1. **A recompute paints on arrival.** Drop `this.safely({ state: 'loading' })` from `recompute`, so an in-flight recompute leaves the last published payload standing.
2. **A rescope keeps its blank canvas.** `open` cleared the payload for a new root but reached the tab only through `recompute`'s loading publish, so it now publishes the cleared payload itself when it re-scopes, and the re-scoped tab is blank until the new root's change set lands, exactly as before.
3. **The test's settle helper waits for the recompute's one publish.** `settled` in `src/plugins/diff/activate.test.ts` watched for the state to leave `loading`, which the loading publish produced; with it gone, the helper waits for a publish newer than the one the caller starts from, which is the result itself.

## Implementation steps

1. Remove the loading publish from `recompute` and add the rescope publish to `open`, in `src/plugins/diff/session.ts`, adjusting the comments that describe the repaint.
2. Rewrite `settled` in `src/plugins/diff/activate.test.ts` to wait for a newer publish, and refresh its comment.
3. Run `./scripts/run.mjs check-diff` and resolve any failures.
4. Add the case below to `src/plugins/diff/activate.test.ts`.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Update `product/specs/diff-tab.md` to say a recompute leaves the tab showing what it shows.
7. Check `help.md` and `documentation/user-documentation/` for a live-update claim, and update it only if present.

## Tests

- While a recompute is in flight the tab publishes nothing, and the last payload published still reads `done` with its files, so the body never blinks.

## Out of scope

- The one-time paint before a tab's first result lands.
- The interval's length, and whether a recompute is skipped while one is in flight.
- Client-side loading placeholders.
