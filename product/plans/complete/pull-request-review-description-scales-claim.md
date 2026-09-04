# Correct the scales claim in pull request 978's description

**Complexity: 2/10** — no file in the repository changes behavior. The delivery is a one-clause correction to a pull request description, plus this plan and the backlog entry removal that record it.

## Goal

Pull request 978's description states that, of what carries over from `ai/tasks/research/find-technical-debt.md` into `ai/tasks/pull-request-review.md`, "Both 1–10 scales … carry over unchanged". Only one of the two does. Verified against both files:

- The **risk** table is byte-identical in both — all three bands, word for word.
- The **issue-severity** table shares no band with the debt-severity table it replaced. Its 8–10 band reads "The pull request does not do what it says, omits something its plan treats as essential, or introduces a security or data-loss hazard on a core path", against the debt table's "Reckless or actively compounding debt on a core, high-churn path"; the 1–3 and 4–7 bands differ likewise.

A reader who trusts the sentence will score findings against the debt-severity rubric rather than the issue-severity rubric the task actually ships, producing numbers that look comparable between the two backlog files and are not.

## Approach

The rewritten severity bands are correct and deliberate — they exist because four of the five dimensions this task reviews are not technical debt, which the same paragraph of the description already says. The description is the side that is wrong, so the description is the side that changes. The tables stay as they are.

`ai/tasks/work-an-issue.md`'s PR update mode gained the ability to deliver exactly this class of fix in pull request 980. Step 8 applies the edit after the push, reads the current body with `gh pr view --json body`, and writes the full revised body back through `gh pr edit --body-file`, preserving every paragraph the entry does not name.

## Design decisions

1. **The description changes; the task file does not.** Editing the tables to match the sentence would be the wrong repair — it would replace three bands written for pull-request review with three written for codebase-sweep technical debt, in a file whose entries are mostly not debt at all.

2. **Only the offending clause is rewritten.** The sentence it sits in also covers the two-blank-lines separator and the "write the `Proposal` for an agent that has not read the code, by path and never by line number" standard, both of which genuinely do carry over unchanged. Those stay as written, as does every other paragraph of the body. `gh pr edit` replaces the body wholesale, so preservation is this task's responsibility.

3. **The corrected clause names which scale is which**, rather than softening "both … unchanged" into something vaguer like "the scales are adapted". The whole failure was a reader being unable to tell the two apart, so the fix has to distinguish them by name or it does not fix anything.

4. **No cross-file guard is added here.** Nothing enforces that the two files' scales stay in whatever relationship the description claims, and a fourth entry already in this backlog — "Cross-reference the two task files that now carry the same entry format and scales" — is where that belongs. Doing it here would resolve two entries in one run under one entry's plan.

## Implementation steps

No file in the repository is edited for the fix itself. The deliverable is applied in Step 8 of `ai/tasks/work-an-issue.md`:

1. Read pull request 978's current body with `gh pr view 978 --json body`.
2. In the fourth paragraph of the "What" section, replace the clause `Both 1–10 scales, the two-blank-lines separator, and the "…" standard carry over unchanged` with wording that distinguishes them: the **risk** scale carries over unchanged, the **severity** scale is rewritten band by band for pull-request review, and the two-blank-lines separator and the `Proposal`-writing standard carry over unchanged.
3. Leave every other character of the body as the author wrote it, and do not touch the title.
4. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit 978 --body-file ./temp/pr-body.md`. `temp/` is gitignored, so the scratch file reaches no commit.

The commit this run produces contains this plan file and the removal of the resolved entry from `./product/backlog/pull-request.md` — which is what keeps Step 8's `pr-check-changes` guard from firing on a fix that changes no source file.

## Tests

None. No repository file changes behavior, so there is nothing to cover: `./scripts/run.mjs check-diff` sees only markdown outside `src/` and `web/`, assembles an empty tool list, and exits 0. The correction is verified by reading the pull request body on GitHub, per Verification below.

## Out of scope

- Changing either scale table in `ai/tasks/pull-request-review.md` (decision 1).
- The rest of the sentence, and the rest of the description (decision 2).
- The pull request's title.
- Adding any mechanism that keeps the two task files' formats in sync — that is the fourth entry in this backlog (decision 4).
- The three other entries in `./product/backlog/pull-request.md`, each of which is its own unit of work.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual: open pull request 978 on GitHub and read the fourth paragraph of "What". Confirm it now distinguishes the risk scale from the severity scale, that the surrounding sentence's other two claims are intact, and that no other paragraph of the body changed — compare against the body captured before the edit. Confirm the title is unchanged.

Manual: confirm the run's commit contains this plan file and the backlog entry removal and nothing else, and that `./temp/pr-body.md` appears in no commit (`git show --stat HEAD`).

Manual: re-read `ai/tasks/pull-request-review.md`'s two scale tables and confirm both are untouched by this change.
