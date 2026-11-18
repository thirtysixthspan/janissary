# Correct the stale fourteen-command baseline in the subagent plan

**Complexity: 1/10** — one-word prose substitution in a plan document: 0 production files/lines, 0 requirements, 0 scenarios, 0 new units (p=1.578).

The completed `subagent` plan carries one stale count in its Specs and docs section. Its "Exact
files" bullet says the tell help page and the two roles specs update the tell grant count from
fourteen to eighteen. The pre-change text in all three named files actually carried seventeen
native commands before `subagent` was added, and the eighteen-command target is already recorded
elsewhere. Only the plan's stated starting baseline is wrong; every code, spec, help, and
user-documentation count is already correct at eighteen.

## Goal

Make the plan's Specs and docs bullet state the true pre-change baseline so a reader reconciling
the plan against the specs sees the same count the files actually carried. No behavior, count, or
published document changes — only one word in one planning document.

## Approach

A single one-word prose substitution inside the named bullet of `product/plans/complete/subagent.md`:
"update the tell grant count from fourteen to eighteen" becomes "update the tell grant count from
seventeen to eighteen". Everything else in the file, including its `**Complexity: 9/10**` line,
stays byte-for-byte unchanged. The entry calls for no PR description change, so the title and body
are left alone.

## Implementation steps

1. In `product/plans/complete/subagent.md`, in the Specs and docs "Exact files" bullet, change
   `fourteen` to `seventeen` in the phrase about the tell grant count.
2. Re-read the edited bullet and confirm the plan's complexity line and all other content are
   unchanged.
3. Confirm the three named files (`help/tell.md`, `product/specs/roles.md`,
   `documentation/user-documentation/tab-types/roles.md`) already say eighteen and are not edited,
   and that the eighteen target in
   `product/plans/complete/correct-stale-native-command-counts-in-subagent-specs.md` is untouched.
4. Run `$janissary/scripts/run.mjs check-diff` (plan-only change; nothing scoped to lint or test).

## Tests

None — no code changed. Verification is re-reading the edited bullet and confirming the three
named files and the count-correction plan remain untouched. `NATIVE_ACP_COMMANDS` remains the
source of truth and is not edited.

## Out of scope

- Any code, spec, help, or user-documentation count change — all already say eighteen.
- The `subagent` plan's `**Complexity: 9/10**` line and every other part of that plan.
- The other count-correction plan, which already records the eighteen-command target.
- The pull request's title and description — the entry names no description correction.

## Verification

Re-read the edited bullet in `product/plans/complete/subagent.md`; confirm the word is now
`seventeen`, the count now reads "from seventeen to eighteen", and no other line of the plan
changed. Confirm the three named files still say eighteen. Run
`$janissary/scripts/run.mjs check-diff`.
