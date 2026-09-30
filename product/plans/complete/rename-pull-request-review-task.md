# Rename ai/tasks/pull-request-review.md to review-pull-request.md

**Complexity: 2/10** — a file rename plus updating literal path references in sibling task playbooks; no logic changes.

## Goal

`ai/tasks/pull-request-review.md` is renamed to `ai/tasks/review-pull-request.md`, so the task reads verb-first like its siblings (`work-an-issue`, `test-pull-request`, `build-a-feature`). Every live task playbook that names the file by path or filename is updated to match, including the task's own example invocation.

## Approach

This is a pure rename-and-update-references task. The references that name the task file are all in `ai/tasks/`:

1. `ai/tasks/pull-request-review.md` itself — its example invocation `execute ai/tasks/pull-request-review.md 232`.
2. `ai/tasks/auto-build.md` — three mentions (the skeleton definition, the execute step, and the entry-format source).
3. `ai/tasks/research/find-technical-debt.md` — one link to `../pull-request-review.md`.
4. `ai/tasks/test-pull-request.md` — three links to `pull-request-review.md`.
5. `ai/tasks/work-an-issue.md` — three mentions (one link, two inline filenames).

References deliberately left unchanged:

- `product/specs/pull-request-review.md` and the `[[pull-request-review]]` wiki link in `product/specs/pull-request-testing.md` — these name the functional spec for the pull request review feature, not the task file. Specs are named for the feature and describe behavior without file paths, so the spec keeps its name.
- `CHANGELOG.md` entries and the plans under `product/plans/complete/` — historical records of what was shipped under the old name at the time.
- `product/backlog/documentation.md` (a dated historical note) and `product/backlog/features.md` (a free-text feature idea) — backlogs other than the issues file are outside what this task may edit.
- The `chore(backlog): record pull request review findings` commit subject inside the task — it describes the activity, not the filename.

## Implementation steps

1. `git mv ai/tasks/pull-request-review.md ai/tasks/review-pull-request.md`.
2. In `ai/tasks/review-pull-request.md`, change the example invocation to `execute ai/tasks/review-pull-request.md 232`.
3. In `ai/tasks/auto-build.md`, `ai/tasks/research/find-technical-debt.md`, `ai/tasks/test-pull-request.md`, and `ai/tasks/work-an-issue.md`, replace every `pull-request-review.md` with `review-pull-request.md` (link text and link targets).
4. Confirm with `git grep pull-request-review -- ai` that no task playbook still names the old file.
5. Run `./scripts/run.mjs check-diff`.

## Tests

None new — this is a reference rename with no behavior change. No script or source test reads `ai/tasks/pull-request-review.md` or asserts on its filename; the existing playbook tests (`scripts/test-pull-request-playbook.test.mjs`, `scripts/find-bugs-playbook.test.mjs`) do not match the old name, and `check-diff` confirms they still pass.

## Out of scope

- Renaming `product/specs/pull-request-review.md` or its wiki links.
- Rewriting historical records in `CHANGELOG.md`, `product/plans/complete/`, or non-issues backlogs.
