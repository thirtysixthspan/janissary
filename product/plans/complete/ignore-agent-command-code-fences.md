# Ignore fenced examples during agent command extraction

**Complexity: 2/10** — The fix is localized to the command extractor, its colocated tests, and the behavior spec.

## Goal

Prevent commands shown inside Markdown fenced code blocks from being interpreted as agent requests, including blocks fenced with tildes.

## Approach

Track the opening fence character and run length while scanning the reply. Ignore all lines inside a fenced block until a matching fence of the same character and at least the opening length closes it. Preserve extraction of the final nonempty command line outside fences and the current handling of inline backticks.

## Implementation steps

1. Update `extractAgentCommand` in `src/agent/command-tools.ts` to recognize backtick and tilde fences and matching closing lengths.
2. Extend `src/agent/command-tools.test.ts` to prove fenced `janissary` and permitted bare `question` examples are ignored, a shorter fence does not close a block, and a later command outside the block is still extracted.
3. Update `product/specs/agent-command.md` to state that fenced code examples are not command requests.

## Tests

The extractor tests cover existing backtick behavior, tilde-fenced final commands, closing-fence length and character matching, continued extraction after a valid close, and permitted bare-question extraction outside fences.

## Verification

`./scripts/run.mjs check-diff` passed after implementation, tests, and spec updates.

## Out of scope

Do not change command grants, command syntax, inline-code handling, public documentation, or the pull request description.
