<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share one planned folder between case-only spellings so a patch under differently cased folders succeeds on a case-insensitive volume.

Existing Issue: derivePlannedFolders in src/file-patch/view.ts and the folder merge in buildPatchChanges in src/file-patch/changes.ts deduplicate by exact string, so on a case-insensitive volume a patch that adds one file under A/ and another under a/ plans both spellings, and commitChanges runs mkdir for each, failing the whole patch with EEXIST while applying. Severity: 4/10

Existing Risk: 4/10 - A valid multi-file refactor under case-variant folders fails on macOS and Windows with a filesystem-looking applying error and no changes, so the user must discover the case inconsistency and rename folders before the feature works.

Proposal Risk: 2/10 - Folding the folder list changes only which mkdir and rmdir entries run and which first spelling is reported; a wrong key could merge genuinely distinct folders on a case-sensitive volume, so the fold must use the same cached volume decision and must not fold on a case-sensitive volume.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "share one planned folder between case-only spellings". In src/file-patch/view.ts, make derivePlannedFolders deduplicate by the same planKey used by the planned-folder counter, keeping the first spelling it sees, and expose the view's case decision, or a folderKey helper, through PatchViewReads. In src/file-patch/changes.ts, merge view.plannedFolders() with the move destinations' missingFolders through that key as well, keeping the first spelling and the existing shallowest-first order, so a folder from an intermediate move hop is folded with a planned folder of the other case. Add a view.test.ts case with createPatchView(root, true) adding A/b/first and a/c/second that asserts one planned list carries the first folder once and still includes the children; add a guarded apply.test.ts case on a case-insensitive volume that applies two Adds under A/b and a/c and expects Patched 2 files: with both rows. Keep the existing case-only view and apply cases, the planned-folder derivation case, and the commit folder cases passing unchanged.


* Make the case-insensitivity probe skip entries it cannot canonicalize so a broken root link does not disable case folding.

Existing Issue: volumeIgnoresCase in src/file-patch/volume-case.ts returns the first lettered entry's verdict from sameEntry, which catches a realpathSync.native failure and reports case-sensitive, so a root whose first lettered entry is a broken symlink, or an empty root whose basename has no ASCII letter, is misdetected on a case-insensitive volume and the view keeps case-only patch paths as distinct places. Severity: 3/10

Existing Risk: 3/10 - On the affected roots, `*** Add File: a.txt` followed by `*** Add File: A.txt` writes twice and reports two added rows for one file, exactly the silent result the case-only repair was meant to prevent.

Proposal Risk: 1/10 - The probe stays read-only and only continues past inconclusive entries; an exotic filesystem can still be misdetected, but no worse than today.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "make the case probe skip unreadable root entries". In src/file-patch/volume-case.ts, split sameEntry's answer into a confirmed different entry (false) and an entry that could not be canonicalized (undefined), and have probeEntries continue to the next lettered entry on undefined instead of returning the first verdict; when every entry is inconclusive, fall back to probeName, and when the root's own basename has no ASCII letter, probe the nearest existing ancestor's entries before returning false. Add a view.test.ts case whose root's only lettered entry is a broken symlink (or whose readdir order is pinned so that link is first) and assert volumeIgnoresCase still matches the read-only case toggle, plus a guarded empty-root case with a non-ASCII basename on a case-insensitive volume; keep the existing reports-the-case-behavior test and all case-only view and apply cases passing.


* Report patch rows in the order each path is first named rather than the order an implicit link target is resolved.

Existing Issue: patchRows in src/file-patch/rows.ts walks view.places() in resolution order, and a link's target place is created implicitly while following the link, so a target named in a later section sorts ahead of paths named earlier, and the success rows contradict the plan's and help's order of first appearance. Severity: 2/10

Existing Risk: 2/10 - A transcript can order a later path before an earlier one, which makes the patch harder to review and contradicts the documented output; file content and the tree are unchanged.

Proposal Risk: 1/10 - A first-named ordinal must be assigned once, when a place is first resolved non-implicitly, including an implicit place that is later named; a mistake would reorder every row.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "report patch rows in first-named order". Add a firstNamed ordinal to PatchPlace in src/file-patch/view-entry.ts and assign it in resolvePath in src/file-patch/view.ts when implicit is false and the place has no ordinal yet, so an implicit link target takes its position when a section names it; keep the field optional or defaulted so the handwritten PatchPlace fixtures in sections.test.ts stay valid. Have patchRows in src/file-patch/rows.ts sort the emitted rows by that ordinal while keeping the existing R-origin and destination-skip rules. Add a sections.test.ts case with target and link present, sections that update link, delete old, and then update target, asserting rows appear as link, old, target; keep the existing named-link row case, the destination-new row case, and every other row test passing unchanged.


* Qualify the patch help and spec's unconditional restore promise so the failed-restore case is visible.

Existing Issue: help/file.md says every check runs before anything is written and any failure leaves every file as it was, and product/specs/acp.md says a patch that fails while writing puts back every path it changed, while product/plans/complete/file-patch.md's failure-while-applying decision and help/file.md's own applying-failure bullet allow a failed restore to leave some files changed. Severity: 2/10

Existing Risk: 2/10 - A reader can conclude no failed patch ever needs the tree inspected, when a failed restore is exactly the case that can leave changed files behind.

Proposal Risk: 1/10 - The reworded sentences must keep the ordinary restore success path and the documented Some files may have been changed exception distinct, so a reader does not think every failure may leave files changed.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "qualify the patch help and spec restore promise". In help/file.md's Patching several files section, replace the sentence that every check runs before anything is written and any failure leaves every file as it was with one that says sections are checked against the in-memory view before anything is written, that a failure while applying restores the files already changed, and that a failed restore can leave some files changed, pointing to the applying-failure bullet. In product/specs/acp.md's file patch section, add the same qualification to the sentence about a patch that fails while writing, naming the Some files may have been changed line beside the ordinary No files were changed line. Do not change the runner or the applying-failure implementation; the fix plans' restore cases and the help applying-failure bullet remain the behavior. Keep the rest of the patch help and spec untouched.
