# Prove the remote ACP tab never reads its workspace locally

**Complexity: 1/10** — 0 production lines, 0 production files, 0 new units; one test requirement and one scenario in `src/acp/run-prompt.test.ts` (p=2.32)

`runCorePrompt` builds an `AcpToolHost` whose `runWorkspace` calls `readFileInTab` from `src/file-read/tab-read.ts`. On a remote session, `runToolLoop` hands only `host.runCaller` to `session.run`, so the far side receives no workspace runner and the local process must never read the tab's workspace. The replacement case `leaves a remote tab's workspace read to the far side, never the local disk` in `src/acp/run-prompt.test.ts` currently asserts only that `session.run` was called once and `dispatchNativeLine` was not. It never observes `readFileInTab` or `runAcpToolLoop`, so a regression that drove the local loop or invoked the local workspace runner from the remote path would still pass.

## Goal

The remote-tab case proves the local workspace runner is never invoked: after `start('ask', ['file read'])`, a spy on `readFileInTab` has no calls and `mocks.runAcpToolLoop` has no calls. The existing captured `startCommand`/`ranCommand` calls stay, so the case still shows the far-side workspace step being transcribed without a local read. The local-session file-read cases keep their current behavior and assertions.

## Approach

Mock `src/file-read/tab-read.ts` in the test module with its real exports, replacing only `readFileInTab` with a hoisted `vi.fn` that delegates to the actual function by default. Delegation keeps the local-session cases, which reach `readFileInTab` through `deps.runCommand` → `host.runWorkspace`, behaving exactly as before. The remote case clears that mock immediately before starting the prompt, then asserts it was never called along with the already-imported `mocks.runAcpToolLoop`.

This observes the same function behind `host.runWorkspace` without changing production code. The `runToolLoop` lower-layer guard in `src/acp/drive-loop.test.ts` stays as it is.

## Implementation steps

1. In `src/acp/run-prompt.test.ts`, add `readFileInTab: vi.fn()` to the existing `vi.hoisted` mocks object.
2. Add a `vi.mock('../file-read/tab-read.js', ...)` factory that imports the actual module, sets the hoisted mock's implementation to `actual.readFileInTab`, and returns the actual exports with `readFileInTab` replaced by the hoisted mock.
3. In the remote-tab case, call `mocks.readFileInTab.mockClear()` before `start('ask', ['file read'])`.
4. After the captured `startCommand`/`ranCommand` calls, assert `mocks.readFileInTab` was not called and `mocks.runAcpToolLoop` was not called, keeping the existing `run`, `runCaller`, and `dispatchNativeLine` assertions.
5. Run `$janissary/scripts/run.mjs check-diff` and confirm the server test for `src/acp/run-prompt.test.ts` passes.

## Tests

One existing test is strengthened: `leaves a remote tab's workspace read to the far side, never the local disk`. It gains the two never-called assertions. The local file-read cases are the regression cover for the delegating mock and must pass unchanged. Verify with the server test for `src/acp/run-prompt.test.ts` and with `check-diff`.

## Specs and documentation

None. No user-visible behavior changes; `product/specs/acp.md` already states that a remote tab runs the loop on its own host and resolves workspace reads against that host's clone. No help page or user documentation describes the test.

## Out of scope

- Any production change in `src/acp/` or `src/file-read/`.
- Changing the local-session file-read cases or the `host.runWorkspace` guard in `src/acp/drive-loop.test.ts`.
- Adding new test files or covering other remote-session paths.
