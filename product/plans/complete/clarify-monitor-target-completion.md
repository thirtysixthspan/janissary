# Clarify monitor target completion

**Complexity: 2/10** — correct one help reference and pin its wording with an existing help-command test; runtime completion and alias resolution stay unchanged.

## Goal

The key reference should describe the candidates offered when completing monitor and unmonitor targets. It currently claims that display titles are offered, but those candidates include tab labels and `group:<n>` selectors only. Display titles remain valid when typed as a target.

## Approach

Scope the display-title completion claim in `help/keys.md` to generic target handling and `tab`. State separately that monitor and unmonitor target arguments complete against tab labels and `group:<n>` selectors, preserving the `unmonitor --all` detail. Pin the help wording in `src/commands.test.ts` and document the monitor-specific completion rule in `product/specs/tab-completion.md`.

## Implementation steps

1. Update the monitor-target completion sentence in `help/keys.md` and add a focused assertion to the existing `help keys` test in `src/commands.test.ts`.
2. Add a monitor-target subsection to `product/specs/tab-completion.md` that distinguishes offered completion candidates from accepted typed display titles.

## Tests

- Assert the rendered `help keys` output says monitor and unmonitor targets complete against tab labels and group selectors, without claiming display-title completion.
- Retain the existing `completeMonitorCommand` target-candidate assertions in `src/completion/handlers.test.ts` to verify labels and groups are offered.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing monitor or unmonitor completion behavior or target resolution.
- Revising monitor command help pages, since they accurately describe display titles as accepted typed targets.
- Updating other user documentation that does not make this completion claim.
