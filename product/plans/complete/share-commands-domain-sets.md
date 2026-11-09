# Share the commands domain sets between the payload validator and the shared contract

## Complexity

1/10 — export three existing definitions from an import-free shared contract and import them in one sibling validator. No behavior change, no new code paths, no new tests.

## Goal

`src/plugins/commands/payload.ts` redefines `SOURCES`, `NATIVE_TOOLS`, and `isRecord` that already live in `src/plugins/commands/shared.ts`. Two copies can drift when a source or native tool is added to one module, letting the topic validator and the client payload guard disagree about what is valid. The shared contract owns the domain vocabulary and already carries these definitions, so the validator should use them.

## Approach

Export the existing `SOURCES`, `NATIVE_TOOLS`, and `isRecord` from `src/plugins/commands/shared.ts`. The module stays import-free: exporting adds no imports, and the hand-written comment above `isRecord` remains accurate. In `src/plugins/commands/payload.ts`, import the three symbols from `./shared.js` and delete the local copies. `KINDS`, `isStringList`, and every shape check stay local to the payload validator because they are not part of the shared payload contract. No runtime behavior changes; `isCommandsPayload`, `isSetIntent`, `isCommandsData`, and `toPayload` keep their current semantics.

## Implementation

1. Add `export` to `isRecord`, `SOURCES`, and `NATIVE_TOOLS` in `src/plugins/commands/shared.ts`, leaving their definitions and the import-free comment untouched.
2. In `src/plugins/commands/payload.ts`, replace the local `SOURCES`, `NATIVE_TOOLS`, and `isRecord` with a value import from `./shared.js`, keeping `KINDS` and `isStringList` local.
3. Run `./scripts/run.mjs check-diff`.

## Tests

None added: the refactor does not change a branch or any observable behavior. The existing `src/plugins/commands/shared.test.ts`, `src/plugins/commands/payload.test.ts`, and `src/plugins/commands/activate.test.ts` cover the validators and the activation path, and must pass unchanged.

## Out of scope

- Any change to `KINDS`, `isStringList`, or the payload shape checks.
- Any change to `isCommandsPayload`, `isSetIntent`, `isCommandsData`, or `toPayload` behavior.
- Adding imports to `shared.ts`; it remains the import-free client contract.
- New tests, since no branch changes.

## Verification

- `./scripts/run.mjs check-diff` passes.
- A search under `src/plugins/commands` finds `SOURCES`, `NATIVE_TOOLS`, and `isRecord` defined only in `shared.ts`.

## Documentation and specification impact

None. This is a pure refactor; no user-visible behavior changes, so no spec, `help/`, or user-documentation update is needed.
