# Correlate concurrent capture requests

Complexity: 5/10

## Goal

Let concurrent capture requests for one process settle independently and settle every pending request if its transport is lost.

## Approach

Add a request id to the capture wire frames, key pending resolvers by it, and discard all outstanding requests before reconnecting.

## Implementation steps

1. Add and validate the correlation id across capture request and reply forwarding.
2. Track resolvers by request id and settle them on transport close.
3. Add tracker and channel coverage for concurrent, late, and lost-transport replies.
4. Update the remote protocol specification.

## Tests

- Cover overlapping out-of-order replies and late replies in a tracker test.
- Cover recoverable transport loss in the channel tests.

## Out of scope

- Changing capture storage or parked-session expiry.
