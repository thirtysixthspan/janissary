# Correct the malformed hosts diagnostic's documented destination

**Complexity: 1/10** — spec-only single-sentence edit with no production code, files, tests, or new units; one documentation-accuracy requirement (p=2.07).

## Summary

The SSH tab spec's "Saved host destinations" section currently says that when the effective hosts file cannot be used, the file's problem is "posted once to the transcript the command was typed in." The delivered behavior is different: `SshManager.run` forwards `readHostsFile`'s diagnostic to `notify(managers, 'manual', creatorLabel, message)`, and the notification pipeline appends that entry to the notifications feed attributed to the originating tab. It is never written into that tab's transcript. This fix corrects only that sentence so the spec matches what the code does. No production code, tests, or behavior change.

## Approach

Verify the claim against the code, then rewrite the single misleading sentence in `product/specs/ssh-tab.md` to describe the manual notification in the feed. Preserve the deduplication wording ("once") and the following sentence about a valid personal catalog still supplying the match when a project file is malformed. Leave everything else in the spec untouched.

Code verification (already confirmed, no edits needed):

- `src/ssh-manager.ts:29-31` — `readHostsFile(..., (message) => notify(this.managers, 'manual', creatorLabel, message))`: the diagnostic goes to a `'manual'` notification attributed to `creatorLabel`, not to a transcript append.
- `src/notifications/deliver.ts:42-45` — the notification is appended to the queue/record and written into the notifications feed (`appendNotification` / `appendNotificationRecord`), with repeated diagnostics collapsing to one entry.
- `src/ssh-manager.test.ts:182-208` — the existing single-notification assertions (`notify` called once with `'manual'` and the creator label) already lock in this behavior and must not be changed.

## Implementation steps

1. In `product/specs/ssh-tab.md`, under "Saved host destinations", replace the sentence "When the file in effect cannot be used, the name is treated as a literal destination and the file's problem is posted once to the transcript the command was typed in." with a sentence stating the problem is reported once as a manual notification attributed to the tab the command was typed in and shown in the notifications feed rather than written into that tab's transcript.
2. Keep the following sentence, "A valid personal catalog still supplies the match when a project file is malformed.", unchanged.

## Tests

No new tests. This is a spec-only documentation correction with no behavior change. The existing single-notification test in `src/ssh-manager.test.ts` (`uses a usable home catalog after a malformed project file and reports the problem once` and its literal-fallback sibling) already covers the delivered behavior and must remain passing untouched.

## Out of scope

- Any production code change in `src/ssh-manager.ts`, `src/notifications/deliver.ts`, or elsewhere — the behavior is correct and stays as-is.
- Any change to the existing tests in `src/ssh-manager.test.ts`.
- Changes to other sentences in `product/specs/ssh-tab.md` beyond the single sentence named above.
- PR description edits — the work item does not call for one.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` and confirm all checks pass.
- Confirm the existing `src/ssh-manager.test.ts` single-notification assertions still pass unchanged.
- Confirm `product/specs/ssh-tab.md` now describes the manual notification in the notifications feed, keeps the "once" deduplication wording and the valid-personal-catalog sentence, and is otherwise unchanged.
