# Record the destination-new condition in the file patch rename row

**Complexity: 1/10** — no production code changes; one plan decision, one help bullet, one spec paragraph, and one colocated row case (p=2.47)

## Goal

Make the canonical `file patch` plan, the help page, the functional spec, and the tests state the success-row rule the runner already implements: `R` is reported only when a surviving move's destination did not exist before the patch. A move onto a destination that existed before the patch, including one deleted or moved away earlier in the same patch, keeps that destination's own net row, `M` when it exists at the end or `D` when it does not, while the origin reports `D`. The runner's output does not change.

## Approach

`showsRename` in `src/file-patch/move-chains.ts` already requires `!chain.current.existed`, so `R` is reserved for a move whose destination is new. When the destination existed before the patch, `rows.ts` derives the destination's ordinary `existed`/`exists` row and the origin's `D`. The plan's **Success output** decision and the help page's row bullet describe `R` without that condition, and the only pin is the delete-then-move case. Correct the prose and add a second case for a destination vacated earlier in the same patch, without touching `showsRename`, `rows.ts`, or any row output.

## Implementation steps

1. In `product/plans/complete/file-patch.md`, amend the **Success output** decision so the `R` clause says `R` is reported only when the move's destination did not exist before the patch, and add that a destination that existed before the patch, including one deleted or moved away earlier in the same patch, keeps its own net row, `M` when it exists at the end or `D` when it does not, while the origin reports `D`. Keep "Each path is listed once with its net change" as the reason. Name the new test case in the plan's Tests list for `sections.test.ts`.
2. In `help/file.md`, change the output-row bullet from `R <old> -> <new>` for a file that existed before the patch and was renamed to the same destination-new wording, and add a sentence with an example: deleting `b` and then moving `a` to `b` prints `M b` and `D a`, not `R a -> b`.
3. In `product/specs/acp.md`, state the same destination-new condition under the file patch tool.
4. In `src/file-patch/sections.test.ts`, keep the existing `derives rows, deletes and writes for overwritten and vacated paths` case as the pin and add a new case, `derives a net row for a destination that was moved away earlier`, with `a` and `b` present before the patch and the sections `*** Update File: b`, `*** Move to: c`, `*** Update File: a`, `*** Move to: b`. Assert the rows are exactly `M b`, `A c`, `D a` in that order and that no row is an `R`.

## Tests

- `src/file-patch/sections.test.ts`: the existing overwritten and vacated paths case stays untouched as the pin for delete-then-move and add-then-move.
- `src/file-patch/sections.test.ts`: the new `derives a net row for a destination that was moved away earlier` case pins the destination-new condition from the other side, with `M b`, `A c`, `D a`, and no `R`.
- The existing `sections.test.ts` and `apply.test.ts` row expectations must keep passing untouched.

## Out of scope

- Changing `showsRename`, `rows.ts`, or any row output.
- Changing the agent primer's summary line or any other documentation.
