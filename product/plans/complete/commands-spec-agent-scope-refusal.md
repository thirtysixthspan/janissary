# Correct the commands spec's agent-scope example

Issue: `product/specs/application-commands.md` says `commands disable agent agent` changes agent access for `agent`, but the topic refuses that edit with `Not a native ACP command: agent.` because `agent` is not a native ACP command. The plan's test and the implementation both expect the refusal.

Complexity rating: 1/10

## Goal

Make the spec describe what the command grammar and the topic actually do: `commands disable agent agent` is parsed as an agent-access change for `agent`, then refused because `agent` is not a native ACP command.

## Approach

Rewrite only the example sentence in the `commands` section of `product/specs/application-commands.md`. Keep the `commands disable agent` example that shows the selector rule, and keep the exact-error paragraph unchanged. No code or test change is needed because the implementation already refuses the edit.

## Implementation steps

1. In `product/specs/application-commands.md`, replace the claim that `commands disable agent agent` changes agent access for `agent` with a statement that it is parsed as an agent-access change and then refused with `Not a native ACP command: agent.` because `agent` is not a native ACP command.
2. Check `help/commands.md`, `documentation/user-documentation/tab-types/commands.md`, and `documentation/user-documentation/command-bar/commands.md` for the same false claim. Leave them unchanged when they already describe the non-native refusal and do not imply success.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

None. This is a documentation-only correction with no behavior change; the existing topic and activate tests already cover the refusal, and `check-diff` verifies the repository remains clean.

## Specs and docs

- `product/specs/application-commands.md`: correct the agent-scope example sentence.
- Help and user documentation: no change expected; they already say agent access on a non-native command is refused and do not claim `commands disable agent agent` succeeds.

## Out of scope

- Changing command parsing, the topic validator, or the settings manager.
- Changing the exact-error paragraph or the `commands disable agent` example.
- Adding tests for behavior that already has coverage.
