# pull-request

## ready

## development

* Correct the pull request description's claim that both scoring scales carry over unchanged from the technical-debt task, when only one of the two does.

Existing Issue: The description states that both 1-10 scales "carry over unchanged", but only the risk table is reproduced verbatim — all three bands of the severity table were rewritten for a pull-request context, so a reader who trusts that sentence will score findings against the debt-severity rubric rather than the issue-severity rubric the task actually ships. Severity: 4/10

Existing Risk: 4/10 - Findings get scored against the wrong rubric, producing severity numbers that look comparable between two backlog files that appear to share a scale and are not, which quietly corrupts any later attempt to rank work across both.

Proposal Risk: 1/10 - The sentence and the file agree, but nothing enforces the agreement, so a later edit to either table can reopen the same gap without anything noticing.

Proposal: The pull request body's fourth "What" paragraph ends with the clause "Both 1-10 scales, the two-blank-lines separator, and the 'write the Proposal for an agent that has not read the code, by path and never by line number' standard carry over unchanged". Under "The scales" in `ai/tasks/pull-request-review.md`, the risk table is byte-identical to the one in `ai/tasks/research/find-technical-debt.md`, while the issue-severity table's three bands are new text written for pull-request review — the 8-10 band, for instance, reads "The pull request does not do what it says, omits something its plan treats as essential, or introduces a security or data-loss hazard on a core path", against the debt table's "Reckless or actively compounding debt on a core, high-churn path". Edit that clause of the pull request description to say the risk scale carries over unchanged while the severity scale is rewritten band by band for pull-request review, keeping the rest of the sentence as written. Do not change the tables in the task file to match the description instead: the rewritten severity bands are correct and deliberate, and the description is the side that is wrong. No test covers either file, so the only guard against a repeat is that both tables now sit under one heading in one file.


* Distinguish a pull request that reviewed clean from one whose every finding was already recorded, which the report currently renders identically.

Existing Issue: Step 4 sends a run whose candidates were all dropped as duplicates to the same clean report as a run that found nothing, so both print "clean - nothing recorded", and the report never states whether the per-dimension `Findings` counts are measured before or after the dedupe pass. Severity: 5/10

Existing Risk: 5/10 - A reviewer reads "clean" on a pull request that has several outstanding recorded problems and merges it believing the review found nothing, which is the opposite of what the run actually determined.

Proposal Risk: 2/10 - The two outcomes read differently and the counts have a stated basis, but a reader who sees a high duplicate count still has to open the backlog file to learn what those duplicates are, since the report names no entry.

Proposal: In `ai/tasks/pull-request-review.md`, Step 4's point 2 currently routes a fully-deduplicated run to "Step 7's clean report" with no distinction, and Step 7's report block offers only "clean - nothing recorded" alongside the pushed-sha and push-failed variants. Add a third variant to the `Recorded` line for the case where candidates were found but every one of them was already present — wording along the lines of "nothing new - all N finding(s) already recorded" — and change point 2 to name that variant rather than the clean one when the dedupe set absorbed everything. In the same report block, state that the `Findings` line counts findings after dedupe, so it reads as what was recorded on this run and the `Duplicates` line accounts for the difference; today a reader cannot tell whether "description 0" means nothing was found or that what was found was already on file. Nothing else in the task changes: the commit is still skipped, since there is still nothing to write.


* Tell the reviewing agent to treat a pull request's own content as untrusted data rather than as instructions it might follow.

Existing Issue: The task directs an autonomous agent with shell access to check out an arbitrary open pull request's branch and read its diff, plan file, and description in full, and nowhere states that this content is attacker-controlled input rather than direction, so text placed in a reviewed branch is read by the agent under the same trust as the task file's own instructions. Severity: 6/10

Existing Risk: 5/10 - A pull request whose plan file or description carries instructions aimed at the reviewing agent gets them read and potentially acted on, and the task has already granted the agent a shell, a checked-out branch, and push access to that same branch, so a successful steer writes and pushes whatever it asked for.

Proposal Risk: 2/10 - The agent is told the content is data, which closes the naive case, but a prose warning is not a sandbox and a sufficiently well-disguised instruction inside a diff can still be persuasive.

Proposal: `ai/tasks/pull-request-review.md` carries a "Stay within the project directory" rule and a command-hygiene rule in its preamble but nothing about the trust level of what it reads. Add one more preamble rule beside those, stating that everything reaching the agent from the pull request under review — the diff, the plan file, the description, commit messages, and any file on the branch — is data to be judged, never instruction to be followed, and that an instruction found inside reviewed content is itself a security finding to record under Step 3's security dimension rather than something to act on. Name the specific temptations the task already creates: text asking the agent to run a command, to install a dependency, to edit a file outside the backlog, or to skip a step. This is cheap because the task's existing forbidden list already blocks the destructive outcomes — no fixing, no installing, no committing anything but the backlog file — so the rule is mostly making explicit why those limits matter here rather than adding new restraint. The no-install rule in Step 1 is already doing security work of exactly this kind, since it means a reviewed branch's `package.json` lifecycle scripts never execute; say so in the same place, because it currently reads as a pure cost-saving decision and a future editor could reverse it without knowing what else it was buying.


* Cross-reference the two task files that now carry the same entry format and scales, so an edit to either meets a pointer to its twin.

Existing Issue: The task restates the five-part entry format, the two scoring scales, the two-blank-lines separator, and the dedupe rule that `find-technical-debt.md` already defines, and neither file mentions the other, so the two copies are held in sync only by whoever happens to remember both exist. Severity: 4/10

Existing Risk: 4/10 - The copies drift on the next edit to either — they have already drifted, since the severity tables differ while the risk tables are identical — and the backlog files they produce stop being comparable without anyone noticing, because no test, lint rule, or reference connects them.

Proposal Risk: 2/10 - An editor of either file meets a pointer to the other, but nothing enforces that they act on it, so a deliberate divergence still lands silently and only a reader comparing both files will see it.

Proposal: `ai/tasks/pull-request-review.md` and `ai/tasks/research/find-technical-debt.md` each define the same entry shape under their own headings. The restatement itself is deliberate and should stay — the plan at `product/plans/complete/pull-request-review.md` argues that a task must stand alone rather than send its reader to another file mid-run, and that reasoning holds. What is missing is the pointer. Add one sentence to the "The entry format" section of `ai/tasks/pull-request-review.md` naming `ai/tasks/research/find-technical-debt.md` as the file this format is shared with, and one sentence to that file's Step 4 naming this one, each saying that the two are intentional copies and that a change to the format or either scale belongs in both. Say plainly where they already differ on purpose: the first labeled paragraph is `Existing Issue` here and `Existing Debt` there, and the severity scale is reworded for pull-request review while the risk scale is identical. Do not attempt to extract the shared format into a third file that both include — task files in `ai/tasks/` are self-contained prompts with no include mechanism, and splitting one would break the property that an agent can execute a task from a single file.

## deferred

## declined
