# Put the plugin architecture's import-boundary lint rules under test

Complexity: 4/10

## Goal

Exercise the restricted-import blocks that encode the whole plugin architecture, so a regex that stops matching — an added directory level, a renamed entry file, a lookahead edited during an unrelated change — fails a test instead of silently disabling its rule.

## Approach

`src/eslint-feature-boundaries.test.ts` already demonstrates the technique for testing lint config from vitest: build an `ESLint` instance over the real `eslint.config.mjs`, lint a source string against a synthetic file path with `lintText`, filter the resulting messages by rule id, and pay the config cold start in a `beforeAll` so the first case does not blow the default timeout. Add a sibling `src/eslint-plugin-boundaries.test.ts` doing the same for `no-restricted-imports`.

`eslint.plugin-boundaries.mjs` now exports **seven** blocks, not the six the backlog entry counted — the editor-plugin boundary landed in the preceding entry. Each gets at least one rejected and one allowed case:

1. **Server tab plugin** — rejects a host internal; allows `../api.js`, `../files.js`, and the two permitted opener helpers.
2. **Client tab plugin** — rejects `../../ws` and a non-plugin `@shared/` module; allows `../api`, `../shared.css`, and its own `@shared/plugins/<id>/shared` contract.
3. **Host plugin infrastructure** — rejects a plugin's `activate.js`; allows its `manifest.js`.
4. **Core server** — rejects `plugins/<id>/activate.js`.
5. **Core web** — rejects `plugins/<id>/index`.
6. **Client plugin host** — rejects a plugin's shared contract imported as a value and a plugin entry imported statically; allows the same contract imported as a type, which is the one case the `allowTypeImports` exemption turns on.
7. **Editor plugin** — rejects the editor's own model module; allows `../api`.

The cases are table-driven (`it.each` over a rejected table and an allowed table) rather than one hand-written `it` per case. Fourteen-odd hand-written cases would push the module past the 200-line limit and would restate the same four lines of scaffolding each time; the tables keep each case one readable row.

Sources are synthetic and linted against paths that need not exist, so the cases stay valid as plugins come and go.

Messages are matched on rule id by suffix (`no-restricted-imports`), not by exact equality, so the cases hold whether the base ESLint rule or the typescript-eslint one resolves — the config writes the bare name and `allowTypeImports` is a typescript-eslint option.

## Implementation steps

1. Write `src/eslint-plugin-boundaries.test.ts` with the shared `ESLint` instance, the `boundaryMessages` helper, and the `beforeAll` warm-up — repeated here rather than assumed paid, since the two modules run as separate suites.
2. Add the rejected table: source, synthetic file path, and a fragment of the message that block sets, so a case cannot pass by tripping a *different* block's rule.
3. Add the allowed table: source and synthetic file path, asserting no message at all.
4. Confirm each rejected case fails for the intended reason by checking the message fragment, not merely the count.

## Tests

This entry *is* tests. Verification is that the new module passes, plus a check that it has teeth: temporarily break one block's regex in `eslint.plugin-boundaries.mjs`, confirm the corresponding rejected case fails, and revert.

Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

No runtime code changes and no user-visible behavior. No spec, `help.md`, or `documentation/user-documentation/` updates.

## Out of scope

- Changing any boundary rule. If a case reveals a rule does not do what its comment claims, that is a finding to report, not to fix here.
- Asserting that a block still exists in the exported array. As the backlog entry notes, a block deleted outright is caught only because its own rejected case starts passing where it should fail — which these cases do detect, but by the rejected case failing rather than by an inventory assertion.
- Testing the client feature zones, which `src/eslint-feature-boundaries.test.ts` already covers.
