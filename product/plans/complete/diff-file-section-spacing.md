# Fix: separate the diff tab's file sections with whitespace as well as a rule

**Complexity: 1/10** — one declaration on the diff tab's own sheet plus its colocated CSS test. No markup, state, server, or protocol change.

## Goal

Consecutive file sections in the diff tab's body are set off from each other by whitespace as well as by the rule between them, so a change set of many files reads as separate sections rather than one uninterrupted block.

## Approach

`web/src/plugins/diff/diff.css` separates two entries with a rule alone — `.diff-file + .diff-file` carries `border-top` and nothing else — so one file's last hunk row meets the next file's header with no gap between them. A `margin-top` on every entry after the first gives the pair the same 8px the tab already uses between the header and the body (`.diff-tab`'s own gap, and the file header's 8px inner gap), and the rule stays at the boundary of the section it closes.

## Implementation steps

1. Add `margin-top` to the `.diff-file + .diff-file` rule in `web/src/plugins/diff/diff.css`.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Add the case below to `web/src/plugins/diff/diff-styles.test.ts`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/diff-tab.md` to say the sections are set off by a rule and whitespace.
6. Check `help.md` and `documentation/user-documentation/` for entry-layout guidance, and update it only if present.

## Tests

- A file entry after the first holds whitespace above its rule, so sections read separately; the first entry holds none.

## Out of scope

- The rule's color or weight.
- Spacing inside an entry, between its header and its hunks.
- The metadata header and the view controls.
