# Remove the unused hasHelpFallback export

**Complexity: 1/10** — delete one dead exported function and its now-unused import. No behavior changes.

`src/application-commands.ts` exports `hasHelpFallback`, which no production or test code calls. It returns true for any input except one that produces silent output, so its meaning differs from the dispatch policy's help gate, `getOutput(commandText).kind === 'output'` in `src/native-commands/dispatch-policy.ts`. The dead export also keeps a `getOutput` import in the inventory module.

## Goal

The inventory module no longer exports a misleading help helper or depends on the help reader.

## Approach

1. Delete `hasHelpFallback` from `src/application-commands.ts`.
2. Remove the `getOutput` import from `./commands.js` there.
3. Leave the help row's inventory data and the dispatch policy's `getOutput(...).kind === 'output'` gate untouched.
4. Confirm no references to `hasHelpFallback` remain in `src/`, `web/src/`, or `product/specs/`.

## Tests

No new tests; the function has no behavior to preserve. `src/application-commands.test.ts` and `src/command/manager.test.ts` must pass unchanged.

## Specs

None: the helper was never user-visible.

## Out of scope

The Agent access checkbox parent rule and the pull request title are separate backlog entries.
