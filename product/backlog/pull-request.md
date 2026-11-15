<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's documentation audit by correcting the ACP spec's stale section references for content search and the full file primer.

Existing Issue: `product/specs/acp.md` still says content search is described under File glob even though the `grep-files` operation is documented under File grep, and its File read section says the full file primer is described only under File grep and File write and edit tools even though the glob primer is documented under File glob. Severity: 3/10

Existing Risk: 2/10 - A reader or later editor following the spec's content-search or primer reference lands in the wrong section and can copy the stale routing into another change, leaving the ACP spec internally inconsistent.

Proposal Risk: 1/10 - The corrections are prose-only and cannot affect runtime behavior; the remaining risk is that another stale cross-reference in the same page is missed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2005 "correct the ACP spec's stale section references for content search and the full file primer". In `product/specs/acp.md`, change the File read section's sentence that says content search is described under File glob so it points to File grep, which documents `grep-files` and its remote root, and update the same section's full-primer cross-reference to name File glob, File grep, and File write and edit tools, since each supplies one primer part. Keep every behavioral statement, the section order, and the File glob section's path-listing scope unchanged, and leave the other ten audited documentation pages untouched. Re-read the File read, File glob, File grep, and File write and edit tools sections to confirm no remaining cross-reference sends grep or primer readers to the wrong section. No source or test change is needed; run `npm run docs:build` from the subplan's verification step and confirm it reports no broken links, while the existing help and docs checks keep passing.
