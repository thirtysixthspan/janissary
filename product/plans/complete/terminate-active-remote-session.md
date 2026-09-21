# Terminate active remote sessions from Sessions

**Complexity: 4/10** — the Sessions row already owns the confirmation UI and the remote manager already owns complete channel teardown; this change connects those established paths and covers their shared-session behavior.

## Goal

Let the launching row of an active remote session offer **Terminate**, ending the remote session and removing every tab that shares its channel.

## Approach

Add `terminate` to launch-row actions for active and reconnecting channels. When termination targets a live channel, report the deliberate termination once and close it through `RemoteManager.close`, which sends shutdown and runs every owning tab's close handler. Parked-session termination continues using its existing reconnect-and-terminate flow.

## Implementation steps

1. Offer `terminate` on a live channel's launching row while keeping joined rows limited to their existing actions.
2. Route a terminate action for a live session through the remote manager's complete close lifecycle and retain the parked-session path unchanged.
3. Add row-composition and manager coverage for the visible control, full shared-tab teardown, and notification behavior.

## Tests

- `src/sessions/rows.test.ts` — verifies active and reconnecting launch rows offer termination while joined rows do not.
- `src/sessions/manager.test.ts` — verifies terminating a live session closes every channel tab, removes its session record, and reports the deliberate end once.

## Specs

- `product/specs/sessions-tab.md` — describe termination for active sessions and its tab-removal result.

## Docs

- `documentation/user-documentation/advanced-agents/remote-agents.md` — update the Sessions action description to include active-session termination.

## Out of scope

- Changing the confirmation dialog, parked-session termination protocol, or ordinary connection-close behavior.
