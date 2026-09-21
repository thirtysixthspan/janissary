# Drain remote shutdown before closing SSH

Complexity: 5/10

## Goal

Ensure closing the final remote harness or agent tab delivers termination frames before its SSH transport is killed.

## Approach

Keep the SSH PTY alive briefly after sending the normal remote cleanup frames. Close it as soon as the peer exits, with a bounded fallback so a broken peer cannot retain the transport indefinitely.

## Implementation steps

1. Add a bounded remote-channel shutdown drain that is canceled by transport exit.
2. Route final remote-session teardown through that drain and cover the ordering in remote-channel tests.
3. Update remote lifecycle specs and user documentation.

## Tests

- Closing a final remote harness or agent channel sends shutdown before its bounded transport close.
- A normal transport exit cancels the pending fallback close.

## Specs / docs

Update `product/specs/remote-server.md` and `documentation/user-documentation/advanced-agents/remote-agents.md`.

## Out of scope

Changing detach behavior, process ownership, or reconnection retries.
