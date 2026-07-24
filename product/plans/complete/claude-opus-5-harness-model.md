# Add claude-opus-5 to harness-models, removing prior opus versions

**Complexity: 1/10** — a data-only swap of one model id across a JSON catalog, two profile files,
and their existing test expectations; no new logic, no new call sites.

## Goal

`harness-models.json`'s `"claude"` catalog still lists `claude-opus-4-8`. Replace it with
`claude-opus-5`, the current Opus model id, so `harness claude --model claude-opus-5` (and any
profile pinning it) validates, and the older id no longer validates. The two profiles that pin the
old id (`features`, `debugging`) move to the new one so they keep launching a valid, current model.

## Approach

Swap the single string `claude-opus-4-8` → `claude-opus-5` everywhere it's used as a literal model
id: the catalog, the two profile JSON files that reference it as a harness's `model`, and the
existing completion test that asserts against the catalog's contents. No code in
`src/harness/models.ts` or `src/completion/handlers.ts` changes — both already read the catalog
and profile files generically.

## Implementation

1. **`harness-models.json`**: change `"claude-opus-4-8"` to `"claude-opus-5"` in the `"claude"`
   array.
2. **`profiles/features.json`**: change the `planning` harness entry's `"model"` from
   `"claude-opus-4-8"` to `"claude-opus-5"`.
3. **`profiles/debugging.json`**: change the matching harness entry's `"model"` from
   `"claude-opus-4-8"` to `"claude-opus-5"`.
4. **`src/completion/handlers.test.ts`**: update the two assertions that reference
   `claude-opus-4-8` (the completed `--model` value and the sorted `matches` list) to
   `claude-opus-5`.

## Tests

No new test cases — this updates existing assertions in `src/completion/handlers.test.ts` to match
the renamed model id. Verify via `./scripts/run.mjs check-diff` that:
- The completion tests pass with the new id.
- No remaining reference to `claude-opus-4-8` exists in source, tests, or profiles.

## Out of scope

- Any other harness's model catalog (`codex`, `opencode`).
- Changing `src/harness/models.ts` or `src/completion/handlers.ts` logic — both already read the
  catalog/profiles generically.
- Spec or documentation updates — no spec or `help.md`/user-documentation page names specific
  Claude model ids; they describe the catalog mechanism generically.
