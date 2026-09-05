# Pull-request backlog without sections

**Complexity: 2/10** — two markdown task files and one spec change. No source, no test, no protocol, no UI. The care is in catching every place the four-section structure is assumed, on the producing side and on the consuming side, so the two files still describe the same file after the change.

## Goal

`ai/tasks/pull-request-review.md` should create `./product/backlog/pull-request.md` as a flat list with no status sections at all: a `# pull-request` heading followed by entries, and nothing else. Every entry in it is ready. There is no `## ready` to promote into, no `## development` to append to, and no `## deferred` or `## declined` to park an entry in.

`ai/tasks/work-an-issue.md` consumes that same file in PR mode, and its rules currently name the four sections in five places. Those change with it, so the two tasks keep agreeing on the file's shape.

## Approach

The pull-request backlog is not like its six siblings in `./product/backlog/`. Those accumulate across the life of the project and need triage, which is what `ready`/`development`/`deferred`/`declined` buys them. This one is scoped to a single pull request's branch, is written by one task and drained by another, and is deleted the moment it empties. The sections were inherited from the sibling files rather than earned, and in practice `pull-request-review.md` only ever writes to `## development` while `work-an-issue.md` only ever reads `## ready` and `## development` — so three of the four headings exist to be walked past.

Removing them makes the file say what is already true: everything recorded here is work waiting to be done on this branch. A human who decides an entry is not worth doing deletes it, which is the same decision `## declined` recorded, made in the file rather than in a heading.

Both files change together in one commit. Splitting them would leave a producer writing a flat file and a consumer looking for `## ready` in it.

## Design decisions

1. **The skeleton is the `# pull-request` heading and nothing else.** Keeping a single `## development` heading would be a section by another name, and the next reader would reasonably ask what the others were. The heading stays because every backlog file has one and the file is opened in an editor tab like any other markdown.

2. **`pull-request-review.md` says explicitly why this file differs from its siblings.** Its Step 4 currently justifies the skeleton with "the same one every other backlog file in `./product/backlog/` carries", which becomes false. Replacing it with silence would invite the next person to "fix" the inconsistency by adding the headings back, so the sentence is replaced by the reason: this backlog belongs to one branch and is drained and deleted, not triaged.

3. **Declining an entry means deleting it.** With no `## declined`, that is the only way a human refuses work, and `work-an-issue.md`'s deletion rule has to say so — its current justification for never deleting a non-empty file is that an entry in `## deferred` or `## declined` is a decision on the record. That reasoning goes away and is replaced by the simpler one: an entry still in the file is work still on the record, and deleting the file would erase it.

4. **Entries are walked in file order, top to bottom.** `work-an-issue.md` reads `## ready` before `## development` today because a human promoting an entry was expressing priority. With one list, position is the only priority signal left, so a human reorders to prioritize. The complexity threshold still applies per entry and is unchanged: walk from the top, take the first rated below 7.

5. **The five-part entry format and both scales are untouched.** Only the file's skeleton and the rules about where entries go change. `find-technical-debt.md`'s cross-reference sentence — that it and `pull-request-review.md` differ on purpose in exactly two places — is about the entry format and the scales, not about the file each writes into, so it stays accurate and that file is not edited.

6. **The append-only rule survives the sections.** "Never clear, truncate, reorder, or reformat the file" was never about the headings, and a flat file is if anything easier to damage, so the rule is restated against entries rather than dropped.

7. **`janus init` is not involved.** `scaffoldProject` in `src/project-init.ts` seeds six backlog files and `pull-request` is not among them, because that file is created per branch by the review task. No source change follows from this.

## Implementation steps

Two markdown task files change, plus one spec.

1. **`ai/tasks/pull-request-review.md`, Allowed list.** "Create `./product/backlog/pull-request.md` and append entries to its `## development` section" becomes appending to the end of the file.

2. **`ai/tasks/pull-request-review.md`, Step 4 sub-step 1 (dedupe).** The dedupe set is collected from every entry in the file rather than from four named sections. The rest of the rule — entries carried in from an earlier review count too, drop every candidate the set already covers however worded — is unchanged.

3. **`ai/tasks/pull-request-review.md`, Step 4 sub-step 2 (nothing survives).** The reason for not creating the file first is currently that it would leave "a diff whose only content is four empty headings". Reword to a single heading. The clean-versus-all-duplicates distinction below it is untouched.

4. **`ai/tasks/pull-request-review.md`, Step 4 sub-step 3 (the skeleton).** Replace the four-heading block with `# pull-request` alone, and replace the "same one every other backlog file carries" justification with decision 2's reason. State that every entry in the file is ready and that a human declines one by deleting it.

5. **`ai/tasks/pull-request-review.md`, Step 4 sub-step 4 (where entries go).** Appending to "the end of the `## development` section only" becomes appending to the end of the file. The instruction to leave the other three sections untouched is replaced by leaving every entry already in the file untouched. Keep the two rules that follow it: never reformat the file, and never give an entry a heading of its own.

6. **`ai/tasks/pull-request-review.md`, Step 4 sub-step 5 (verify).** The new-file check reads the file back and confirms it carries the `# pull-request` heading plus the entries just written, and nothing else — rather than the four standard `##` headings plus entries. The `??`-versus-modified split and the revert instructions are unchanged.

7. **`ai/tasks/work-an-issue.md`, PR update mode preamble.** "when no entry remains in any of its sections" becomes "when no entry remains in it".

8. **`ai/tasks/work-an-issue.md`, Forbidden rule 10.** Rewrite around decision 3: the file goes only when it holds no entries at all, because an entry still in it is work still on the record. Drop the `## deferred`/`## declined` reasoning, which no longer has a referent.

9. **`ai/tasks/work-an-issue.md`, Step 1 PR-mode sub-steps 1 and 2.** "no entry in any section" becomes "no entries". The `## ready`-then-`## development` walk with its refusal to touch `## deferred` and `## declined` becomes a top-to-bottom walk of the one list, with decision 4's note that every entry is ready and that a human declines one by deleting it.

10. **`ai/tasks/work-an-issue.md`, Step 7 sub-step 2, PR-mode branch.** "all four `##` headings byte-for-byte untouched" becomes the file's `# pull-request` heading. The drain check that follows — currently "whether the file still holds an entry in any of its four sections" and, when one does, leaving the file "with its now-possibly-empty heading, the way every other file in `./product/backlog/` is left" — becomes whether any entry remains at all, leaving the file in place when one does. The `git rm` instruction and its justification are unchanged.

11. **`product/specs/pull-request-review.md`.** Add a subsection describing the backlog's shape: a flat list with no status grouping, every entry ready, ordered by priority, entries removed as they are resolved or declined, and the file removed once it is empty.

## Tests

No automated tests. The change is two markdown files under `ai/tasks/` and one under `product/specs/`, so there is no test surface: `./scripts/run.mjs check-diff` classifies changed files and runs lint only for lintable extensions and `tsc`/tests only for paths under `src/` or `web/`, so it assembles an empty tool list and exits 0 printing a blank summary and a `total:` line. That is the expected result, not a gap.

The behaviors worth checking by hand are under Verification below.

## Out of scope

- Changing the five-part entry format or either scale, and therefore any edit to `ai/tasks/research/find-technical-debt.md` (decision 5).
- The six sibling backlog files in `./product/backlog/`, which keep their four sections. This change is about the one file that is scoped to a branch.
- `scaffoldProject` in `src/project-init.ts` and its `backlogFileContent` skeleton, which seed those six files and never touch `pull-request.md` (decision 7).
- The existing `./product/backlog/pull-request.md` on the `feature/sandbox-e2e-browser` branch. It is a live artifact of a review already run under the old shape; the next `work-an-issue.md` run against that branch reads it fine either way, since a top-to-bottom walk of a file that only ever had entries under `## development` picks the same entry.
- User and developer documentation. Neither describes the pull-request backlog — `creating-a-new-project.md` documents the six seeded files and this is not one of them.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual, first review of a branch: run `execute ./ai/tasks/pull-request-review.md <n>` against an open pull request with no backlog on its branch, and confirm the file it creates opens with `# pull-request`, carries the findings directly beneath it separated by two blank lines, and contains no `##` heading anywhere.

Manual, second review of the same branch: run it again and confirm the new findings append to the end of the file, the earlier entries are byte-identical, and the dedupe set was built from every entry in the file rather than from a section.

Manual, the consumer: run `execute ./ai/tasks/work-an-issue.md <n>` against that branch and confirm it takes the first entry in the file, removes exactly that entry whole on completion, and leaves the `# pull-request` heading and every other entry untouched. Repeat until one entry remains, then once more, and confirm the file is removed from the branch with `git rm` in that final commit.

Manual, the refusal: leave a single entry in the file, and confirm a run that resolves nothing does not delete it.
