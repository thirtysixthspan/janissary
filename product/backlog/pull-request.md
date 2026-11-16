<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Correct the ACP user-doc fix plan's claim that the completed default-grants subplan is kept byte-for-byte as history, which the later repair in the same range undid.

Existing Issue: `product/plans/complete/acp-user-doc-web-search-routing-claim.md` says `product/plans/complete/web-search-13-default-grants.md` "is kept byte-for-byte as history", while the repair recorded in `product/plans/complete/web-search-saved-tell-verification-expectation.md` rewrote that subplan's Verification step 3 in place, so the repair record now misstates the branch's final state. Severity: 2/10

Existing Risk: 3/10 - A reader trusts the history claim and assumes the subplan is untouched, so the two repair records disagree about whether its verification text is current and the stale documentation instruction beside it looks frozen.

Proposal Risk: 1/10 - The two fix plans agree after the wording change; the subplan's recorded user-doc instruction stays historical while its corrected verification step is explicitly identified, so no future reader has to guess which parts were maintained.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2010 "reconcile the ACP user-doc fix plan's history claim with the corrected default-grants subplan". In `product/plans/complete/acp-user-doc-web-search-routing-claim.md`, reword the Issue section's sentence "The completed subplan `product/plans/complete/web-search-13-default-grants.md` records the older, incorrect user-doc wording. It is kept byte-for-byte as history; this plan records the correction." so the history claim covers only the subplan's recorded user-doc wording, and note that a separate repair, recorded in `product/plans/complete/web-search-saved-tell-verification-expectation.md`, corrected the subplan's Verification step 3 in place. Leave the user doc, the subplan, both fix plans' other sections, and every source and test file unchanged. Verify by reading the two fix plans together and by confirming `git diff 238a0fe1..285b9ace -- product/plans/complete/web-search-13-default-grants.md` shows only the Verification step 3 line.
