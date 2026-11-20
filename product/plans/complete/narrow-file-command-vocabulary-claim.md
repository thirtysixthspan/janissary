# Narrow the file-command one-word vocabulary claim in the PR description

**Complexity: 1/10** — documentation-only PR-description correction, no production code lines or files, no behavioral requirements, no new test scenarios and no new units (p=1.578)

## Problem

The PR body's overview claims that "the new commands share a terse one-word result vocabulary (`missing`, `forbidden`, `notdir`) rather than the verbose refusal lines the older commands print." That holds for `file list`, `file stat`, and `file exists`, which answer a miss, a refusal, or a wrong target in one word. It is false for `file head` and `file tail`: for read failures other than a directory target, they keep the verbose `file read` lines (`Not a text file: <path>.`, `File too large (>5 MB): <path>.`, `File not found: <path>.`). The PR body's own step 26 says this, `help/file.md` describes it, and `src/file-failure.ts` together with the assertions in `src/file-head-tail/tab-head-tail.test.ts` pin both vocabularies. A reader who trusts the blanket sentence would assume every new subcommand answers in one word and build parsing or expectations that break on head and tail's verbose failures.

## Goal

Rewrite the overview sentence so it names only `file list`, `file stat`, and `file exists` as the one-word commands and states that `file head` and `file tail` keep `file read`'s verbose failure lines. Change only the PR description; no behavior, code, help, spec, or test change is needed because those already pin both vocabularies.

## Approach

Treat the existing code, tests, help page, and step 26 as the settled contract and leave them untouched. Correct only the named sentence, then re-read it against step 26 and the verbose-line assertions so the description matches the shipped behavior word for word. Write the full revised body to `./temp/pr-body.md` before applying it with `gh pr edit --body-file` after the commit and push, so every paragraph the work item does not name survives byte-for-byte. Leave the title and change-set statistics out of the corrected sentence.

## Implementation steps

1. In the PR body's overview, replace the sentence "the new commands share a terse one-word result vocabulary (`missing`, `forbidden`, `notdir`) rather than the verbose refusal lines the older commands print" with wording that names only `file list`, `file stat`, and `file exists` as the one-word commands and states that `file head` and `file tail` keep `file read`'s verbose failure lines. Leave every other paragraph verbatim, including the Behavior examples and the full How to verify section.
2. Re-read the corrected sentence against step 26 and the verbose-line assertions in `src/file-head-tail/tab-head-tail.test.ts` to confirm the description matches the pinned behavior.
3. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file` after the commit and push, never before.

## Tests

- No new tests. The behavior is unchanged; `src/file-failure.ts` and the assertions in `src/file-head-tail/tab-head-tail.test.ts` already pin both the one-word and verbose vocabularies and must keep passing untouched.
- `$janissary/scripts/run.mjs check-diff` runs the affected server tests and confirms those assertions still pass.

## Specs and documentation

- No spec update: this corrects the PR description to match behavior the specs, help page, and tests already describe.
- No help or user-documentation update: `help/file.md` already states that head and tail keep `file read`'s verbose failure lines.

## Out of scope

- No change to `src/file-failure.ts`, `src/file-head-tail/head-tail-core.ts`, any test, any help page, or any spec — those already pin both vocabularies.
- No change to the other two backlog entries; leave them byte-for-byte and remove only this one.
- No PR title change, no change-set statistics in the corrected sentence, and no edit to paragraphs the work item does not name.
- No merge, close, replacement PR, force-push, or push to any other branch.
