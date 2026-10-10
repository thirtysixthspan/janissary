# Reuse the jsdom client test environment

**Complexity: 2/10** — one Vitest project setting and a short testing spec update; no application code changes.

## Goal

Reduce the repeated jsdom setup cost in the client test suite while preserving isolation between test files.

## Approach

Set the client Vitest project to use `vmThreads`. Vitest creates the jsdom environment once per worker with this pool while retaining per-file isolation. Keep the existing setup file and React Testing Library cleanup hook unchanged.

## Implementation steps

1. Set `pool: 'vmThreads'` on the `client` Vitest project only.
2. Add a concise testing spec that records client tests' per-file DOM and module isolation contract and worker-level environment reuse.

## Tests

- Run the complete client project with `npm run test:client` and confirm all existing tests pass without state leaking between files.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Disabling isolation with `isolate: false`.
- Changing test setup, cleanup, worker counts, or other Vitest projects.
- Public documentation updates; no public documentation describes the test runner's environment setup.
