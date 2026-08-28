# Stabilize the ESLint feature-boundary test timing

**Complexity: 2/10** — a single test file changes shape; no runtime, lint-rule, or product behavior moves.

## Goal

Stop the CI `tests` job from failing on `src/eslint-feature-boundaries.test.ts`, where the first case exceeds the 5000 ms default test timeout on a loaded runner.

## Approach

The test file builds one `ESLint` instance at module scope, but that constructor is cheap: ESLint resolves and loads `eslint.config.mjs` lazily, on the first `lintText` call. That config imports `typescript-eslint`, four plugin packages, and builds a TypeScript import resolver, so the entire cold start is billed to whichever test happens to run first.

Locally the first case takes ~1350 ms and each of the remaining four takes ~25 ms. On a GitHub runner sharing cores across parallel vitest workers, that one-time cost crosses the 5000 ms default and the case fails while its four identical-shaped siblings pass — the signature of a timing failure, not a rule failure.

Move the cold start into a `beforeAll` hook. The `server` vitest project already sets `hookTimeout: 30_000`, so the config load runs with a budget sized for it, and every case then measures only its own lint. This keeps the test exercising the real repository config rather than a trimmed stand-in, which is the point of the test.

## Implementation steps

1. In `src/eslint-feature-boundaries.test.ts`, add a `beforeAll` hook inside the describe block that calls the existing `boundaryMessages` helper once against a `web/src/` path, discarding the result, so the config load and resolver construction complete before the first case.
2. Leave the assertions, helper, and ESLint instance construction unchanged.

## Tests

- The five existing cases in `src/eslint-feature-boundaries.test.ts` must still pass, and the first case's reported duration must drop to the same order as the other four.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Raising `testTimeout` globally or for the `server` project, which would mask slow tests elsewhere.
- Changing the `import-x/no-restricted-paths` zones or any other lint rule.
- Replacing the real repository config with a trimmed one in the test, which would weaken what the test proves.
- Spec or documentation updates: the change alters no user-visible behavior, and no spec or developer documentation page describes test timeouts.
