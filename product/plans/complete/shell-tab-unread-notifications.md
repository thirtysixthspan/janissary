# Badge and notify when a background shell tab finishes work

**Complexity: 7/10** — The shell plugin reports command transitions through its own intent, while unread badges and delayed waiting notifications belong to the host. The change adds a narrow plugin capability and reuses the existing harness escalation lifecycle.

## Goal

When a shell tab's command finishes in the background, show its unread badge and use the same delayed waiting notification as a harness tab. Clear the badge and pending notification when the shell starts working again.

## Approach

Add a capability that changes unread state only for a tab owned by the calling plugin. Raising a badge arms the existing 30 second idle escalation only when the tab was eligible; clearing the badge cancels the escalation. The shell command-state intent calls it on busy-state transitions.

## Implementation

1. Add and document the `setUnread(instanceKey, unread)` plugin capability, including its badge and idle-notification behavior, without changing the compatible API version.
2. Have shell command-state transitions clear unread state when work starts and raise it when a previously running command finishes.
3. Test capability ownership, shell transition handling, and the delayed notification lifecycle; update the shell-tab and tab-plugin specs.

## Tests

- Verify the capability affects only an open tab owned by the plugin, and does not arm a notification when unread marking is ineligible.
- Verify shell command-state transitions raise and clear unread state at the expected times.
- Run the diff-scoped lint, typecheck, and related server and web tests.

## Out of scope

- Changing unread dwell behavior or the harness notification delay and wording.
- Adding unread state to plugin payloads or changing the wire protocol.
