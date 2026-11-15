# Assert the malformed-pattern ACP tests perform no content reads

**Complexity: 1/10** — test-only repair: no production lines or files, 2 requirements and 2 scenarios (p=2.75791).

## Issue

Both ACP entry-point tests named `reports a malformed regex before a contained secret is read` stop at the diagnostic text. The local case in `src/acp/run-prompt.test.ts:964` also asserts that the separate `readFileInTab` fallback was not used. The far-side case in `src/remote/serve-acp-loop.test.ts:641` asserts only the returned text. Neither test observes the grep engine below its entry point, so an implementation that resolved the path, discovered workspace candidates, or opened the `.env` fixture before returning the diagnostic would still pass both. That contradicts `product/plans/complete/file-grep-15-acp-loop.md:44`, which requires scoped defining-module spies because fixture contents alone do not prove no reads.

The production order being protected is in `src/file-grep/grep.ts:38-49`: `grepWorkspace` returns the diagnostic from `diagnostic(args)` before `resolveGrepTarget`, `discoverGrepCandidates`, and `scanFiles`. The two suites already run the real engine: `src/acp/run-prompt.test.ts` mocks `grepFilesInTab` with the actual implementation (`:57-61`), and `src/remote/serve-acp-loop.test.ts` mocks `grepWorkspaceCommand` with the actual implementation (`:30-34`). Only the seams below those entry points are unobserved.

## Goal

Make each named test prove that the malformed-pattern command performs no workspace discovery and no candidate content read, not merely that it prints the right text. Add scoped spies on the two defining modules `src/file-grep/candidates.ts` and `src/file-grep/scan.ts` around each command, assert both record zero calls, and restore both in `finally`. Keep every existing assertion, fixture, and production file byte-for-byte unchanged.

## Approach

1. Spy on `discoverGrepCandidates` from `src/file-grep/candidates.ts` and `scanFiles` from `src/file-grep/scan.ts`.
   - `discoverGrepCandidates` is the workspace entry point: it lists project files and runs the include/exclude filter worker. A zero-call assertion proves no workspace listing or filter work.
   - `scanFiles` is the content entry point: it creates the candidate reader, which performs the only `readFile` of candidate contents, and runs the matcher. A zero-call assertion proves no content read.
   - Spy on both rather than one. `scanFiles` alone proves no content read but not no workspace work; `discoverGrepCandidates` alone would still leave an alternate content path unobserved.
2. Do not spy on `grepWorkspace`, `grepWorkspaceCommand`, or `grepFilesInTab`. Those entries must be called to produce the diagnostic, so a not-called assertion there would be wrong, and in the far-side suite `grepWorkspaceCommand` is already the hoisted mock under test.
3. Verify the namespace spy is observable before trusting the negative assertion. Vite's SSR transform compiles project-module imports into module-namespace property reads, so a `vi.spyOn` on the imported namespace replaces the property `grep.ts` reads at call time. Two checks confirmed this in the checkout:
   - A temporary probe test called `grepWorkspace` with a valid pattern and saw exactly one call on both spies, then called it with `[unclosed` and saw zero calls on both.
   - A temporary production reorder that moved discovery and scan ahead of the diagnostic made both new assertions fail, so they are not vacuous.
4. Keep the local `expect(mocks.readFileInTab).not.toHaveBeenCalled()` assertion. It still proves the dispatch did not fall through to file read, which is a separate guarantee from the engine seams.
5. Scope each spy to its own test and restore in `finally`, so the other cases in each suite keep the real functions.

## Implementation steps

1. In `src/acp/run-prompt.test.ts`, add runtime namespace imports for `../file-grep/candidates.js` and `../file-grep/scan.js` beside the existing file-grep imports.
2. In `it('reports a malformed regex before reading a contained secret')`, create the two spies before invoking `deps.runCommand`, wrap the invocation and assertions in `try/finally`, assert `discoverGrepCandidates` and `scanFiles` were each not called after the diagnostic assertion, and restore both spies in `finally`.
3. In `src/remote/serve-acp-loop.test.ts`, add the same two runtime namespace imports.
4. In `it('reports a malformed regex before a contained secret is read')`, create the two spies before `start(...)`, wrap the existing waits and assertions in `try/finally`, assert both spies were not called after the diagnostic assertion, and restore both in `finally`.
5. Run `$janissary/scripts/run.mjs check-diff` after the local change and again after the far-side change.
6. Verify non-vacuity once with a temporary edit to `src/file-grep/grep.ts` that moves `discover` and `scanFiles` ahead of the diagnostic; both named tests must fail. Revert that file with `git checkout -- src/file-grep/grep.ts` and rerun both tests to confirm they pass.

## Tests

No new cases. The two existing named cases are the coverage, strengthened with two scoped spy assertions each. Verification must show:

- Both named cases pass with the spies recording zero calls.
- Both fail when the diagnostic is temporarily moved after discovery and scan.
- Every other case in `src/acp/run-prompt.test.ts` and `src/remote/serve-acp-loop.test.ts` still passes, proving the spies are restored and do not leak between tests.
- `check-diff` reports no lint, typecheck, or test failure.

## Specs and docs

No user-visible behavior changes. `product/specs/acp.md:178` and `:184` and `product/specs/remote-server.md:296` already state that a malformed expression is reported before path policy and disk work, and that a contained secret with a valid pattern is no matches without reading contents. This change only makes the tests prove what those specs already require, so no spec or documentation file changes.

## Out of scope

- Any production change in `src/file-grep/`, `src/acp/`, or `src/remote/`, including the diagnostic order itself.
- Changing fixture paths or secret text.
- Changing the `vi.mock` factories for `tab-grep.js` and `grep.js` or their real implementations.
- Widening the spies to unrelated filesystem calls such as `lstat` or `realpath`.
- Adding positive-control cases or a shared spy helper beyond the two scoped tests.
