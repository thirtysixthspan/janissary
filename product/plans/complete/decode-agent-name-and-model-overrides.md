# Decode the agent-name and harness-model override files on load

**Complexity: 4/10** — two small loaders gain a shape check each, one comparison in `resolveAgentName` changes, and the agent-state filename guard is exposed as a predicate. No new architecture, no wire change. The risk is confined to what a project override file can contain.

`.janissary/config.json` goes through a field-by-field decoder (`src/config-decode.ts`), but its two sibling override files are parsed and cast: `loadAgentNames` in `src/agent/names.ts` does `JSON.parse(...) as string[]` and `loadHarnessModels` in `src/harness/models.ts` does `JSON.parse(...) as Record<string, string[]>`. So a project override can put a capitalized name, a duplicate, a `/`-bearing name, or a non-array value straight into the name pool, and a non-object or string-valued map straight into the model catalog.

The capitalized case hangs the server: `resolveAgentName` compares raw pool names against lowercased labels, so a drawn `Alice` is never excluded, `poolCandidates` yields it forever, and `checkLaunchName` spins synchronously on a bare `agent`.

## Goal

A malformed or unsafe override file is rejected at load with a stderr warning and the bundled default is used instead, exactly as an invalid-JSON file already is. A valid agent-name override is normalized (lowercased, deduplicated) before it reaches the pool. The pool exclusion no longer depends on the list's casing.

## Approach

1. **`src/agent/state.ts`**: export `isValidAgentName(name)`, the predicate behind the existing `VALID_NAME` filename guard, and have `agentStatePath` use it. The pool decoder reuses it instead of copying the pattern.
2. **`src/agent/names.ts`**: add `decodeAgentNames(value: unknown): string[] | undefined`. It accepts only a non-empty array of strings. Each entry is lowercased, duplicates are dropped, and the whole file is rejected if any entry fails `workspaceLabelError` (`src/workspace/label.ts`) or `isValidAgentName`. `loadAgentNames` parses, decodes, and on `undefined` warns `warning: .janissary/agent-names.json is not a non-empty list of valid agent names — using the bundled name list` and falls back to `defaultNames`. The invalid-JSON warning is unchanged.
3. **`src/harness/models.ts`**: add `decodeHarnessModels(value: unknown): Record<string, string[]> | undefined`, accepting only a plain object (not `null`, not an array) whose every value is an array of strings. `loadHarnessModels` falls back to the bundled catalog with `warning: .janissary/harness-models.json is not an object of model-id lists — using the bundled catalog` when it fails. The invalid-JSON warning is unchanged.
4. **`src/agent/commands.ts`**: `resolveAgentName` filters with `!lowerExisting.has(n.toLowerCase())`, so the exclusion holds even if a future loader regresses.

Rejecting the whole file rather than dropping bad entries matches how an invalid-JSON file is treated, and keeps the warning meaningful: a project either gets exactly its list or the bundled one.

## Tests

- `src/agent/names.test.ts`: a capitalized file is lowercased; duplicates (including case-only duplicates) collapse; a `/`-bearing entry, a `..` entry, a non-array file, a non-string entry, and an empty array each fall back to the bundled list with the new warning.
- `src/harness/models.test.ts`: a non-object file (array, string, `null`) and a file with a string value instead of a list each fall back to the bundled catalog with the new warning.
- `src/launch-name/check.test.ts`: with the pool mocked to hold a mixed-case name, `poolCandidates` draws each name once and terminates. The old code loops synchronously, which a test timeout cannot interrupt, so the case caps its draw and fails on a repeat instead of hanging.
- `src/agent/state.test.ts`: `isValidAgentName` accepts a dotted label and rejects a slash-bearing one.

## Specs and docs

- `product/specs/agents.md`: the override paragraph says a file of the wrong shape (or with an unsafe name) is treated like invalid JSON, and that names are lowercased and deduplicated.
- `product/specs/harness.md`: the harness-models override paragraph says a file of the wrong shape is treated the same way.
- `documentation/user-documentation/advanced-agents/harness.md` documents the invalid-JSON fallback for both files, so it gains the same wording.

## Out of scope

- Truncating override names to `tabNameMaxLength`; the bundled list has never been truncated either.
- Validating model ids against any provider list; the catalog is the user's to define.
