# Guard writes to a closing remote harness transport

Issue: closing a harness tab reports an EIO PTY write error and can leave the remote harness and workspace running.

Complexity: 3/10

## Goal

Let harness tab cleanup finish when an SSH PTY has already closed between its writable-state check and a final frame write.

## Approach

Treat a synchronous PTY write failure like the existing kill and resize races: mark the session unwritable and ignore the failed late write. The surrounding remote cleanup can then finish its normal shutdown and workspace-release path.

## Implementation steps

1. Catch a synchronous `node-pty` write failure and mark the PTY unwritable.
2. Add coverage proving an EIO-style write neither escapes nor permits later writes.

## Tests

- A PTY write that throws is ignored and makes later writes no-ops.

## Specs / docs

Update `product/specs/remote-server.md` to state that closing a remote harness still ends its remote work when the transport is already closing. No existing help or public documentation needs a change.

## Out of scope

Remote-server protocol redesign, reconnect behavior, and the already-resolved agent-shell reattachment finding.
