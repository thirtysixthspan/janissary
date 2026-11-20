# Correct the stale bare-final-line claim in the agent-command spec

**Complexity: 1/10** — spec-only one-sentence correction: 0 production lines, files, requirements, scenarios, or units (p=1.58).

## Goal

`product/specs/agent-command.md` contradicts itself: one sentence still says the agent requests a command on its final nonempty reply line as `janissary <command>`, while the paragraph immediately below it already says the command comes from the last closed fenced block whose info string is exactly `janissary`. Replace the stale sentence so the spec matches the behavior the agent-path extractor already implements and the primer already teaches. No behavior changes.

## Approach

The extractor in `src/acp/command-block.ts` and the primer in `src/agent/command-tools.ts` already implement and describe the fenced-block rule; the block-rule paragraph already in the spec (`product/specs/agent-command.md`, the paragraph beginning "A run's command comes from the last closed fenced block…") states it accurately. Only the one stale sentence in the preceding paragraph is wrong. Replace that sentence with a statement that the agent puts exactly one command in a final fenced block whose info string is exactly `janissary`, that prose may follow the block, and that no `janissary` prefix is required inside it. Leave the rest of that paragraph — the question grant, denial, and subagent refusal sentences — byte-for-byte intact.

## Implementation steps

1. In `product/specs/agent-command.md`, replace the sentence "The agent requests a Janissary command on its final nonempty reply line as `janissary <command>`." with a statement of the fenced-block rule described in Goal/Approach.
2. Confirm the new wording matches the agent primer in `src/agent/command-tools.ts` and the existing block-rule paragraph in the same spec, and that the surrounding sentences are unchanged.
3. Run `$janissary/scripts/run.mjs check-diff`; expect a clean run (spec-only change, no lint or test scope).

## Tests

None — no code changed. The existing cases in `src/acp/command-block.test.ts` already pin the fenced-block rule, including that a bare final command line is just prose and that no `janissary` prefix is required inside the block; keep them passing untouched.

## Out of scope

- Any code change to `src/acp/command-block.ts`, `src/acp/command-block.test.ts`, or `src/agent/command-tools.ts` — they already implement this rule.
- The remaining backlog entry in `product/backlog/pull-request.md`.
- The pull request's title and description — the entry does not call for a description correction.
- `help/` and `documentation/user-documentation/` — no behavior changed, and no user-facing page documents a bare-final-line rule.
