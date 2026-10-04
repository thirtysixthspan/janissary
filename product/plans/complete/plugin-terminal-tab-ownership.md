# Bind plugin terminal access to its owning tab

**Complexity: 8/10.** Plugin terminal attachments cross the client RPC boundary and the server's shared PTY registry, so authorization must cover attachment, input, and resize while preserving the ordinary terminal paths.

## Goal

Prevent a plugin tab from attaching to or controlling a terminal owned by another tab, even when the other PTY identifier is known.

## Approach

Use a server authorization request for plugin attachment and carry the host supplied tab label with plugin input and resize requests. Resolve ownership from the PTY manager's live registry, the same source used to reap terminals when tabs close. Keep other terminal surfaces on their existing RPC behavior.

## Implementation

1. Add a result RPC that authorizes a plugin terminal attachment only when the PTY is live and owned by the requesting tab.
2. Make plugin terminal attachment wait for authorization before registering its output listener.
3. Bind plugin input and resize messages to their capability's tab label and ignore operations whose PTY owner does not match.
4. Preserve compatibility with the shell hook and test owned attachment/control plus cross-tab refusal.
5. Update the shell tab spec, run diff checks, and remove the resolved PR backlog entry.

## Tests

`./scripts/run.mjs check-diff` passes. The focused tests cover allowed and refused attachment, owned and refused input/resize, and retain shell terminal byte, resize, and exit behavior.

## Out of scope

Changing terminal routing for harnesses, terminal cards, shell takeovers, or remote sessions.
