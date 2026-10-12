# Honor and validate agent group selectors

**Complexity: 4/10** — Group lookup and monitor placement are localized to agent launch and plugin-tab allocation.

## Goal

Make `agent ... in group <name|id>` select an existing tab group for its monitor and reject unknown or invalid selectors before creating any run, whether the launch is headed or headless.

## Approach

Resolve explicit selectors against currently open tabs using case-insensitive group names and numeric IDs. Unlike shell and harness launches, an agent selector must name an existing group. Preserve the caller's group as the default. Pass the resolved group name to the existing plugin-tab placement preset for headed runs.

## Implementation steps

1. Add an existing-group resolver and validate `launch.group` before local workspace provisioning or remote run creation.
2. Pass an explicit resolved group to the monitor tab opener; leave its group unset when the selector is absent so it inherits the caller's group.
3. Add command tests for named and numeric selectors, invalid named/numeric selectors in headed and headless launches, and caller-group defaulting. Update `product/specs/agent-command.md` and the existing command description in `help.md`.

## Tests

- Verify named selectors resolve without regard to case and numeric selectors resolve by group ID.
- Verify unknown names, unknown positive IDs, zero, and unsafe numeric IDs fail before run creation for headed and headless invocations.
- Verify a headed monitor joins the selected group and an unselected monitor joins the caller's group.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

Creating groups from agent selectors, changing shell or harness group selection, remote execution behavior beyond selector validation, and changing the tab-group model.
