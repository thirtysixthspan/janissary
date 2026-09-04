# pull-request

## ready

## development

* Cross-reference the two task files that now carry the same entry format and scales, so an edit to either meets a pointer to its twin.

Existing Issue: The task restates the five-part entry format, the two scoring scales, the two-blank-lines separator, and the dedupe rule that `find-technical-debt.md` already defines, and neither file mentions the other, so the two copies are held in sync only by whoever happens to remember both exist. Severity: 4/10

Existing Risk: 4/10 - The copies drift on the next edit to either — they have already drifted, since the severity tables differ while the risk tables are identical — and the backlog files they produce stop being comparable without anyone noticing, because no test, lint rule, or reference connects them.

Proposal Risk: 2/10 - An editor of either file meets a pointer to the other, but nothing enforces that they act on it, so a deliberate divergence still lands silently and only a reader comparing both files will see it.

Proposal: `ai/tasks/pull-request-review.md` and `ai/tasks/research/find-technical-debt.md` each define the same entry shape under their own headings. The restatement itself is deliberate and should stay — the plan at `product/plans/complete/pull-request-review.md` argues that a task must stand alone rather than send its reader to another file mid-run, and that reasoning holds. What is missing is the pointer. Add one sentence to the "The entry format" section of `ai/tasks/pull-request-review.md` naming `ai/tasks/research/find-technical-debt.md` as the file this format is shared with, and one sentence to that file's Step 4 naming this one, each saying that the two are intentional copies and that a change to the format or either scale belongs in both. Say plainly where they already differ on purpose: the first labeled paragraph is `Existing Issue` here and `Existing Debt` there, and the severity scale is reworded for pull-request review while the risk scale is identical. Do not attempt to extract the shared format into a third file that both include — task files in `ai/tasks/` are self-contained prompts with no include mechanism, and splitting one would break the property that an agent can execute a task from a single file.

## deferred

## declined
