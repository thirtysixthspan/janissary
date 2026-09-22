# Bound detached capture queries

Complexity: 5/10

## Goal

Make a detached `harness capture` query fail promptly without hidden SSH interaction, preserve a remote failure message, and terminate its throwaway relay cleanly after a reply without affecting the parked peer.

## Approach

Use a query-specific SSH command that disables interactive authentication. Give the throwaway channel an explicit deadline, translate its terminal or protocol error into a capture-result error, then send `shutdown` and use the existing shutdown drain before ending the local PTY.

## Implementation steps

1. Add an error-bearing detached capture result and query-specific remote command path while leaving normal remote entry creation unchanged.
2. Bound the detached query lifecycle, report protocol and SSH failures, and drain its explicit shutdown after a successful reply.
3. Cover query authentication, timeout, failure, and shutdown behavior; confirm the relay exits without changing the parked peer.
4. Update the harness and remote-server specifications for bounded detached-query behavior.

## Tests

- Add colocated detached-query lifecycle tests for non-interactive SSH, deadline, failure reporting, and shutdown draining.
- Extend harness capture-subcommand coverage for a visible detached-query failure.
- Extend remote-server tests to prove relay shutdown leaves a parked peer attachable.

## Out of scope

- Interactive remote launch and attach authentication.
- Changes to parked peer expiry or process ownership.
