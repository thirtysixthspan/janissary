# Match diff text to the editor

Complexity: 7/10. The user explicitly authorized proceeding beyond the task's rating cutoff.

## Goal

Give unified and split diff code the editor's font size, supported languages, and active syntax theme while preserving change backgrounds, character marks, text selection, and line targeting.

## Approach

Promote the editor's existing highlighting modules to `web/src/shared/syntax-highlight/` and publish a filename-based tokenizer through the client plugin API. Keep the editor's scheduling and per-tab caches. Tokenize each visible hunk's old and new text separately so multiline constructs within the available context retain their own side's state. Merge syntax-token and character-change boundaries when rendering diff text. Inherit the application's default font size, as the editor does.

## Implementation steps

1. Move the highlighting modules and their tests to shared, update direct imports, and add a filename-based tokenizer with the editor's existing size limits. Use it from the editor hook and publish it additively through `web/src/plugins/api.ts`, with a short comment explaining the shared contract. Verify with `./scripts/run.mjs check-diff`.
2. Add hunk highlighting and integrate both layouts, passing original and current filenames for renames. Combine token scopes with existing intraline marks without inserting HTML. Remove the diff body's fixed font size. Add rendering, tokenizer, and typography regression tests. Verify with `./scripts/run.mjs check-diff`.
3. Update the diff and editor specs, and existing syntax-theme help/user documentation where they describe which tabs share the theme. Remove only the selected backlog entry, promote this plan to complete, and verify with `./scripts/run.mjs check-diff`.
4. Revalidate PR #1621 and its branch, commit through `pr-commit`, push to the existing head branch, and confirm the open PR's head matches the local commit.

## Tests

Retain all editor tokenizer, language-registry, theme, and hook tests. Cover filename detection and unsupported/oversized plain-text fallback in the shared tokenizer. Test unified and split rendering against the editor's token scopes for supported languages; old/new multiline isolation; renamed file extensions; overlapping syntax and intraline marks; exact whitespace and literal HTML preservation; continued line targeting; and font-size inheritance matching the editor. Confirm the global active theme styles both diff layouts without replacing addition/removal backgrounds.

## Out of scope

New language grammars, fetching omitted full-file content to recover syntax state before a hunk, context expansion, comments, selection controls, unrelated backlog items, PR title/description changes, and merging the PR.
