<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the scripts spec's Open and Clone sentences, which say the runscript or its copy opens in an editor tab even above the size limit that the spec's own failure table refuses.

Existing Issue: The Open section says the runscript opens in an editor tab, and the Clone section says the copy opens in one, but a file above the editor's two-megabyte limit opens in neither case, and the notifications feed shows the size refusal, which only the Failure text table states. Severity: 2/10

Existing Risk: 3/10 - A reader who takes the Open and Clone sentences at face value may treat the refusal as a defect and remove it, which would let a multi-megabyte buffer load into an editor the size limit exists to keep out.

Proposal Risk: 1/10 - The sentences and the failure table would agree, so the refusal is stated where each operation is described and the limit stays in place.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the editor size refusal in the scripts spec's Open and Clone sentences". In product/specs/scripts-tab.md, qualify the sentence in the Open section that says the runscript opens in an editor tab, and the sentence in the Clone section that says the copy opens in one, so each says it opens unless the file is above the editor's two-megabyte limit, in which case the notifications feed shows the size refusal and nothing opens. For Clone, also say that the copy is still created on disk. Point to the oversized row of the Failure text table for the exact wording rather than repeating it. Make no code change, since the behavior is correct and is pinned by two tests in src/plugins/runscript-topic-actions.test.ts: one that refuses an oversized runscript in the feed instead of opening it, and one that keeps an oversized duplicate on disk and posts the refusal for the copy. Leave the pull request body as it is, since its Flow 7 already states the refusal and the author decides whether its Open and Duplicate steps need the same qualifier. After editing, read the two changed sentences against those tests and the oversized row to confirm the three say the same thing.
