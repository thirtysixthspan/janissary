# Editor word-boundary wrapping

**Complexity: 2/10** — one editor CSS rule changes, with a focused stylesheet regression test and small updates to existing editor documentation.

## Goal

Long sentences in editor tabs wrap between words instead of splitting a word across two visual rows.

## Approach

Replace the editor content cell's unconditional `word-break: break-all` behavior with `overflow-wrap: break-word`. Normal sentences will wrap at whitespace, while a single token that is wider than the editor can still break to avoid horizontal overflow.

Add a stylesheet regression test that pins the editor content rule. Update the editor functional spec and user guide, which already describe editor wrapping and layout, to state the visible word-boundary behavior.

## Implementation steps

1. Update the `.editor-content` rule in `web/src/theme.css` to wrap normal text at word boundaries while retaining a fallback for overlong unbroken tokens.
2. Add a web test that verifies the editor stylesheet uses boundary-preserving wrapping and no longer forces breaks between arbitrary characters.
3. Update `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor.md` with the corrected visible wrapping behavior.
4. Run `./scripts/run.mjs check-diff` after each implementation step and resolve any failures.

## Tests

- Add one test in `web/src/theme.test.ts` that checks the `.editor-content` declaration uses `overflow-wrap: break-word` and does not use `word-break: break-all`.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing cursor movement across wrapped visual rows.
- Changing wrapping in transcripts, command input, metadata, or other tab types.
- Adding hyphenation or language-specific line-breaking rules.
- Changing the treatment of a single token wider than the editor.
