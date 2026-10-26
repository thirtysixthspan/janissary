# Notify when remote protocol versions differ

**Complexity: 3/10**

## Goal

When a remote launch fails because its peer speaks a different protocol version, report that failure to the notifications feed as well as the placeholder tab. This makes the mismatch visible even when the user has moved away from the tab.

## Approach

The remote channel already rejects an incompatible handshake with a specific message, and the remote entry factory already forwards it to the launch failure handler. In that error callback, recognize the handshake mismatch and send the existing `launch-refused` notification attributed to the launching tab. Other connection and provisioning errors keep their current behavior.

## Implementation steps

1. Update `src/remote/entry-factory.ts` to notify on the protocol-version mismatch error only.
2. Add a focused test for the notification, keeping unrelated remote failures unnotified.
3. Update `product/specs/remote-server.md` to document the notification alongside the placeholder error.

## Tests

- Verify a protocol-version mismatch raises a `launch-refused` notification with the mismatch text.
- Verify an unrelated remote launch failure does not raise that notification through this new path.

## Out of scope

- Changing the handshake error text or protocol compatibility rules.
- Adding notification event types or changing the presentation of other remote failures.
- Updating user documentation, which does not currently promise notification behavior for this failure.
