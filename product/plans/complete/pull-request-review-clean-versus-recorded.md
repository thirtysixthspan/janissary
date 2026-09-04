# Distinguish a clean review from one whose findings were all already recorded

**Complexity: 2/10** — one report variant and two clarifying sentences in one markdown task file. No source, no test, no protocol, no UI.

## Goal

`ai/tasks/pull-request-review.md` sends two materially different outcomes down the same path. A run that found nothing wrong and a run whose every candidate was dropped as a duplicate both reach Step 4's "If no candidate survives, stop here … go to Step 7's clean report", and Step 7's `Recorded` line offers only `clean — nothing recorded` for both.

A reader seeing "clean" on a pull request that has several outstanding recorded problems concludes the review found nothing, which is the opposite of what the run determined. The report also never states whether the per-dimension `Findings` counts are measured before or after the dedupe pass, so "description 0" could mean nothing was found or that what was found was already on file.

## Approach

Both halves are report-shape problems, not logic problems: the run already distinguishes the two cases internally — it knows how many candidates it formed and how many the dedupe set absorbed — and simply has nowhere to say so. Add a third `Recorded` variant, route Step 4's point 2 to it, and state the counting basis of the `Findings` line.

## Design decisions

1. **A third `Recorded` variant rather than a new report line.** The `Recorded` line already answers "what came of this run", and the all-duplicates case is a third answer to that same question, alongside a pushed sha and a failed push. A separate line would leave `Recorded` still saying "clean" and contradicting it a line later.

2. **`Findings` counts what was recorded on this run — after dedupe.** With `Duplicates` on the next line accounting for the difference, that makes the two lines add up to what the run actually formed, and it makes `Findings` mean the same thing on every run. The alternative — counting before dedupe — would make `Findings` and `Recorded` disagree on a run where everything was absorbed.

3. **The all-duplicates variant carries the count.** "Nothing new" alone would leave a reader unable to tell a quiet pull request from a thoroughly-reviewed one whose work is all outstanding, which is the confusion this entry is about. The count is what makes the two legible apart.

4. **Nothing else about the clean path changes.** No file is created, no commit is made, and Step 5 is still skipped — the outcome is identical, only its report differs. This is a wording fix, and widening it into a behavior change would be scope the entry never asked for.

## Implementation steps

One file changes: `ai/tasks/pull-request-review.md`.

1. **Step 4, point 2.** It currently reads "If no candidate survives, stop here. Create nothing, write nothing, and go to Step 7's clean report." Split the two ways a candidate list empties: when nothing was found at all, the clean variant applies; when candidates were formed but the dedupe set absorbed every one, the new all-duplicates variant applies. Both still create nothing, write nothing, and skip Step 5 — only the reported outcome differs.

2. **Step 7's report block.** Add the third variant to the `Recorded` line, in the shape `nothing new — all <n> finding(s) already recorded`, beside the existing pushed-sha, clean, and push-failed variants.

3. **Step 7's report block, `Findings` line.** State that it counts findings recorded on this run, after dedupe, with `Duplicates` accounting for the rest. One clause on the line itself, so a reader filling the report in does not have to infer it.

## Tests

None. One markdown file under `ai/tasks/` changes, so there is no test surface — `./scripts/run.mjs check-diff` sees only markdown outside `src/` and `web/`, assembles an empty tool list, and exits 0.

## Out of scope

- Any change to the clean path's behavior: it still creates no file and makes no commit (decision 4).
- Naming the duplicate entries in the report. A reader who sees a non-zero duplicate count opens `./product/backlog/pull-request.md` to see which; listing them would make a report meant to be brief unbounded in length.
- The dedupe rule itself, which is unchanged.
- The two remaining entries in `./product/backlog/pull-request.md`, each its own unit of work.

## Verification

`./scripts/run.mjs check-diff` — expected to run no tools and exit 0.

Manual: run `execute ./ai/tasks/pull-request-review.md <number>` twice against the same pull request with no intervening change. The first run records its findings; the second forms the same candidates, drops them all as duplicates, and must report `Recorded: nothing new — all <n> finding(s) already recorded` rather than `clean — nothing recorded`, with `Findings` showing zeros and `Duplicates` showing the count.

Manual: run it against a pull request with an accurate description and no problems, and confirm it still reports `clean — nothing recorded`.

Manual: confirm neither run creates a file or makes a commit.
