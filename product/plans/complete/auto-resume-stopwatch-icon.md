# Use a stopwatch for the auto-resume flag

**Complexity: 1/10** — the change swaps one registered icon and updates the assertions and existing behavior descriptions.

## Goal

Show a Font Awesome stopwatch for both auto-resume metadata flag states so the icon suggests waiting for a scheduled resume.

## Approach

Change the semantic auto-resume icon export to `faStopwatch`. Keep the flag labels, active green state, and all scheduling behavior unchanged. Update the component test, the metadata-row spec, and the harness user guide, which currently name the wand icon.

## Implementation steps

1. Point `autoResumeIcon` in `web/src/shared/icons.ts` at `faStopwatch` and update the two auto-resume icon assertions in `web/src/shared/AgentTabMeta.test.tsx`.
2. Describe the stopwatch glyph in `product/specs/tabs.md` and `documentation/user-documentation/advanced-agents/harness.md`.
3. Run the diff-scoped checks, promote this plan, and remove the resolved issue from the backlog.

## Tests

- `web/src/shared/AgentTabMeta.test.tsx`: both the armed and waiting auto-resume flags render `svg[data-icon="stopwatch"]`; the auto-resume flag remains distinct from the auto-approve bolt.

## Spec updates

- `product/specs/tabs.md` § Metadata row.

## Documentation

- `documentation/user-documentation/advanced-agents/harness.md` § Resuming after a usage limit.

## Out of scope

- Changes to auto-resume scheduling, labels, flag colors, or auto-approval.
- Changes to `help.md`, which does not describe the flag glyph.
