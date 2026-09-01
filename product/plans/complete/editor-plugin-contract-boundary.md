# Publish the editor-plugin contract properly and put its import boundary under lint

Complexity: 4/10

## Goal

Make "an editor plugin depends only on a published contract" hold by construction rather than by convention: promote the five editor helpers a bundled plugin reaches for into `web/src/editor/plugins/api.ts`, and add the lint rule that stops the next plugin reaching past it.

## Approach

`eslint.plugin-boundaries.mjs` constrains the tab-plugin layer with six blocks and has no rule matching `web/src/editor/plugins/*/**`, which is why `multiselect/index.ts` can import `selectionBounds`, `textIn`, and `wordRangeAt` from `../../model` and `offsetToPos` / `posToOffset` from `../../offsets` while `commenting` and `indenting` correctly use `../api` alone.

Three parts:

1. **Publish the helpers.** `api.ts` re-exports all five, and re-exports the `Pos` type it already imports from `../model`, so a plugin's whole vocabulary arrives from the contract.

2. **Pin their signatures at the contract.** Each re-export is a `const` with its contract signature spelled out — `export const textIn: (lines: readonly string[], range: EditorRange) => string = ...` — rather than a bare `export { textIn }`. A bare re-export would leave the plugin-visible signature defined in `model.ts`, which is exactly the drift the item names: a refactor of the editor's caret and offset helpers changing what a plugin sees without touching the contract or its version number. With the signature written at the contract, such a refactor fails to typecheck **here**, in the versioned module, where the decision to bump belongs.

3. **Close the boundary.** A seventh entry in `pluginBoundaries` for `web/src/editor/plugins/*/**/*.ts` restricting `^\.\./(?!api$)`, shaped like the two existing plugin rules, with `**/*.test.ts` ignored as those rules do — plugin tests legitimately reach for `EditorState` to drive `applyPluginResult`.

`EDITOR_PLUGIN_API_VERSION` stays at 2: the helpers move unchanged, and their contract signatures are written to match what they already are.

Only `multiselect/index.ts` violates the new rule today; `commenting` and `indenting` are already clean and need no edit.

## Implementation steps

1. Re-export `Pos` and the five helpers from `web/src/editor/plugins/api.ts`, each with its signature written out, under a comment saying why the signature is spelled rather than inferred.
2. Point `web/src/editor/plugins/multiselect/index.ts` at `../api` for all five, dropping its `../../model` and `../../offsets` imports.
3. Add the seventh block to `eslint.plugin-boundaries.mjs`.
4. Verify the rule bites by reintroducing a `../../model` import in a scratch edit and confirming lint rejects it, then revert.

## Tests

- Add `web/src/editor/plugins/api.test.ts`: each re-exported helper is the identical function the host module exports (the re-export wraps nothing and aliases nothing else), and each behaves as the contract's signature says on a small buffer.
- `web/src/editor/plugins/multiselect/index.test.ts` pins the multiselect commands and `host.test.ts` the load/disable behavior; both must keep passing untouched, which is what shows the import change is inert.
- The new lint zone gets its automated positive/negative case in `src/eslint-plugin-boundaries.test.ts`, which does not exist yet — it is created by the next backlog entry, "Put the plugin architecture's import-boundary lint rules under test". That entry now owns seven blocks rather than six. Step 4 above verifies the rule by hand in the meantime.
- Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

No user-visible behavior changes: the same plugins bind the same chords and make the same edits. No spec, `help.md`, or `documentation/user-documentation/` updates expected.

## Out of scope

- Handing the helpers to the handler on its request instead of re-exporting them, which is the heavier of the two options the backlog entry offers.
- Narrowing the buffer slice a plugin receives; the slice is still declared by the plugin rather than granted by the host.
- Bumping `EDITOR_PLUGIN_API_VERSION`.
- Any change to the six existing tab-plugin boundary blocks.
