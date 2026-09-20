# Reattach sessions from a local transport directory

Issue: reattaching an agent that has been detached opens the tab, pauses than closes the tab without error. the needs to be resolved and any error should go to the notification tab.

Complexity: 4/10

## Goal

Reconnect to a parked agent even when its remote workspace path does not exist locally, and report unsuccessful attempts in Notifications.

## Approach

The recorded workspace is remote, but reattachment passes it as the local SSH process's working directory. At the shared remote connection boundary, use the application's local working directory for resumed transports while retaining the recorded directory for remote readiness. This also covers harness reattachment and the connection used to end a parked session. Report failed outcomes and unexpected promise rejections through the existing sessions notification path, preserving the record for another attempt.

## Implementation steps

1. Fix the resumed SSH working directory and add connection regression tests for successful readiness and failed connection notification handling. Add session-action reporting for unsuccessful and rejected attempts. Run check-diff.
2. Update the sessions specification and the existing remote-agent lifecycle documentation to describe reattachment, recovery, and error reporting. Remove the resolved entry and promote the plan after validation.

## Tests

- Resumed transports start in the local application directory, while accepted readiness still returns the remote workspace.
- Connection failures produce exactly one notification containing the session, host, and reason, and keep the parked row and record.
- Unexpected reattach rejection also reports the reason and preserves the record without an unhandled rejection.
- Successful reattachment retains the existing single notification behavior.

## Specs / docs

Update product/specs/sessions-tab.md and the Lifecycle section of documentation/user-documentation/advanced-agents/remote-agents.md, whose current claim that reattachment is unavailable contradicts this behavior. No help text describes remote reattachment.

## Out of scope

New remote protocols, session discovery, harness detach lifecycle, and PR description changes.
