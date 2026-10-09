# Fix: let each diff tab file header scroll with its file's content

**Complexity: 2/10** — one stylesheet rule on the diff tab's own sheet plus its colocated CSS test. No markup, state, server, protocol, or parser change.

## Goal

A file entry's header belongs to that file's content: it scrolls away with the hunks beneath it instead of staying pinned at the top of the body while the rest of the list goes by.

## Approach

`.diff-file-header` in `web/src/plugins/diff/diff.css:31-34` carries `position: sticky; top: 0; z-index: 1`, which holds each file's header at the top of `.diff-body` while its entry is in view. The header keeps its flex layout, its `4px 12px` padding, and its tinted background; only the sticky positioning and the two declarations that serve it go, so a header sits at the top of its own content and scrolls with it like any other row.

## Implementation steps

1. Drop the sticky positioning, its `top`, and its `z-index` from `.diff-file-header` in `web/src/plugins/diff/diff.css`.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. Extend `web/src/plugins/diff/diff-styles.test.ts` with the case below, following the sheet's existing load-and-compute pattern.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Update `product/specs/diff-tab.md` to say each file's header scrolls with its content rather than staying in view.
6. Check `help.md` and `documentation/user-documentation/` for header-behavior guidance, and update it only if present.

## Tests

- A file entry's header is not sticky, so it scrolls with the hunks beneath it rather than staying pinned to the top of the body.

## Out of scope

- The tab's metadata header (the diffed root and the view controls), which is a different element and stays put.
- Collapsing or expanding an entry's hunks, which the other entries request separately.
- The hunk walk's scroll-into-view behavior.
