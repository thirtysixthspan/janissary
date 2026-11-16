# Reconcile the ACP user-doc fix plan's history claim with the corrected default-grants subplan

**Complexity: 1/10** — no production lines or files, one history-claim sentence corrected and 1 requirement (p=2.07)

## Goal

`product/plans/complete/acp-user-doc-web-search-routing-claim.md` must describe the completed default-grants subplan accurately: only its recorded user-doc wording is kept byte-for-byte as history, and a separate repair rewrote its Verification step 3 in place. A reader must not be told that the whole subplan is untouched when one line of it is current.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the ACP user-doc fix plan's claim that the completed default-grants subplan is kept byte-for-byte as history, which the later repair in the same range undid.

The Issue section of `product/plans/complete/acp-user-doc-web-search-routing-claim.md` says:

> The completed subplan `product/plans/complete/web-search-13-default-grants.md` records the older, incorrect user-doc wording. It is kept byte-for-byte as history; this plan records the correction.

That claim was true when the ACP plan landed. The later repair recorded in `product/plans/complete/web-search-saved-tell-verification-expectation.md` then rewrote Verification step 3 of the same subplan in place, because that step is an instruction for whoever checks the still-open pull request rather than a record of what was planned. So the ACP plan's history claim now covers more than the branch's final state supports.

Verified against the branch history:

- `git diff 238a0fe1..285b9ace -- product/plans/complete/web-search-13-default-grants.md` shows exactly one changed line: the old Verification step 3, which promised a `Command not allowed for role "tell": web search.` refusal, replaced by the corrected expectation that a saved `tell` without the grant gets no web tool and that a model-emitted line stays prose. No other line of the subplan differs.
- `product/plans/complete/web-search-saved-tell-verification-expectation.md` records that repair and states it changed only that step: its Out of scope keeps the subplan's Design decisions, Proposed changes, Tests, and Out of scope sections byte-for-byte.
- The subplan's recorded user-doc instruction — Proposed changes, item 4, the sentence beginning "a granted `web search` also runs on the host running the agent" — is untouched, so the ACP plan's historical reference to it is still correct.

## Approach

1. In the Issue section of `product/plans/complete/acp-user-doc-web-search-routing-claim.md`, replace the two-sentence history claim with wording that scopes the byte-for-byte claim to the subplan's recorded user-doc wording and names the separate repair that rewrote Verification step 3 in place.
2. Leave the rest of that plan byte-for-byte: Goal, the earlier Issue paragraphs, Approach, Design decisions, Proposed changes, Tests, Verification, Spec, Out of scope, and Rating basis.
3. Leave `product/plans/complete/web-search-13-default-grants.md` and `product/plans/complete/web-search-saved-tell-verification-expectation.md` unchanged; the correction is to the citation, not to either cited plan.
4. Re-read the two fix plans together and confirm they now agree about which parts of the subplan are historical and which are current.

## Design decisions

- **Scope the history claim to the wording it describes.** The ACP plan's point is that the subplan records an older user-doc instruction which this plan supersedes. That wording is still exactly where the plan says it is, so the byte-for-byte claim stays, narrowed to the recorded user-doc wording instead of the whole file.
- **Name the separate repair.** The saved-tell plan, not this one, changed the subplan. Citing it by path lets a reader follow the one line that differs instead of assuming the subplan is frozen or that this plan edited it.
- **Change only the one sentence pair.** Both plans' other sections already describe their own work correctly; the defect is a single citation that broadened a history claim, and editing anything else would rewrite records this entry did not name.
- **Touch neither cited plan.** The subplan's Verification step 3 is deliberate and current; the saved-tell plan's record of it is accurate. Only the ACP plan's statement about them is wrong.

## Proposed changes

One markdown file changes. In `product/plans/complete/acp-user-doc-web-search-routing-claim.md`, the last paragraph of the Issue section becomes:

```markdown
The completed subplan `product/plans/complete/web-search-13-default-grants.md` records the older, incorrect user-doc wording. That recorded wording is kept byte-for-byte as history; this plan records the correction. A separate repair, recorded in `product/plans/complete/web-search-saved-tell-verification-expectation.md`, rewrote the subplan's Verification step 3 in place, so that one step is current while the subplan's recorded user-doc wording remains historical.
```

No source, test, config, spec, `help/`, user-documentation, or other plan change.

## Tests

No test changes. The two fix plans and the subplan are prose records; nothing in `src/` or `web/src/` changes behavior.

Verify the prose by reading it:

- The history claim now covers the subplan's recorded user-doc wording only, not the whole file.
- It names `product/plans/complete/web-search-saved-tell-verification-expectation.md` as the repair that rewrote Verification step 3, and says that step is current.
- The ACP plan's other sections and both cited plans are byte-for-byte unchanged.

`$janissary/scripts/run.mjs check-diff` must still pass, as a documentation-only diff.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Read `product/plans/complete/acp-user-doc-web-search-routing-claim.md` beside `product/plans/complete/web-search-saved-tell-verification-expectation.md` and confirm they agree on what the repair changed.
- Confirm `git diff 238a0fe1..285b9ace -- product/plans/complete/web-search-13-default-grants.md` shows only the Verification step 3 line, so the narrowed history claim matches the branch's final state.

## Spec

No spec change. `product/specs/web-search.md` and `product/specs/acp.md` already describe the runtime behavior both plans concern, and this fix changes no behavior or user-visible contract.

## Out of scope

- `product/plans/complete/web-search-13-default-grants.md`; its Verification step 3 is current and its recorded user-doc wording is the history this plan cites.
- `product/plans/complete/web-search-saved-tell-verification-expectation.md`; its record of the repair is accurate.
- The ACP plan's Goal, earlier Issue paragraphs, Approach, Design decisions, Proposed changes, Tests, Verification, Spec, Out of scope, and Rating basis.
- `documentation/user-documentation/advanced-agents/acp-agent.md` and every other user-documentation page.
- Any source or test file.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited file is a completed plan. The single requirement is that the ACP plan's history claim name only the subplan's recorded user-doc wording and identify the separate repair that rewrote Verification step 3 in place. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
