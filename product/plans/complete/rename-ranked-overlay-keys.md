# Rename `useRankedOverlayKeys` to `rankedOverlayKeys`

## Complexity

2/10 — one rename in one module plus its two call sites' import and call lines. No logic, signature, or behavior changes.

## Goal

`web/src/shared/ranked-overlay-keys.ts` exports `useRankedOverlayKeys`, a function that takes a selection, a count and three callbacks and returns a `React.KeyboardEventHandler` while calling no React hook at all. The `use` prefix is the signal both `react-hooks/rules-of-hooks` and the reader key on, so it promises state the function does not hold and stops the rule from guarding `web/src/pickers/QuickOpen.tsx` and `web/src/editor/EditorFind.tsx` at the point either calls it — the first person to add a `useState` inside it would do so beside arrow-key arithmetic two features share, and the conditional-call checks fall silent exactly then. §6 of the React organization guidelines is explicit: logic that calls no React hook is a plain function and must not carry the `use` prefix.

## Approach

Rename the function to `rankedOverlayKeys` in `web/src/shared/ranked-overlay-keys.ts`, keeping the signature, the body and the returned handler type exactly as they are — the file already imports React as a type only, so no import changes. Update the two callers' import and call sites: `web/src/pickers/QuickOpen.tsx`, where the imported name and the call that assigns `onKeyDown` both change, and `web/src/editor/EditorFind.tsx`, where the same two sites change. Nothing else names `useRankedOverlayKeys`, and there is no `ranked-overlay-keys` test to update.

## Implementation

1. In `web/src/shared/ranked-overlay-keys.ts`, rename `useRankedOverlayKeys` to `rankedOverlayKeys`, leaving the parameter list, body, and return type untouched.
2. In `web/src/pickers/QuickOpen.tsx`, change the import to `rankedOverlayKeys` and the call that assigns `onKeyDown` to `rankedOverlayKeys(...)`.
3. In `web/src/editor/EditorFind.tsx`, make the same two changes.
4. Run `./scripts/run.mjs check-diff` after the rename and again after the call-site updates.

## Tests

No new tests. The handler's behavior — every key swallowed and stopped from reaching the layer behind, Up/Down stepping one row without wrapping, Enter and Escape delegated to the caller — is pinned through both call sites by `web/src/pickers/QuickOpen.test.tsx` and `web/src/editor/EditorFind.test.tsx`, which must keep passing unchanged. The rename is a name-only change to a function with no direct test, and both consumers' suites exercise it on every render.

## Out of scope

- Renaming the file, or moving it out of `web/src/shared/`; it genuinely has two consumers.
- Any change to the handler's signature, body, or returned type.
- Adding a `react-hooks` lint rule or test that would reject a `use`-prefixed non-hook; that is a separate enforcement question.
- The other `use…` helpers beside it in `web/src/shared/` — each calls real hooks and is correctly named.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A repository-wide search finds no remaining `useRankedOverlayKeys`.

## Documentation and specification impact

None. The rename is invisible to users; no spec, `help.md`, or user documentation references the symbol.
