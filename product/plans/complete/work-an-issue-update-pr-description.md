# Let work-an-issue update a pull request's description

**Complexity: 2/10** — one markdown task file changes, reusing `gh pr edit --body-file` and the `./temp/` body-file pattern the repo already uses to create a pull request. The care is in placing the edit where a failed run cannot leave a live pull request half-updated, and in bounding it so the author's own words survive.

## Goal

In PR update mode, `ai/tasks/work-an-issue.md` can only deliver a fix as a file change. An entry in `./product/backlog/pull-request.md` whose remedy is a correction to the **pull request's own description** — the whole point of `pull-request-review.md`'s description-fidelity dimension — therefore cannot be resolved: the task's scope is "source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the issues file, the pull-request backlog, and the plan file's location — nothing else", and a description is none of those.

This is not hypothetical. Pull request 978's backlog carries exactly such an entry as its first item, and a run against that pull request has to skip it. Give PR update mode the ability to update the description when the resolved entry calls for it.

## Approach

The mechanism already exists in the repo: `scripts/pr-create-pr.sh` passes `--body-file` rather than an inline string, precisely to avoid shell quoting problems with multi-line markdown, and `merge-change-to-master.md` Step 4 tells its reader to write the body to `./temp/pr-body.md` first. `gh pr edit <number> --body-file <path>` is the same shape for an existing pull request. `temp/` is gitignored (`.gitignore:3`), so the scratch file cannot reach a commit.

So this is a scope and sequencing change, not a new mechanism. The three questions worth deciding are *when* the edit happens, *how much* of the description it may touch, and what happens when a description correction is the entire fix.

## Design decisions

1. **The edit happens in Step 8, after the push succeeds — not in Step 3 with the rest of the implementation.** A description is a live, user-visible artifact on GitHub; a file edit is not, until it is pushed. If the description were rewritten during implementation and a later step failed, the run would abort leaving the pull request describing work that is not on its branch — the exact inconsistency this capability exists to remove. Editing after the push means the description only ever changes once the content it describes is actually there.

2. **Only what the resolved entry calls for changes; the rest of the body is preserved byte-for-byte.** Read the current body with `gh pr view <number> --json body`, apply the targeted change, and write the whole result back — the round trip is unavoidable because `gh pr edit` replaces the body wholesale, so preservation is the author's responsibility, not the tool's. A description is the author's statement of intent, and rewriting more of it than the entry named would destroy the evidence a later reviewer needs, which is the same reason `pull-request-review.md` refuses to edit descriptions at all.

3. **The title is not touched.** The entry may only reach the body. A pull request title has to match the commit subject under this repo's Conventional Commits rules, so changing one without the other breaks that pairing — and a wrong title is a different work item with a different fix.

4. **A description-only entry still produces a commit, and that is what keeps Step 8's existing guard correct.** Step 8 runs `pr-check-changes` and stops when there is nothing to ship. An entry whose only remedy is a description correction still writes a plan file to `./product/plans/complete/` and still removes its entry from `./product/backlog/pull-request.md`, so there is always a commit to make and the guard never fires spuriously. This is worth stating in the task file rather than leaving a reader to work it out, because "the fix is not a file change" invites the conclusion that nothing will be committed.

5. **The capability is PR-mode only.** In ordinary mode `merge-change-to-master.md` creates a pull request and merges it in the same run, so there is no established description for a work item to correct. Allowing it there would mean editing a pull request that this run just wrote and is about to merge.

6. **The description edit is never the silent part of a run.** Step 9's report gains a line recording whether the description was updated, so a change to a user-visible artifact on GitHub is always stated rather than inferred from the pull request itself.

## Implementation steps

One file changes: `ai/tasks/work-an-issue.md`.

1. **Opening paragraph.** Extend the closing scope list — which currently ends "the pull-request backlog, and the plan file's location" — to include the pull request's description in PR mode.

2. **The "PR update mode" preamble.** Add a sentence to the paragraph that already describes what the mode does: when the resolved entry's remedy is a correction to the pull request's own description, the fix is delivered by updating that description, with everything the entry did not name left as the author wrote it.

3. **Allowed list.** Add updating the pull request's description with `gh pr edit --body-file` in PR update mode, when the resolved entry calls for it.

4. **Forbidden list.** Add one rule: never edit a pull request's description in ordinary mode, never edit its title in either mode, and never change more of a description than the resolved entry names. Keep it as one rule rather than three, since all three are the same boundary seen from different sides.

5. **Step 8's PR-mode branch.** Add a sub-step after the push and before the final `gh pr view` confirmation: when the resolved entry called for a description change, read the current body with `gh pr view <number> --json body`, apply the targeted edit, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit <number> --body-file ./temp/pr-body.md`. Name the file-based route explicitly and say why — inline multi-line markdown breaks on shell quoting, which is the same reason `scripts/pr-create-pr.sh` takes a body file. Note that `temp/` is gitignored so the scratch file cannot reach the commit, and state that a description-only fix still commits its plan file and backlog removal (decision 4).

6. **Step 9's PR-mode report shape.** Add a `Description` line: updated, or not needed.

## Tests

No automated tests. The change is one markdown file under `ai/tasks/`, so there is no test surface — `./scripts/run.mjs check-diff` runs lint only for lintable extensions and `tsc`/tests only for paths under `src/` or `web/`, so it assembles an empty tool list and exits 0 printing a blank summary and a `total:` line. That is the expected result, not a gap.

## Out of scope

- Editing a pull request's title (decision 3).
- Editing a description in ordinary mode (decision 5).
- Posting a pull request comment or review. `pull-request-review.md` deliberately does not, and nothing here changes that.
- A rule for entries whose remedy falls outside this task's scope for some *other* reason. This change removes the one case that exists today; a general "skip what this task cannot deliver" rule in Step 1 is a separate work item.
- Any change to `ai/tasks/pull-request-review.md`, which still records description mismatches rather than fixing them — recording and resolving stay separate tasks.
- Verifying that the rewritten description is accurate. The entry's `Proposal` says what it should say; this task applies it.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual, the description path: run `execute ./ai/tasks/work-an-issue.md 978` against pull request 978, whose backlog's first entry calls for a description correction. Confirm the entry is now picked rather than skipped, that the pull request's body on GitHub gains exactly the correction the entry's `Proposal` names, that every other paragraph of the body is unchanged, and that the title is untouched. Confirm the run also commits the plan file and the backlog entry removal, and that `./temp/pr-body.md` appears in no commit.

Manual, the ordinary path: run it with an ordinary work item and confirm no `gh pr edit` runs at any point.

Manual, the no-description path: run it in PR mode against an entry whose remedy is a file change only, and confirm the description is untouched and the report records `Description: not needed`.

Manual, the abort path: interrupt a PR-mode run after implementation but before the push, and confirm the pull request's description is unchanged — the edit must not have happened yet (decision 1).
