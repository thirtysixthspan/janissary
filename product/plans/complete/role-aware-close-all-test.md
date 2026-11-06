# Role aware close all test

**Complexity: 2/10** — adds one isolated manager test using the existing role settings and session mocks.

## Goal

Cover `AcpSessionManager.closeAll()` with both role sessions active on one tab.

## Approach

- In `src/acp/manager.test.ts`, use the existing role settings seam to start the default ask session and an explicit tell session on one tab.
- Give each start a distinct mocked `AcpSession`, call `closeAll()`, and assert both role identities are gone and both sessions were killed.
- Retain the existing role-specific close, ask-default, and record closure tests.

## Tests

- Add the role-aware `closeAll` case to the `AcpManager role sessions` suite in `src/acp/manager.test.ts`.
- Run `./scripts/run.mjs check-diff` and confirm the focused server tests pass.

## Out of scope

- Changing session lifecycle behavior or adding public APIs.
- Updating functional specs or user documentation; this adds test coverage without changing behavior.
