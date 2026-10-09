# Complete diff syntax token coverage

Complexity: 5/10.

## Goal

Complete the recorded Syntax highlighting requirement using the editor's shared language detection and themes, with symbol operators highlighted alongside existing keyword, string, comment, literal, and identifier scopes while preserving diff marks and plain-text fallback.

## Approach

The diff already uses the shared editor tokenizer for each hunk's old and new text, supports JavaScript, TypeScript, JSON, and Markdown by extension, and preserves selection and line targeting. Highlight.js leaves JavaScript and TypeScript symbol operators without token scopes. Add operator ranges only in gaps between existing scopes, protecting strings, comments, regular expressions, and named identifiers. Keep this in the shared tokenizer so editor and diff colors remain consistent. Extension-based detection satisfies the entry's language-source alternative; no additional metadata contract is needed.

## Implementation steps

1. Add a pure operator-range helper under `web/src/shared/syntax-highlight/`, and apply it to JavaScript/TypeScript lines after the existing grammar tokenization. Add tests for compound operators, protected literal/comment scopes, Unicode offsets, and unsupported-language preservation. Run `./scripts/run.mjs check-diff`.
2. Extend `web/src/plugins/diff/diff-syntax.test.tsx` with both-layout coverage for operator/keyword/string/comment/literal/named-identifier scopes, identical old/new syntax colors, plain-text fallback, and coexistence with character-change marks. Preserve the existing theme, selection, literal markup, and targeting tests. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/diff-tab.md` and `product/specs/editor-tab.md` to describe the shared operator treatment and grammar-protected scopes. Update the existing editor syntax documentation if its token description needs correction; check help and existing command docs for affected descriptions. Promote this plan and remove only the Syntax highlighting backlog entry. Run `./scripts/run.mjs check-diff`.
4. Revalidate PR #1621 and its branch, commit through `pr-commit`, push to the same head branch, and confirm the open PR's head matches the local commit.

## Tests

Verify JavaScript/TypeScript symbol operators receive operator scopes without changing keyword, number, string, comment, regular-expression, or identifier ranges; existing ranges and source offsets remain intact, including Unicode text. Other languages retain their grammar output. Verify both diff layouts preserve complete source text and theme colors on old/new sides, keep operator colors within intraline marks, and render unsupported or extensionless files as plain text. Retain selection, copying, theme-switching, syntax isolation, and line-targeting coverage.

## Out of scope

New grammars, new language metadata contracts, comment controls, context expansion, recovering omitted syntax state, changing the interpretation of existing grammar scopes, PR description/title changes, and merging the PR. No new code comments are needed.
