# Rename the tool-table test that claims to list only enabled commands

**Complexity: 1/10** — no production lines or files change; one requirement (a test title states what the case checks) with one scenario (p=2.32)

The `createAcpToolTable` case "keeps every included group primer while listing only enabled commands" in `src/acp/tool-table.test.ts` no longer exercises enablement. Since the core loop snapshot work, the tool table reads no settings: the case builds a table from two grants and passes a hand-picked allow-list (`['db sqlite list']`) straight to `toolPrimer`, which only echoes that list. Enablement filtering of the allow-list now lives in `runCorePrompt` and is covered in `src/acp/run-prompt.test.ts` by "excludes an agent-off command from the allow-list but keeps its owner primer", "keeps the group primer alone when the %s intersection is empty", and "applies an agent-access change from the next prompt, not mid-prompt". The stale title invites a reader to believe the pure table filters by enablement.

## Goal

The case's title states what it actually checks — every included group primer is kept while the allow-list line lists only the commands it is given — with no change to its body, its assertions, or any production code.

## Approach

Rename the test title only. Do not reintroduce settings into `src/acp/tool-table.ts` or its test; the table stays settings-free, and the run-prompt cases remain the home of the enablement rule.

## Implementation steps

1. In `src/acp/tool-table.test.ts`, inside `describe('createAcpToolTable')`, rename "keeps every included group primer while listing only enabled commands" to "keeps every included group primer while listing only the given allow-list".
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- The renamed case passes unchanged.
- The three run-prompt allow-list cases named above keep passing untouched.

## Out of scope

- Any change to `src/acp/tool-table.ts`, `src/acp/run-prompt.ts`, or `src/acp/run-prompt.test.ts`.
- Spec or documentation changes: a test title describes no user-visible behavior.
