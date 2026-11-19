# Fix: correct the stale saved-host unusable-file notification comment

**Complexity: 1/10** — ~3 comment lines in 1 file, 1 requirement, 0 new test scenarios or units (p=2.66).

## Goal

The comment above `resolveRemoteLaunchAddress` in `src/remote/saved-host.ts` claims the catalog's deduplicated "unusable file" report is forwarded to the origin's transcript. That claim is wrong. The code posts the report as a manual notification attributed to the caller label into the notifications feed, and the report never enters a transcript. Rewrite the comment so it matches the code and `product/specs/ssh-tab.md`. No behavior changes.

## Approach

`resolveRemoteLaunchAddress` already calls `notify(managers, 'manual', originLabel, message)` from the `readHostsFile` report callback. That is exactly what `product/specs/ssh-tab.md` requires: when the file in effect cannot be used, its problem is reported once as a manual notification attributed to the tab the command was typed in and shown in the notifications feed rather than written into that tab's transcript. The existing `src/remote/saved-host.test.ts` pins both the `'manual'` notify call with the `originLabel` and the once-per-problem message, so the executable code is correct and only the comment is stale. The fix rewrites just the one sentence in the comment block above the function. The rest of the block and all executable code stay untouched.

## Implementation steps

1. In `src/remote/saved-host.ts`, replace the sentence in the comment above `resolveRemoteLaunchAddress` that reads "The catalog's own shared, deduplicated 'unusable file' report is forwarded to the origin's transcript" with wording that says the report is posted once as a manual notification attributed to the caller label into the notifications feed and is never written into a transcript.
2. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests: the change is comment text only and does not alter behavior. Existing tests in `src/remote/saved-host.test.ts` already pin the `notify(managers, 'manual', originLabel, message)` call and the once-per-problem message, and must keep passing unchanged.

## Out of scope

- No executable code changes and no behavior change.
- No spec change: `product/specs/ssh-tab.md` already states the correct behavior.
- No help or user-documentation change.
- No change to any other file.
