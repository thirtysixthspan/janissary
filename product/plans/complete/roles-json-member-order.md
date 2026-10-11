# Preserve accepted role names and member order

Complexity: 5/10 (threshold: 7).

## Goal

Keep every accepted role name and the requested role order through saves, rereads, and published tab payloads, including `__proto__` and integer names.

## Approach

Serialize each role name and value independently into the existing JSON object shape. Recover top-level key order from the validated source text with a focused pure scanner that skips escaped strings and nested values, while retaining JSON.parse for value decoding. Pass source text as an additional decoder argument in the shared config reader; existing launcher decoders continue using only the parsed argument.

## Implementation steps

1. Add `src/plugins/roles/ordered-json.ts`, pass source text to config decoders, and use textual member order and independent serialization in the roles reader/writer. Run `./scripts/run.mjs check-diff`.
2. Add pure helper, roles file, config reader, and activation tests covering special names, numeric order, escaped keys and nested values, additions, renames, moves, hand edits, descriptions, and duplicate model entries. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/roles.md` and the existing role naming description in the user documentation. Promote this plan and remove only this backlog entry. Run `./scripts/run.mjs check-diff`, commit, and push to the existing PR.

## Tests

Assert written textual order, reread role order, and published role order for mixed numeric and ordinary names. Add and rename populated roles to `__proto__`, and edit a hand-written file containing it. Verify descriptions and duplicate model entries survive. Cover escaped quotes, backslashes, Unicode escapes, braces and commas inside values, nested arrays/objects, empty objects, and repeated exact keys retaining JSON.parse's last-value semantics. Verify the config decoder receives the original source while existing launcher tests pass.

## Out of scope

File schema changes, name restrictions, stale entry edits, launcher ordering changes, plugin API changes, and PR description changes.
