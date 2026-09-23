# Deliver Notifications When the Docked Feed Is Hidden

**Complexity: 6/10** — server delivery must account for client-local sidebar selection, and burst escalation must send a one-shot selection request to every client while retaining the server's queue and burst decisions.

## Goal

Show a toast when a docked notifications feed is behind another sidebar view, and make escalation reveal an already docked feed in its sidebar without changing the center tab.

## Approach

Treat docked visibility as client-local. The server sends ordinary toasts unless the center feed is active, while each client's toast bridge suppresses incoming toasts only when its notifications body is selected. On escalation, the server keeps the feed docked and sends a one-shot reveal signal so each client selects it.

## Implementation steps

1. Add a notifications reveal event from the server through the shared protocol and WebSocket client.
2. Change server toast routing for docked feeds and let each client report its selected notifications body to the toast bridge.
3. Make escalation request sidebar selection and verify queue delivery and center-tab preservation.
4. Update the notifications spec and the PR description's visibility claims.

## Tests

- A docked feed does not suppress the server toast; a client showing its notifications body suppresses that toast.
- Selecting another sidebar tab reports the feed hidden; a reveal event selects the notifications body.
- Burst escalation clears toasts, sends the reveal event, and leaves the active center tab in place.
- WebSocket clients receive and unsubscribe from the reveal event.

## Out of scope

- Persisting sidebar selection across reloads.
- Changing the notification queue or burst threshold.
