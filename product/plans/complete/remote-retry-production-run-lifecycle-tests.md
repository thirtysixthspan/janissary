# Test remote retries through the production agent run lifecycle

**Complexity: 4/10** — The change replaces a local ownership simulation with production run-manager lifecycle calls while leaving remote launch effects mocked. The user waived the task's complexity cutoff.

## Goal

Make the remote retry tests fail if production run admission refuses work after termination or if run cleanup fails to wait for and close an admitted replacement tab.

## Approach

Keep the existing remote channel and tab harness, but attach a real `AgentRunManager` to it and create a real `AgentRun` through the manager. Drive termination through `AgentRunManager.finish`, allowing the production retry funnel, allocation registration, and owned-tab cleanup to run unchanged. Keep the unowned retry test as the compatibility regression.

## Implementation steps

1. Replace the `ownRemoteLaunches` helper with a helper that creates a real manager-owned run using the existing harness caller tab.
2. Exercise late refusal after `finish('terminated')`, asserting no replacement channel or tab is allocated.
3. Start finish from inside the replacement tab allocation, before the retry registers that tab, and assert finish waits, the manager closes the registered replacement, and finish then resolves.
4. Preserve the unowned retry test and remove only the selected entry from the PR backlog.

## Tests

- `src/plugins/launch-tab-remote.test.ts`: production lifecycle coverage for refusal after termination and cleanup of an admitted replacement tab, plus the existing unowned-retry regression.

## Specs and documentation

The existing `product/specs/agent-command.md` already specifies late retry refusal, admitted allocation cleanup, and ordinary unowned retry behavior. This test-only change does not require edits to that spec or public documentation.

## Out of scope

- Changing production retry or run lifecycle code.
- Replacing the mocked remote channel and tab effects with integration infrastructure.
- Altering other PR backlog entries or the PR description.
