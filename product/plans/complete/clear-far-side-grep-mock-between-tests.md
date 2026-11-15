# Clear the shared far-side grep mock between tests

**Complexity: 1/10** — test-isolation only: no production lines or files, 1 requirement and 1 scenario (p=2.32244).

## Issue

`src/remote/serve-acp-loop.test.ts` hoists one `grepWorkspaceCommand` mock and installs it through the `vi.mock('../file-grep/grep.js')` factory with the real implementation. Several cases count calls on that mock: the ungranted, disabled, and agent-off refusal cases assert it was never called, the `withoutTools` case asserts it was never called, the eight-step cap asserts exactly eight calls, the abort-before-execution case asserts it was never called, and the late-result suppression case asserts one call. The file only clears it inside two individual tests: the agent-run refusal case and the far-workspace routing case. Nothing resets its call history at the start of a test, so the refusal and loop-preservation assertions depend on the runner clearing mocks for them.

Vitest 5's `configDefaults` sets `clearMocks: true`, and this project's `vitest.config.ts` does not override it, so the suite passes today: the runner clears every mock's call history before each test. That default is the only thing keeping the grep assertions honest. Running the file with `clearMocks: false` reproduces the failure the review describes: the refusal and loop-preservation cases see calls from earlier tests, and seven cases fail, including the eight-step cap at 17 calls and the late-result case at 18. The isolation the assertions rely on is therefore unstated in the test file and depends on a runner default a future per-project config change could remove.

## Goal

State the shared grep mock's per-test isolation in the test file itself: clear `mocks.grepWorkspaceCommand` in the file-level `beforeEach`, so every grep-related assertion counts only the calls its own test made, whether or not the runner's `clearMocks` default is in effect. Keep the mock's real implementation, the deliberate `mockImplementationOnce` rejection case, and every existing assertion unchanged, and leave production code untouched.

## Approach

1. Add `mocks.grepWorkspaceCommand.mockClear();` to the existing file-level `beforeEach` in `src/remote/serve-acp-loop.test.ts`, beside the temporary-directory setup.
2. Use `mockClear`, not `mockReset` or `mockRestore`. `mockClear` drops call history only; it keeps the implementation the mock factory installed from the real module and keeps a queued `mockImplementationOnce` in place for the case that installs it. `mockReset` would remove the real implementation, and `mockRestore` would not apply because the mock is created with `vi.fn()` in `vi.hoisted`.
3. Leave the per-test clear in the far-workspace routing case as it is. It is now redundant with the file-level hook but harmless, and the case's own comment-free clear keeps it readable on its own.
4. Do not touch the `vi.mock('../file-grep/grep.js')` factory, the glob mock, the agent-run refusal case's clears, or any production file.

## Implementation steps

1. In `src/remote/serve-acp-loop.test.ts`, add `mocks.grepWorkspaceCommand.mockClear();` as the last statement of the file-level `beforeEach` that creates `workspace` and `homeDir`.
2. Confirm `mockClear` is the only new call: the `vi.mock` factory still installs `actual.grepWorkspaceCommand`, and the rejection case at `emits the existing nonfatal acp-error for an unexpected rejection` still uses `mockImplementationOnce`.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new cases. The change is test isolation, and the existing 48 cases are the coverage. Verification must show two things:

- The server project passes `src/remote/serve-acp-loop.test.ts` with the repo config as it stands.
- The same file passes with a temporary config that sets `clearMocks: false`, proving the file-level clear alone isolates the mock. The temporary config lives under the gitignored `temp/` and is not committed.

Both runs must show all grep cases passing alongside the existing glob and agent-run cases, and no assertion may be weakened.

## Verification

`$janissary/scripts/run.mjs check-diff` reports no lint, typecheck, or test failure. `npx vitest run --project server src/remote/serve-acp-loop.test.ts` passes all 48 cases. Running that file through a temporary `temp/` config with `clearMocks: false` also passes, where before the change it failed seven cases. `git diff` shows one added line in the test file and nothing in `src/`.

## Specs and docs

No user-visible behavior changes. `product/specs/acp.md` already describes far-side grep routing, refusals, the eight-step cap, and cancellation suppression; the test file's isolation does not alter any of it, so no spec changes. Neither `help/` nor `documentation/user-documentation/` documents test internals, so no documentation changes.

## Out of scope

- Any production change in `src/acp/`, `src/remote/`, or `src/file-grep/`.
- The `vi.mock('../file-grep/grep.js')` factory, the mock's real implementation, and the deliberate `mockImplementationOnce` rejection case.
- The glob mock's clears and any other test file's mock setup.
- Changing the project's Vitest `clearMocks` default.
