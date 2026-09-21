# Terminate an unanswered remote reattach

Complexity: 4/10

## Goal

End a remote session when it accepts a reattach but does not report its running processes, so the temporary restored tab, remote server, and stale session record do not remain behind.

## Approach

Treat the bounded process-state timeout as a terminal inconsistency after an accepted reattach. Close the reattached channel through the normal remote lifecycle, which sends shutdown, closes the placeholder tab, and lets the sessions action remove its record.

## Implementation steps

1. Change accepted reattach settlement to close an unanswered session and return an ended result.
2. Update the reattach unit tests to assert the remote close and terminal outcome.
3. Update the remote-session functional and user documentation to describe the terminal outcome.

## Tests

- An accepted reattach with no process-state reply closes the remote channel and reports the session ended.

## Specs / docs

Update `product/specs/remote-server.md`, `product/specs/sessions-tab.md`, and `documentation/user-documentation/advanced-agents/remote-agents.md`.

## Out of scope

Changing timeout behavior before a peer accepts reattachment, reconnect backoff, or normal remote-tab closure.
