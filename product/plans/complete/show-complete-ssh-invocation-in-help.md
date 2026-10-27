# Show the complete SSH invocation in command help

**Complexity: 2/10** — one command help page needs a corrected signature, pass-through explanation, and examples. The behavior is already specified and covered by SSH parser tests.

## Goal

Make `help ssh` show the complete invocation accepted by the SSH tab, including connection options and a remote command.

## Approach

Follow the canonical `product/plans/complete/help-command.md` plan's per-command help-page format. The SSH tab spec already defines the complete invocation and `src/commands/ssh.ts` passes the submitted command to the SSH manager unchanged, so this is a documentation correction with no runtime change.

## Implementation steps

1. Update `help/ssh.md` to use `ssh <destination> [ssh options…]` and explain that Janissary passes SSH arguments through without interpreting them. Clarify that connection options precede the destination and a remote command follows it.
2. Add a port and identity-file example, plus a remote-command example, matching the forms accepted by the SSH tab.
3. Leave `product/specs/ssh-tab.md` unchanged because it already describes pass-through behavior and these invocation forms. Promote this plan and remove only the completed entry from `product/backlog/pull-request.md`.

## Tests

No new test is needed for a help-page-only change. `src/ssh.test.ts` already covers port and identity options and preserves trailing remote-command tokens. The focused server tests passed with 20 tests across `src/ssh.test.ts` and `src/ssh-manager.test.ts`. `$janissary/scripts/run.mjs check-diff` passed, and the usage and examples were checked against `product/specs/ssh-tab.md` and the SSH command delegation.

## Out of scope

- Changing SSH command parsing, process execution, or tab behavior.
- Revising the SSH behavior spec, which already states the complete contract.
- Resolving any other pull-request backlog entry or changing the pull request description.
