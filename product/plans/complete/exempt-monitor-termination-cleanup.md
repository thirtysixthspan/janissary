# Exempt monitor termination cleanup from the plugin deadline

**Complexity: 2/10** — The change is confined to one capability, its focused tests, and the monitoring behavior spec.

## Goal

Allow a monitor to await host-owned agent-run cleanup without charging that cleanup to the monitor plugin's five-second handler budget.

## Approach

Keep the existing monitor-tab-to-run binding and unavailable-run rejection. Use the handler's existing `deadline.exempt` only around `managers.agent.finish`; cleanup's ACP and remote-release bounds remain owned by the agent lifecycle. Plugin code before and after that call remains subject to the five-second deadline.

## Implementation steps

1. Wrap `managers.agent.finish` in the optional handler deadline exemption.
2. Add monitor-intent coverage where cleanup exceeds the handler timeout but eventually settles without disabling the plugin or closing its tab. Cover rejection when the bound run is missing.
3. Update `product/specs/agent-command.md` to describe the termination behavior.

## Tests

Use the plugin host's short configurable handler timeout and delayed agent cleanup to verify the monitor remains active and open after termination completes. Verify a missing bound run is rejected and leaves the plugin active.

## Out of scope

Changing the five-second plugin-code budget, removing ACP or remote cleanup bounds, changing monitor binding, or altering general deadline behavior.
