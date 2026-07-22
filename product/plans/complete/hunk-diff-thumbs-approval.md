# Show all pending persona-suggestion hunks at once, approved individually via thumbs icons

**Complexity: 5/10** — no new subsystems or backend changes; a focused rework of the existing
in-editor suggestion hooks and renderer from "one hunk focused at a time, keyboard a/d" to "all
pending hunks previewed simultaneously, each with its own accept/decline icons," mirroring the
click-only rating UI the monitor's reporting tab already uses for suggestions.

## Goal

When a persona proposes multiple edits from one in-editor suggestion request, every proposed hunk
previews inline in the buffer at once (not just the first), each showing a right-floated thumbs-up
/thumbs-down icon pair on its inserted-lines block — the same icons and click-to-rate interaction
the monitor's reporting tab already uses for suggestions (`web/src/MonitorTab.tsx`). Clicking a
hunk's thumbs-up applies just that hunk; thumbs-down drops just that hunk; either resolves that
hunk independently of the others, which keep previewing until also resolved. Once every hunk is
resolved, the original `>` request line is removed if at least one hunk was accepted, exactly as
today.

## Design decisions

**Replace keyboard a/d with click-only icons, matching the monitor's precedent.** The issue asks
for the monitor's exact interaction model (thumbs icons, right-floated). The monitor's suggestion
rating is click-only, with no keyboard equivalent — carrying that same model over means dropping
the `a`/`d` keyboard handling entirely rather than trying to redefine what "the focused hunk" means
once every hunk previews at once. Editing stays blocked while any hunk is pending (same as today),
just with the resolution keys removed.

**`resolved: boolean[]` in place of a single `index`.** `PendingSuggest` currently tracks one
`index` naming the sole hunk under review. Since every unresolved hunk previews and can be resolved
in any order now, the pending set instead tracks a parallel `resolved` array; a hunk is "done" once
its slot is `true`. The set as a whole finalizes (remove request line if `acceptedAny`) once every
slot is `true` — this replaces the old "advance index, finalize at the end" logic with "resolve one
slot, finalize once none remain," which is the same finalization rule, just no longer sequential.

**Diff previews computed independently per hunk against the live buffer, merged in `startLine`
order.** Each unresolved hunk's preview is computed the same way as today
(`suggestDiffPreview(state.lines, hunk)`), just for every unresolved hunk instead of only the
focused one. `EditorLines` merges the resulting previews into one pass over the buffer, sorted by
`startLine`; a hunk whose preview range starts before the previous one's range has finished (an
overlap) is skipped for this render pass rather than drawn on top of another hunk's rows — hunks
proposed by one request are expected not to overlap in practice, and this keeps the merge simple
without a general interval-conflict UI.

**Thumbs icons render on the last added row of each hunk's block**, right-floated via the same
`margin-left: auto` pattern the status pill already uses in the same row (`editor-suggest-pill`),
reusing `approveIcon`/`rejectIcon` from `web/src/icons.ts` — the same icons and semantics the
monitor uses (`aria-label="Helpful"`/`"Not helpful"` becomes `"Accept"`/`"Decline"` here, since this
is applying/dropping a change rather than rating one).

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Thumbs icon pair, right-floated row, click-to-rate pattern to mirror | `web/src/MonitorTab.tsx`, `web/src/icons.ts` (`approveIcon`/`rejectIcon`) |
| Per-hunk diff-preview math (unchanged) | `web/src/editor/suggestDiff.ts` (`suggestDiffPreview`, `spliceHunk`) |
| Buffer splice + request-line removal logic to generalize from index-based to per-hunk | `web/src/editor/useEditorSuggest.ts` |
| Inline diff rendering to generalize from one hunk to N | `web/src/editor/EditorLines.tsx`, `web/src/editor/render.tsx` (`DiffAddedLine`) |
| Banner text to update for the new multi-hunk-at-once model | `web/src/editor/PendingSuggestPanel.tsx` |
| Keyboard interception to shrink (drop a/d) | `web/src/editor/handleSuggestKeyDown.ts` |

## Web changes

1. **`web/src/editor/useEditorSuggest.ts`**
   - `PendingSuggest`: replace `index: number` with `resolved: boolean[]` (one slot per hunk,
     initialized to all-`false` in `fireOnLine`).
   - Replace `resolveOne`/`acceptFocused`/`declineFocused` with `resolveHunk(index, accepted,
     state)`, `acceptHunk(state, index)`, and `declineHunk(state, index)`: same splice-and-finalize
     logic as today, keyed by the given index instead of `p.index`, marking that slot resolved and
     finalizing (clearing `pending`, removing the request line if `acceptedAny`) once every slot is
     `true`. A call against an already-resolved index is a no-op.
   - Update `EditorSuggestApi` accordingly (drop `acceptFocused`/`declineFocused`, add
     `acceptHunk`/`declineHunk`).
2. **`web/src/editor/render.tsx`** — `DiffAddedLine` gains an optional `controls?: React.ReactNode`
   prop, rendered as a trailing child of the row (after `.editor-content`) so `margin-left: auto`
   right-floats it exactly like the status pill.
3. **`web/src/editor/EditorLines.tsx`** — compute a diff preview per unresolved hunk
   (`pending.resolved[i] ? null : suggestDiffPreview(...)`), sort the resulting `{index, diff}`
   pairs by `startLine`, and merge them into the line pass (before/removed/added/after per hunk,
   skipping any hunk whose range starts before the previous one ends). On each hunk's last added
   row, pass `controls` with the two icon buttons wired to `suggest.acceptHunk(state, index)` /
   `suggest.declineHunk(state, index)`.
4. **`web/src/editor/PendingSuggestPanel.tsx`** — replace the single-hunk title/counter with a
   summary of remaining unresolved hunks, e.g. "Accept or decline each change below" plus "N
   remaining" (computed from `pending.resolved.filter((r) => !r).length`).
5. **`web/src/editor/handleSuggestKeyDown.ts`** — keep `e.preventDefault(); return true;` while
   `suggest.pending` is set (editing stays blocked), but drop the `a`/`d` branch.
6. **`web/src/theme.css`** — add `.editor-diff-controls` (flex row, `gap`, `margin-left: auto`) and
   button styling matching `.monitor-suggestion .rate button` (transparent background, `opacity:
   0.35` at rest, `1` on hover).

## Tests

- **`web/src/editor/useEditorSuggest.test.ts`**: update the existing accept/decline-focused-hunk
  tests to call `acceptHunk(state, 0)`/`declineHunk(state, 0)`; update the "advances to the next
  hunk" test to assert `pending.resolved` instead of `pending.index`, and add a case resolving the
  second hunk before the first (out-of-order resolution) to confirm the set only finalizes once
  both slots are `true`, and that resolving an already-resolved index is a no-op.
- **`web/src/editor/handleSuggestKeyDown.test.ts`**: drop coverage for the removed a/d branch (the
  `makeSuggest` mock no longer exposes `acceptFocused`/`declineFocused`); keep the pill-focus tests
  unchanged.
- **`web/src/EditorTab.test.tsx`** (`in-editor persona suggestions` describe block): update the
  accept/decline tests to click the new thumbs icons instead of pressing `a`/`d`; add a test with a
  two-hunk reply asserting both hunks' diff previews are visible in the buffer at once, and a test
  that accepting one hunk while the other is still pending only removes the request line once the
  second hunk is also resolved.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual (not run in this environment): open a file, request a persona edit that proposes two
  separate hunks, confirm both preview simultaneously with their own thumbs icons, and that
  clicking one hunk's icons resolves only that hunk while the other stays pending.

## Out of scope

- Any change to how hunks are generated or anchored server-side (`src/`) — this is a client
  rendering/interaction change only.
- Handling overlapping hunk ranges beyond "skip the later one for this render pass" — no general
  interval-conflict UI.
- Restoring a keyboard shortcut for per-hunk accept/decline; the monitor's suggestion rating this
  mirrors is click-only.
