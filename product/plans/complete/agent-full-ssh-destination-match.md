# Match established agent workspaces by full SSH destination

**Complexity: 3/10** — The resolver already compares full SSH destinations for a remote caller; established-workspace lookup needs the same identity rule, with focused command coverage.

## Goal

An agent run borrows an established remote workspace only when its SSH destination, including any user qualifier, matches the requested pathless destination. Explicit project paths continue to provision run-only targets.

## Approach

Pass the parsed full SSH destination to established-workspace lookup. Keep the existing pathless-only guard and same-destination caller check. Extend command tests to prove mismatches in both user-qualified directions provision separately, an exact destination match borrows, and an explicit path remains run-only.

## Implementation steps

1. Change the established-label lookup to compare against `parsed.destination`.
2. Add command tests for both mismatch directions, exact destination borrowing, and explicit-path provisioning.
3. Update the agent-command behavior spec and existing agent-command user documentation, then promote this plan and remove only the selected PR backlog entry.

## Tests

Verify that `host` does not match `admin@host`, `admin@host` does not match `host`, and identical full destinations borrow the existing channel and workspace. Verify `admin@host:/project` provisions a run-only target despite a matching established destination. Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Changing SSH parsing or case normalization, changing remote project path behavior, or resolving any other PR backlog entry.
