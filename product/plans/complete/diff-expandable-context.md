# Expandable diff context

Complexity: 8/10

## Goal

Reveal omitted unchanged lines independently above, below, or between changed groups, inside the existing diff view, with normal line numbers, highlighting, selection, navigation, and comments.

## Approach

Give each omitted region a stable identity derived from the changed lines on its edges. The server will describe available boundaries in each file payload and accept a boundary identity with a context request. It will read the complete bounded diff for that file, splice only the selected region into the current hunks, and merge hunks when a between-hunk expansion connects them. Keep expanded boundary identities in the diff session so refreshes retain them. Render compact controls between hunks and at file edges, using the existing comment provider and line renderers.

## Implementation steps

1. Add boundary identities and metadata to diff payloads, calculate available omitted regions, and splice selected context into the appropriate hunk(s) in the server read path.
2. Store expanded boundaries in the session and route boundary-specific context intents without affecting other gaps.
3. Render compact controls at each available boundary in unified and split layouts; preserve line comments through hunk merges.
4. Update the diff tab spec, promote this plan, and remove the resolved backlog item.

## Tests

- Server tests cover top, bottom, and between-hunk expansion; independent boundaries; hunk merging; exhausted boundaries; correct numbering; and persistence across recomputation.
- Client tests cover control placement and intents, pending and error states, unified and split layouts, syntax/line interactions, and comments surviving a hunk merge.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Editing changed file contents or adding persistent remote review comments.
- Replacing the existing file-level context and full-file controls.
- Changes to diff polling, refresh cadence, or unrelated navigation.
