# Remove the patch record's unused link-target bookkeeping

**Complexity: 1/10** — no production lines added, 3 production files edited, 1 requirement (p=2.67).

## Goal

`PatchRecord` should carry only state the patch logic reads. The `linkTargets` map is written by `followLink` and never read, so removing it leaves the record honest without changing how links are followed.

## Approach

`followLink` in `src/file-patch/section-steps.ts` resolves a chain of links, then retargets the recorded move chain and reassigns the place's content to the final target's content. Between those two lines it also stores the target's location in `record.linkTargets`, a map nothing consumes. Delete the field from `PatchRecord`, its initializer in `applySections`, the write in `followLink`, and the two test fixture literals that construct a `PatchRecord`.

The behavior that matters stays untouched: the missing-target check, the cycle check, `retargetLink(record.moves, place, current.content)`, and `place.content = current.content` all remain exactly as they are. The existing link tests already pin that behavior, including the moved link, moved dangling link, and deleted-link-re-added-then-moved cases.

## Implementation steps

1. In `src/file-patch/changes.ts`, remove `linkTargets: Map<PatchPlace, string>;` from `PatchRecord`.
2. In `src/file-patch/sections.ts`, remove `linkTargets: new Map(),` from the record initializer.
3. In `src/file-patch/section-steps.ts`, remove `record.linkTargets.set(place, current.location);` from `followLink` and leave the rest of the block intact.
4. In `src/file-patch/sections.test.ts`, remove `linkTargets: new Map(),` from the two `PatchRecord` fixtures.

## Tests

No new test cases. The change deletes unobservable state, and the existing `sections.test.ts` link cases plus `commit.test.ts` link cases cover every behavior around it. Run `$janissary/scripts/run.mjs check-diff` to confirm the suite still passes.

## Out of scope

- Adding a link-target consumer. If one is wanted later, it belongs in its own change with its own test.
- Changing `followLink`'s resolution, cycle detection, missing-target refusal, or move retargeting.
- Renaming or restructuring the patch record beyond removing this field.
