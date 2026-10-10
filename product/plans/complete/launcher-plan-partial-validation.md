# Say in the plan what the shipped validation actually does

**Complexity: 3/10** — three paragraphs of a completed plan, one of them about what was deferred, and a check of the description's wording.

The completed plan for the launcher says "An absent file — or one that is invalid JSON, unreadable, or holds a malformed entry — falls back to a built-in default command set". That is one rule covering four very different situations, and it is wrong about the fourth. `readLauncherFile` in `src/plugins/launcher/commands-file.ts` falls back for an absent file, an unreadable one, invalid JSON, and a top level that is not an array — and for a valid array it *keeps the usable entries* and reports how many were lost, which is what `product/specs/launcher.md` describes and what `commands-file.test.ts` covers. Two entries sharing an id are now dropped the same way, for the same reason: a row that cannot be addressed on its own is not usable.

The out-of-scope item compounds it. It says the versioned, per-entry-merged format was declined carrying "entry-scoped rather than file-scoped validation", which reads as though per-entry validation were deferred. What ships is per-entry *dropping* — each row is judged on its own — and what the deferred format carries is per-entry *merging and hiding*. The distinction is exactly what a later implementation would get wrong.

## Goal

The plan describes what ships, and the deferred item does not read as though the shipped policy were declined.

## Approach

1. **`product/plans/complete/sidebar-launcher-tab.md`** separates the four fallback situations from the mixed-array one, and names what a mixed array keeps and loses.
2. The out-of-scope item says what the deferred format carries and what ships instead, so the two cannot be confused.
3. The plan's own test list describes the mixed-array case and the shared-id case explicitly, because a test list is how a later implementation learns what the behaviour was.
4. **The pull request description's wording needs no change.** It says "an absent, unreadable, invalid, or empty file falls back to a built-in default set", which is accurate; it never claims a mixed file does. So `gh pr edit` is not run for this entry.

### Rejected alternatives

- Editing the description too, for symmetry. Its wording is right, and an unnecessary edit to a live artifact is a risk with no gain.
- Changing the code to match the plan. The plan is the record and the code is the behaviour; the entry says to preserve the behavior and fix the record.

## Implementation steps

1. Correct the configuration paragraph.
2. Correct the out-of-scope item.
3. Correct the test list.
4. Run `./scripts/run.mjs check-diff`, and confirm the existing decoding tests still pass unchanged.

## Tests

- None added. `src/plugins/launcher/commands-file.test.ts` already carries the mixed-entry and shared-id cases; the plan is the record of them.

## Spec updates

- None. `product/specs/launcher.md` already describes the shipped policy, including the id rule.

## Out of scope

- The description edit the entry says to make "if needed" — it is not needed.
- Any behaviour change to `readLauncherFile`.
