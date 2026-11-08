# Native commands: client intercepts and end-to-end verification

**Complexity: 4/10** — browser intercepts and global shortcuts must observe server state and report refusals through the existing notification flow.

## Goal

Make client-side command pickers and equivalent keyboard shortcuts honor the same effective application-wide availability as server dispatch, and verify the full feature across its boundaries.

## Decisions and dependencies

- Depends on work units 1–9. The server remains authoritative: propagate effective availability in shared server state/wire contract rather than maintaining browser policy settings. A blocked keyboard shortcut reports `Command is disabled: <command>.` via the tab-attributed ambient event and respects notification configuration and focus suppression.
- Preserve existing shortcut ownership and all behavior for enabled commands; native ACP access has no effect on human client controls.

## Existing code to reuse

`web/src/shared/command-bar/AppCommandBar.tsx` and its intercepts, `web/src/shared/app-chords.ts`, shortcut handlers, `src/protocol.ts`, server application state, the host policy service and notification path, and the related command-bar, keyboard and notification tests.

## Proposed changes

1. Publish the minimal effective server-owned availability needed by client intercepts and shortcut handlers through the shared wire contract and current state. Route blocked shortcut notifications back through a validated host action or equivalent existing ingress with originating tab attribution; do not rely on client-side refusal as server security.
2. Gate every application-command picker interception and equivalent keyboard shortcut by the canonical policy, including aliases and parents. Preserve normal focus and input behavior for enabled controls. Update keyboard, application state, command and notification specs.
3. Exercise the full integration: command and agent settings survive reopen; Roles reflects restrictions; human and ACP calls are refused; re-enabling restores them. Confirm command completion, queued/scheduled dispatch, plugin access, and current running-session revocation remain coherent with the same server snapshot.

## Tests

Cover all client intercepts and equivalent shortcuts, enabled and disabled states, parent and alias effects, live updates and initial state, exact shortcut notification and attribution, focus/config suppression, and unchanged human behavior for agent-only restrictions. Add integration tests across persistence, topic, role payload, command dispatch and ACP without duplicating unit implementation tests.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused client/server integration tests. In an isolated scratch instance manually open Commands, change both controls, check Roles and a refused human and ACP invocation, re-enable commands, reopen, and verify persistence. Record any environment limitation rather than claiming an unperformed manual check.

## Out of scope

Custom command creation, per-role overrides, and blocking arbitrary operating-system shell commands remain excluded.
