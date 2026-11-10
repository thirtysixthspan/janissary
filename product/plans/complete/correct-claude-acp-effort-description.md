# Correct the Claude ACP effort description

**Complexity: 1/10** — one factual requirement and one existing launch scenario, with no production code changes (p=2.32)

## Goal

Describe the current Claude role launch accurately: it passes the entry's effort as `CLAUDE_THINKING_EFFORT`, but the bundled adapter does not read that variable, so the effort has no effect.

## Approach

Keep launch behavior unchanged. Correct the Claude clause in the ACP spec and rename the existing launch test so its title does not claim the effort takes effect. Preserve the test assertion, which records the environment the launch currently receives.

## Implementation steps

1. Rename the Claude role launch case in `src/acp/launch.test.ts` to describe the model, effort environment variable, and disabled built-in tools without implying the adapter applies the effort.
2. Correct only the Claude clause in `product/specs/acp.md`, stating that the entry's model is used and its effort is passed as `CLAUDE_THINKING_EFFORT` for parity but ignored by the pinned adapter. Leave the Codex clause unchanged.

## Tests

- Keep the existing Claude role launch assertion unchanged; it verifies the model and effort environment values and the empty built-in tool set.
- Run `$janissary/scripts/run.mjs check-diff` to lint, typecheck, and run the affected server tests.

## Out of scope

- Changing `baseLaunchForEntry` or any launch behavior.
- Adding a Claude effort session option or changing adapter dependencies.
- Changing the Codex description, user documentation, or the pull request description.

## Spec updates

- `product/specs/acp.md`: state that the Claude role effort is passed but has no effect with the pinned adapter.

## Docs

No help page or user documentation describes this ACP launch detail, so no public documentation update is needed.
