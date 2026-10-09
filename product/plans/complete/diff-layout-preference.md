# Fix: remember the diff tab's layout as a standing preference

**Complexity: 4/10** — one payload field, one intent, the plugin's own settings entry read and written on the session, and both sides' tests. The pattern is the search tab's, which remembers its view modes the same way.

## Goal

The **Unified / Split** choice is a standing preference rather than a per-tab one: a diff tab opens in the layout the user last chose, and reopening the tab or re-running the command keeps it, exactly as the search tab opens with the view modes it last used.

## Approach

Today the layout is client-only state in `DiffTab`, born `false` on every mount, and the recorded spec says on purpose that it is not persisted. The requirement reverses that for the layout alone. The search tab already persists view modes through the plugin's own config entry — `readSettings` / `saveSettings` on the server's capabilities, addressed by the plugin's id — and the diff session is the natural owner, because the session is what publishes the payload.

1. **The payload names the layout.** `src/plugins/diff/shared.ts` gains `split: boolean` on `DiffPayload` and a `LayoutIntent = { split: boolean }` with its guard. The payload's shape changed, so `DIFF_PAYLOAD_SCHEMA_VERSION` becomes 2 — client and server ship together, and the version is what keeps a payload the other side cannot read from reaching the DOM.
2. **The session owns the preference.** The session constructor reads its settings entry and carries the saved layout into the first payload. A `layout(split)` method writes the entry when the value differs from what was last written — a toggle the user repeated must not rewrite the config — and republishes the payload, which is what switches the layout on screen. `src/plugins/diff/manifest.ts` declares `readSettings` and `saveSettings`.
3. **The client asks, the session answers.** `web/src/plugins/diff/DiffTab.tsx` reads the layout from its payload and its **Unified** and **Split** buttons send the `layout` intent, so a repaint performs the switch. The whitespace toggle stays a for-the-life-of-the-tab choice because it decides which lines git reports.

## Implementation steps

1. Add the payload field, the intent type and guard, and the schema-version bump to `src/plugins/diff/shared.ts`.
2. Carry the saved layout in `src/plugins/diff/session.ts`, add `layout`, and declare the two settings capabilities in `src/plugins/diff/manifest.ts`.
3. Route the `layout` intent in `src/plugins/diff/activate.ts`.
4. Read the layout from the payload and send the intent in `web/src/plugins/diff/DiffTab.tsx`, extending `DiffTab.test.tsx`'s payload fixture.
5. Run `./scripts/run.mjs check-diff` and resolve any failures.
6. Add the cases below to `src/plugins/diff/activate.test.ts` and `web/src/plugins/diff/DiffTab.test.tsx`.
7. Run `./scripts/run.mjs check-diff` and resolve any failures.
8. Update `product/specs/diff-tab.md` — the layout is remembered, the whitespace toggle is not.
9. Check `help.md` and `documentation/user-documentation/` for a layout claim, and update it only if present.

## Tests

- The payload the tab opens with carries the layout saved in the plugin's settings entry, so a reopened tab opens in it.
- The `layout` intent republishes the payload with the layout it names and writes the settings entry.
- A layout already saved is not rewritten, so a repeated toggle does not touch the config again.
- The tab renders the split layout when its payload names it, and the unified one otherwise.
- Clicking **Split** sends the `layout` intent with the layout named, rather than switching on local state.

## Out of scope

- Persisting the whitespace toggle, which decides which lines git reports.
- Persisting expansion state, the walked hunk, or the scroll position.
- The control's label and its active-state styling, which stay as they are.
