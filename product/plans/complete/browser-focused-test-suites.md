# Split browser coverage into focused test suites

**Complexity: 6/10** - this is a test-only reorganization across browser, remote, sandbox, and harness modules. The risk is mock or lifecycle drift while moving assertions.

## Issue

The browser feature created a 329-code-line `e2e-server.test.ts`, pushed `remote/serve-processes.test.ts` past the 200-line limit, and added large browser blocks to the already oversized sandbox and harness-manager suites. The coverage is correct but difficult to navigate, and unrelated cases now share browser-specific mutable mocks.

## Approach

Extract cohesive browser suites without changing production code or assertions. Browser-server tests share one colocated fixture that owns their hoisted mocks and per-case reset, with launch-contract assertions separate from lifecycle and cleanup. Remote browser ownership moves out of the credential suite. Sandbox profile and browser-environment assertions move into a browser-specific sandbox suite. Harness browser wiring gets a small fixture and separate local and remote suites, leaving the pre-existing manager suite no larger than it was before the feature.

## Implementation

1. Replace `e2e-server.test.ts` with `e2e-server-launch.test.ts`, `e2e-server-lifecycle.test.ts`, and a shared `e2e-server-test-fixture.ts` that preserves the current hoisted mocks, real port allocator, and reset behavior.
2. Move all browser-specific `RemoteProcesses` cases to `serve-processes-browser.test.ts`; leave forwarded-credential coverage in `serve-processes.test.ts`.
3. Move the browser port-band, Playwright binding, profile selection, and credential-free environment cases from `sandbox/index.test.ts` to `sandbox/browser-spawn.test.ts`.
4. Move local and remote `HarnessManager` browser cases to focused files backed by a colocated browser fixture. Remove browser-only mocks from the general manager suite.
5. Count code lines in every new and expanded file and keep each at or below 200, excluding blank and comment-only lines as the lint rule does.
6. Update PR #975's test inventory to name the extracted suites and their preserved case counts.
7. Remove only this resolved backlog entry after every moved suite passes.

## Tests

Run every extracted test file alone, then run the complete server project to expose shared-module or mock-isolation mistakes. Run `./scripts/run.mjs check-diff` after the reorganization. Compare test counts before and after and inspect the diff to confirm every assertion moved rather than disappeared.

## Documentation

No product spec or user documentation changes. This changes only test organization. The completed plan records the new suite boundaries, and the PR description's test inventory follows the final filenames.

## Out of scope

- Changing browser, sandbox, remote, or harness behavior.
- Refactoring pre-existing non-browser test monoliths beyond removing the feature's additions.
- Compacting tests to satisfy the line limit.

## Verification result

The extracted suites pass alone with the preserved totals: 36 browser-server cases, 18 remote-process cases, 45 sandbox cases, and 87 harness-manager cases. `./scripts/run.mjs check-diff` passes lint, typechecking, and the diff-selected server tests. The macOS `/var` versus `/private/var` fixture mismatch originally exposed by a complete run was subsequently corrected by canonicalizing the remote-serve suite's temporary root. With a scoped timeout for the ESLint boundary cases under full-suite contention, `npm run test:server` passes all 3,896 cases across 287 files.
