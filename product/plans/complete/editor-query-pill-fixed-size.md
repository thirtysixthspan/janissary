# Editor query line's status pill should stay a fixed size

**Complexity: 2/10** — a missing cross-axis alignment rule on an existing CSS class; no component
or behavior change, mirroring the same fix already applied to `.editor-diff-controls`.

## Goal

The query line's status pill (`.editor-suggest-pill`, `web/src/editor/render.tsx`) is rendered as
a flex-row sibling of `.editor-content` inside `.editor-row`. `.editor-row` is `display: flex`
with no `align-items` override, so the default `stretch` applies: every flex child, including the
pill, stretches to match the row's cross-axis (vertical) size. `.editor-content` has
`white-space: pre-wrap; overflow-wrap: break-word` (`web/src/theme.css:640`), so once the query
text wraps onto multiple visual lines the row grows taller, and the pill stretches to fill that
full height instead of staying the compact badge it is on a single-line row. Per the backlog
request, the pill should remain a fixed size regardless of how many lines the query text wraps to.

## Approach

`.editor-diff-controls` (`web/src/theme.css:676`) already had this exact problem and was fixed with
`flex-shrink: 0` — but that only guards the horizontal (main) axis. The pill's growth is a
cross-axis (vertical) effect of `align-items: stretch`, so the fix is `align-self: flex-start` on
`.editor-suggest-pill`, which overrides the inherited `stretch` for just this child and lets it
size to its own content (padding + line-height) no matter how tall the row grows.

## Implementation steps

1. In `web/src/theme.css`, add `align-self: flex-start;` to the existing `.editor-suggest-pill`
   rule (`web/src/theme.css:660-663`).

## Tests

This is a pure CSS change — jsdom (the project's test environment) does not apply real stylesheet
layout, so there is no meaningful assertion that the pill visually stays a fixed height. The
existing `web/src/editor/render.test.tsx` "EditorLine suggestion pill" tests already assert the
pill renders with the right class and text; no new test is needed since no component logic
changes. Run `./scripts/run.mjs check-diff` to confirm nothing regresses.

## Spec updates

None. `product/specs/editor-tab.md`'s "In-editor persona suggestions" section already describes
the pill at a behavior level (its states and click behavior) with no layout/CSS specifics, per the
spec-writing convention ("no code, no implementation details").

## Docs

- Checked `help.md` and `documentation/user-documentation/` — neither describes the pill's sizing
  behavior. No update needed.

## Out of scope

- The up/down arrow / multiline query navigation backlog item — skipped this run as requiring
  significant new architecture (reversing the query line's single-line design decision); a
  separate, larger effort.
- `.editor-diff-controls`'s own `flex-shrink: 0` — unaffected, already correct for its own context
  (always a single-line row).
