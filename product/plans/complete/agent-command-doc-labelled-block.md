# Agent Command User Doc Labelled Block Rule

**Complexity: 1/10** — documentation-only text repair: no production code, tests, specs, or new units change; all five quantitative counts are zero (p=1.578).

## Goal

Update `documentation/user-documentation/advanced-agents/agent-command.md` so its description of how an agent requests a granted command matches the shipped labelled fenced-block behavior already stated in `product/specs/agent-command.md` and taught by the runtime primer in `src/agent/command-tools.ts`. The page still tells readers the agent ends a reply with a bare `janissary <command>` line and that a command-looking line inside a Markdown fence is treated as an example. Neither is true: the agent puts exactly one command in a final fenced block whose info string is exactly `janissary`, and a closed labelled block is the real request.

## Approach

Make three in-place sentence replacements in the user-documentation page, leaving every other paragraph, image, and link byte-for-byte unchanged. Reuse the wording already pinned by the spec and the runtime primer so the user doc, the spec, and the primer agree. Verify the final page against `product/specs/agent-command.md` and `src/agent/command-tools.ts`. No code changes and no test updates: this is a documentation-text repair.

## Implementation steps

1. In `documentation/user-documentation/advanced-agents/agent-command.md`, rewrite the sentence just after the skill-grant JSON example (currently "The agent asks to run one by ending a reply with `janissary <command>`.") to say the agent puts exactly one command in a final fenced block whose info string is exactly `janissary`, that prose may follow the block, and that no `janissary` prefix is required inside the block.
2. In the same file, rewrite the "Run results and cleanup" sentence that begins "The agent can request a granted command on the final nonempty reply line as `janissary <command>`." the same way.
3. In the same file, replace the sentence "If an agent's final command-looking line appears inside a Markdown code fence, Janissary treats it as an example rather than a request to run the command. This applies to fences made with backticks or tildes." with wording stating that an unlabelled fence, or a fence with any other info string, is an example, while a closed `janissary` block is a real request; add that a later labelled block left unclosed does not suppress an earlier closed one, and that an unclosed labelled block asks for a correction only when no closed block exists.
4. Run `$janissary/scripts/run.mjs check-diff` and confirm the full server suite stays green.

## Tests

None. This repair changes only user-documentation prose; no behavior, source, or test changes are needed. Existing tests remain untouched and must pass unchanged.

## Out of scope

- Any change to `product/specs/agent-command.md`, `product/specs/acp.md`, `src/agent/command-tools.ts`, or any other code, spec, test, help page, or the PR description.
- The separate backlog finding about the no-stray-copy claim, which stays open.
