# Disable Claude Code autoupdater in harness launches

**Complexity: 2/10** — the Claude harness launch already has a centralized environment override and focused tests; this adds one variable and updates the matching behavior assertions.

## Goal

Set `DISABLE_AUTOUPDATER=1` whenever Janissary launches Claude Code as a harness, so the harness does not attempt to update itself during a session. Other harnesses keep their existing environment unchanged.

## Approach

Extend the existing Claude-only PTY environment override in `HarnessManager` and cover the exact environment for Claude launches alongside the existing opencode distinction.

## Implementation steps

1. Add `DISABLE_AUTOUPDATER: '1'` to the Claude-specific environment passed to the PTY.
2. Update the harness manager tests to assert the new variable for direct and profile Claude launches and to preserve the undefined override for opencode.
3. Update the harness functional spec with the Claude launch environment behavior.
4. Move this plan to `product/plans/complete/` and remove the fixed issue.

## Tests

- Verify direct Claude launches pass both Claude-specific environment variables.
- Verify profile Claude launches pass both variables.
- Verify opencode launches still receive no extra environment override.
- Run `./scripts/run.mjs check-diff` after each implementation step and before merging.

## Out of scope

- Changing environment variables for opencode, codex, SSH, shell, or inline PTY launches.
- Changing Claude command arguments or the existing temporary-directory behavior.
- Adding a new user-facing documentation section for an environment variable that current public documentation does not describe.
