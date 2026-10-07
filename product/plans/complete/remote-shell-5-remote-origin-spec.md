# Clarify remote shell origin behavior

**Complexity: 1/10** — remove a contradictory phrase from the remote-server behavior spec.

## Goal

State unambiguously that standalone remote shells can be launched from local tabs and that nested remote shell launches from remote tabs are refused.

## Approach

Align the standalone remote shell paragraph in `product/specs/remote-server.md` with `product/specs/shell-tab.md` and the existing nested-launch refusal.

## Implementation

- Replace the claim that a remote shell opens even when its source tab is remote with the local-tab launch condition.
- Keep the sentence stating that remote-tab launches are refused.

## Tests

- Run `./scripts/run.mjs check-diff` and confirm the spec states the same origin rule as the shell behavior spec.

## Out of scope

- Runtime behavior changes.
- User-facing documentation changes.
