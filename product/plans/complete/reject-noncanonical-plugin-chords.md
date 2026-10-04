# Reject noncanonical plugin chord identifiers

**Complexity: 3/10** — tighten the existing activation-time chord expression and add invalid declarations to its colocated validation tests.

**Goal.** A plugin cannot activate with a chord claim that passes validation but can never match the client's canonical event chord identifier.

**Approach.** Require modifiers in the application's fixed `meta`, `ctrl`, `shift`, `alt` order, at most once each, followed by a lowercase alphanumeric key. Keep refusal at activation so malformed declarations disable only their plugin with the existing reason.

## Implementation steps

1. Tighten `chordIdPattern` in `src/plugins/activate.ts` to enforce ordered, non-repeated modifiers.
2. Add activation tests for reordered and duplicate modifiers in `src/plugins/declaration-validation.test.ts`.
3. Update `product/specs/tab-plugins.md` to state the canonical modifier order and duplicate rejection.
4. Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- Preserve accepted canonical examples and the shell manifest's `ctrl+r` claim.
- Assert `shift+ctrl+r`, `ctrl+ctrl+r`, and other malformed order/repetition claims disable activation with the existing malformed-chord reason.
- Run the repository's diff-scoped check workflow.

## Out of scope

- Changing which physical keys the application recognizes or adding modifier aliases.
- Changing the plugin chord registry's ownership or focus-resolution behavior.
