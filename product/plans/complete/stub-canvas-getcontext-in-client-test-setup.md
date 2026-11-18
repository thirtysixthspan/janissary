# Remove the jsdom canvas getContext warning from the client test suite

**Complexity: 1/10** — no production lines or files (test setup plus one test and a spec edit), 2 requirements, 1 scenario (p=2.61).

## Goal

Running the client Vitest project no longer prints `Not implemented: HTMLCanvasElement's getContext() method: without installing the canvas npm package` to stderr, without adding the `canvas` npm package as a dependency.

## Root cause

The client test project (`vitest.config.ts`, `client`) runs in jsdom. jsdom's `HTMLCanvasElement.prototype.getContext` is a stub that calls `notImplemented()`, which reports that exact warning on the virtual console whenever it is called. Client code that measures text or captures video/image frames creates a canvas and calls `getContext('2d')`. Most tests that exercise those paths spy on `getContext` and supply a fake context, but the many tests that mount real tabs reach canvas through xterm's renderer without mocking it, so jsdom's warning fires on every one of those calls. The warning is noise: jsdom returns a falsy value, and the production code already treats a missing context as a supported case.

## Approach

Install a single, unconditional stub on `HTMLCanvasElement.prototype.getContext` in the client test setup file so jsdom's unimplemented method is never reached. The stub returns `null`, preserving the falsy "no canvas available" behavior the code already handles. Existing tests that spy on `getContext` continue to override it and are restored back to this stub after each test. No application code and no dependency changes.

## Implementation steps

1. In `web/src/test/setup.ts`, assign `HTMLCanvasElement.prototype.getContext` a function returning `null`, so canvas requests in the jsdom environment resolve to "unavailable" without emitting jsdom's not-implemented warning. Include a short why-comment, matching the file's existing comment style.
2. Add `web/src/test/setup.test.ts` with a regression test asserting that a freshly created canvas's `getContext('2d')` returns `null`, proving the setup stub is installed for every client test file.

## Tests

- `web/src/test/setup.test.ts`: `canvas getContext is stubbed to return null` calls `document.createElement('canvas').getContext('2d')` and expects `null`.
- Verification via `./scripts/run.mjs check-diff`: the new test passes and a plain `npm run test:client` run no longer contains the `getContext` not-implemented warning in its stderr.

## Specs and documentation

Update `product/specs/testing.md` under "Client test isolation" to state that canvas `getContext` is stubbed to return null in the client test environment so jsdom's unimplemented-canvas warning is not emitted and no native canvas package is needed. No user-facing behavior changes, so `help/` and `documentation/user-documentation/` need no update.

## Out of scope

- Installing the `canvas` npm package or any native canvas dependency.
- Stubbing other unimplemented jsdom APIs (e.g. `toDataURL`, `HTMLMediaElement.play`, navigation) that emit their own unrelated warnings; the issue names only `getContext`.
- Changing application canvas code or the individual tests that already mock `getContext`.
