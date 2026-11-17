# Drop the correction to the retired ready web-search plan

**Complexity: 1/10** — no production lines or files change, one requirement (leave the retired ready plan absent while keeping the extraction, delegation, and historical record), no test scenarios and no new units (p=2.07).

## Goal

This branch once carried an edit to `product/plans/ready/web-search.md` that repointed its file-patch links and rewrote its remote-port extraction description. Master's `web search` change moved that plan to `product/plans/complete/web-search.md` and deleted the ready file, so the replayed branch has no such path to correct and must not resurrect one. The completed web-search plan already records the facts the old correction was trying to write: `remoteCreateItem` lived in `port-mapped.ts` and `pasteRemote` stayed private in `port.ts`. The branch's own plan move from `product/plans/ready/file-patch.md` to `product/plans/complete/file-patch.md`, its `remotePaste` extraction in `port-mapped.ts`, and the `port.ts` delegation all stay, as does `product/plans/complete/refresh-web-search-plan-file-patch-reference.md` as the historical record of a repair a later master change made unnecessary.

## Approach

Record the replayed state rather than editing files. The rebase accepted master's deletion, so the only work is verification: confirm the ready file is absent, confirm the completed web-search plan carries the corrected claims and no ready file-patch reference, confirm the completed file-patch plan and the historical refresh plan remain, and confirm the branch's remote-paste extraction and delegation are intact. Fix a gap only if verification finds one.

## Implementation steps

1. Confirm `product/plans/ready/web-search.md` is absent and `product/plans/complete/web-search.md` exists.
2. Confirm `product/plans/complete/web-search.md` states that master's `remoteCreateItem` already lived in `port-mapped.ts` and that `pasteRemote` stays private in `port.ts`, and that it contains no reference to `product/plans/ready/file-patch.md`.
3. Confirm `product/plans/complete/file-patch.md` still exists and `product/plans/complete/refresh-web-search-plan-file-patch-reference.md` remains in place.
4. Confirm `src/file-navigator/remote/port-mapped.ts` exports `remotePaste` and `src/file-navigator/remote/port.ts` imports it from `./port-mapped.js` and delegates its paste request to it.
5. Make no file edits. A failed check is the only reason to change code, and then only the exact gap that failed.

## Tests

No runtime behavior changes and no tests to add. Verify the five checks above by reading the plans and the two remote-port files, then run `$janissary/scripts/run.mjs check-diff`.

## Spec and documentation

No functional spec or user documentation changes. The fix records a plan-history outcome; no user-visible behavior changes, and no `help/` page or user documentation describes plan file locations.

## Out of scope

- Resurrecting, recreating, or editing `product/plans/ready/web-search.md` or `product/plans/complete/web-search.md`.
- Editing, moving, or deleting `product/plans/complete/refresh-web-search-plan-file-patch-reference.md`; it stays as the historical record.
- Changing the `remotePaste` extraction, the `port.ts` delegation, or any other production code.
- Changing the branch's file-patch plan move or the pull request description.
