<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the functionality gap where a double-click on the scripts tab's New script button creates two runscripts, which the row buttons already prevent.

Existing Issue: The New script button sends a create intent on every click with no click-count check, so a double-click creates untitled.rs and untitled-2.rs and opens both in editor tabs, while the Run and Duplicate row buttons already ignore the second click of a double-click. Severity: 4/10

Existing Risk: 4/10 - A habitual double-click leaves an extra empty untitled runscript in .janissary/scripts that appears in the list and in tab completion, along with a second editor tab the user has to close.

Proposal Risk: 2/10 - A deliberate fast second click on New script is ignored, the same trade the row buttons already make, and a single click still creates exactly one file.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "make a double-click on the New script button create one runscript". In web/src/plugins/scripts/ScriptsTab.tsx, the header button's onClick is createScript, which sends the create intent unconditionally. Route that click through a handler that returns without sending when the event's detail is above 1, using the same rule web/src/plugins/scripts/ScriptRowActions.tsx applies to Run and Duplicate, and carry a comment that names the second click of a double-click. Leave createScript's single-click path, the create intent, and the server side unchanged, in web/src/plugins/runscript-topic-actions.ts (createOne) and web/src/schedule/system/runscript-files.ts (newUntitledRunscript), because a single click and a keyboard Enter on the focused button, which arrives with detail 0, must still create exactly one file. Verify with a new case in web/src/plugins/scripts/ScriptsTab.test.tsx, under the describe named ScriptsTab new script button, that fires a click on the element labelled New script with detail 1 and then with detail 2, and expects the intent spy to have been called exactly once, with create and an empty object. The existing cases in that describe, including the one that expects a single click to send create, must keep passing untouched. Add one sentence to the Create section of product/specs/scripts-tab.md stating that a double-click on New script creates one runscript, so the spec describes the code as the Row actions section already does for Run and Duplicate.


* Correct the scripts spec's Open and Clone sentences, which say the runscript or its copy opens in an editor tab even above the size limit that the spec's own failure table refuses.

Existing Issue: The Open section says the runscript opens in an editor tab, and the Clone section says the copy opens in one, but a file above the editor's two-megabyte limit opens in neither case, and the notifications feed shows the size refusal, which only the Failure text table states. Severity: 2/10

Existing Risk: 3/10 - A reader who takes the Open and Clone sentences at face value may treat the refusal as a defect and remove it, which would let a multi-megabyte buffer load into an editor the size limit exists to keep out.

Proposal Risk: 1/10 - The sentences and the failure table would agree, so the refusal is stated where each operation is described and the limit stays in place.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the editor size refusal in the scripts spec's Open and Clone sentences". In product/specs/scripts-tab.md, qualify the sentence in the Open section that says the runscript opens in an editor tab, and the sentence in the Clone section that says the copy opens in one, so each says it opens unless the file is above the editor's two-megabyte limit, in which case the notifications feed shows the size refusal and nothing opens. For Clone, also say that the copy is still created on disk. Point to the oversized row of the Failure text table for the exact wording rather than repeating it. Make no code change, since the behavior is correct and is pinned by two tests in src/plugins/runscript-topic-actions.test.ts: one that refuses an oversized runscript in the feed instead of opening it, and one that keeps an oversized duplicate on disk and posts the refusal for the copy. Leave the pull request body as it is, since its Flow 7 already states the refusal and the author decides whether its Open and Duplicate steps need the same qualifier. After editing, read the two changed sentences against those tests and the oversized row to confirm the three say the same thing.
