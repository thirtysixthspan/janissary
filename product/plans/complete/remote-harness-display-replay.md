# Restore the remote harness display on reattachment

Issue: reattaching a detached remote harness works, but its screen is blank and its previous history is missing.

Complexity: 5/10

## Goal

Restore retained terminal output and transcript history when a detached harness tab is rebuilt, without waiting for the harness to produce new output.

## Approach

Keep a bounded history of terminal output and rendered transcript blocks on the remote peer while attached and detached. Give the two histories separate budgets so transcript traffic cannot evict a quiet terminal's display. Reattachment redraws each terminal from retained output, starting with a terminal reset to avoid duplicating an existing display. A restore flag distinguishes rebuilding tabs from automatic transport recovery: only rebuilt tabs need previously delivered transcript blocks; automatic recovery receives missed transcript blocks as before. Forward that flag through the relay and bump the protocol version because the peer must honor it. Defer delivery of already-held PTY frames until the caller has installed its screen reader and recorder. Retain the existing live-output path and detached pipe-output queue.

## Implementation steps

1. Add a bounded replay-history module and tests. Integrate it into the detached peer, extend and validate the reattach restore flag through the channel manager and relay, and document the version change in the existing protocol comment. Run check-diff.
2. Make held PTY delivery wait for observer registration. Test replay into a real headless terminal and peer reattachment, including history generated before detach and while detached, repeat reconnection, truncation, and no duplicate transcript replay during transport recovery. Run check-diff.
3. Update remote and sessions specs and existing remote-agent documentation. Promote the plan and restore the empty backlog skeleton after checks pass.

## Tests

- Output produced before and during detachment is replayed to rebuilt terminals without another process spawn.
- Terminal reset makes repeated replay replace the display rather than append a duplicate.
- Fresh tabs receive retained transcript history once; transport recovery receives only missed transcript blocks.
- Retention stays bounded, keeps the newest output even for an oversized chunk, and reports trimming.
- Restore is a validated optional boolean and survives relay forwarding.
- Output held before PTY registration reaches the screen reader installed immediately afterwards, in order with subsequent output.
- Existing detach, pipe completion, termination, and harness round-trip tests remain passing.

## Specs / docs

Update product/specs/remote-server.md, product/specs/sessions-tab.md, and documentation/user-documentation/advanced-agents/remote-agents.md. No help command changes. Note that retained history is bounded and that peers need to start with the updated remote version to retain it.

## Out of scope

Unlimited history, exact display reconstruction after history has been trimmed, new dependencies, terminal geometry restoration, or PR description changes.

## Findings

The observer regression reproduced the lost historical display: only output arriving after registration reached the screen reader. Deferred held-frame delivery preserves its order and restores the previous turn with the current display. Each history retains up to 131,072 UTF-16 code units, separately for terminal output and transcript blocks, and reports truncation. Real-terminal reattachment verifies that previously displayed output arrives again before another command is sent. Five history tests, three protocol validation cases, one peer restoration case, and one observer regression are new; existing peer and lifecycle tests cover repeated restoration and automatic recovery.
