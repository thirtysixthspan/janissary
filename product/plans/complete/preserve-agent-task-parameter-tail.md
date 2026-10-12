# Preserve the agent task parameter tail

**Complexity: 7/10** — The parser must keep strict quote validation for launch clauses and the task path while treating all subsequent bytes as task-owned input.

## Goal

Return the agent task's parameter tail exactly as entered after the task path, without interpreting unmatched quotes or trimming significant whitespace in that tail.

## Approach

Keep the existing launch-clause tokenizer and validation through `execute`, then parse exactly one task-path token. Stop tokenization at that boundary and capture the remainder directly from the original invocation. Preserve malformed-quote errors in launch clauses and the task path.

## Implementation steps

1. `src/agent/command-parser.ts` stops tokenizing at `execute`, validates the next token as the task path, and returns the untouched suffix after that token.
2. `src/agent/command-parser.test.ts` covers unmatched quotes in parameters, exact leading-whitespace preservation, ordinary tails, and malformed launch/task-path quotes.
3. `product/specs/agent-command.md` states that parameter bytes after the task path are opaque and preserved, including unmatched quotes and whitespace.

## Tests

Expected parser-test coverage: unmatched quotes in parameters, exact leading whitespace preservation, ordinary tails, and malformed launch/task-path quotes, while retaining existing launch syntax errors.

## Out of scope

Do not change task resolution, execution, command help, user documentation, or the separate skill-root security backlog item. No help or user documentation currently describes the parser's parameter quote or whitespace handling, so those files need no change.
