# AI tasks reference the project's product directory

## Summary

The executable task prompts under `ai/tasks/` reference the `product/` directory with bare, repo-relative paths (`product/plans/ready/`, `product/specs/`, `product/backlog/features.md`, …). They were written to run inside the Janissary repository, where `product/` is Janissary's own product directory. Once built-in tasks can be executed from an arbitrary project (see the companion task-picker two-sources work, which inserts an absolute `execute <janissary>/ai/tasks/<name>` command), that ambiguity matters: a task run in a user's project should read and write the **project's** `product/` directory — the one in the current working directory — not the Janissary codebase's `product/` directory sitting next to the task file.

This feature updates every `ai/tasks/*.md` file that references `product/` so the reference unambiguously means the project working directory's product directory. Two complementary edits are applied to each affected task: a short clarifying note near the top stating that all `product/...` paths refer to the product directory in the current working directory (the project being worked on), not the Janissary codebase; and each inline reference rewritten to an explicit `./product/...` form so it reads as relative to the project's working directory. Only `product/` references are touched — other repo-relative references are left as-is. Behavior when a project has no `product/` directory is unchanged and out of scope.

## Design decisions

- **Both a note and a `./` prefix.** Each affected task gets a clarifying note near its top AND its inline `product/...` references rewritten to `./product/...`. The note establishes the meaning once; the explicit `./` prefix on every path reinforces it at each use so an agent reading the task in a project's working directory resolves the paths there.
- **Only `product/` references.** The rewrite is scoped to `product/...` paths exactly as the feature states. Other Janissary-codebase-relative references (`ai/guidelines/`, `help.md`, `documentation/`, `scripts/`, etc.) are intentionally left untouched in this pass.
- **All tasks that reference `product/`.** Every `ai/tasks/*.md` file that mentions `product/` is updated, for consistency across all built-in tasks — not a hand-picked subset. Tasks that never mention `product/` are left unchanged.
- **Missing `product/` is out of scope.** This feature only rewrites references. When a task runs in a project with no `product/` directory (or no plan/backlog structure), behavior is unchanged — each task's existing "if none found, report and stop" handling still applies. No new create-if-missing behavior is added.
- **Consistent note wording.** The clarifying note uses the same phrasing in every task so the convention reads identically wherever it appears (see Proposed changes for the exact sentence).

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| The set of task files to edit | The `ai/tasks/*.md` prompts | `ai/tasks/` |
| Existing bare `product/...` references to rewrite | e.g. `product/plans/ready/`, `product/specs/`, `product/backlog/features.md` | throughout `ai/tasks/*.md` (e.g. `build-a-feature.md`, `improve-plan.md`, `fix-a-small-issue.md`, `plan-ready-features.md`) |
| The reason project-vs-Janissary resolution now matters | Built-in tasks executed via an absolute `execute <janissary>/ai/tasks/<name>` command | companion plan `product/plans/draft/task-picker-two-sources.md` |
| Existing "note near the top" convention in tasks | The bolded lead-in notes tasks already carry (e.g. shell-hygiene, no-attribution notes) | top of most `ai/tasks/*.md` files |

## Proposed changes

**Add a clarifying note to each affected task.** Near the top of every `ai/tasks/*.md` file that references `product/`, add a short bolded note in the same style as the existing lead-in notes, stating that all `product/...` paths in the task refer to the product directory in the **current working directory** — the project being worked on — and never to the Janissary codebase's own `product/` directory, even when the task file itself was launched from an absolute path inside the Janissary installation. The sentence is identical across tasks so the convention reads the same everywhere.

**Rewrite inline `product/` references to `./product/`.** In the body of each affected task, change every bare `product/...` reference (in prose, in inline code spans, and in any example command lines) to the explicit `./product/...` form. This includes the common cases: `product/plans/ready/`, `product/plans/draft/`, `product/plans/complete/`, `product/plans/deferred/`, `product/specs/`, `product/backlog/*.md`, and any `git mv product/... product/...` example lines. Leave the surrounding text, headings, and non-`product/` paths byte-for-byte unchanged.

**Files in scope.** Every `ai/tasks/*.md` that mentions `product/` — from the reconnaissance this includes at least `build-a-feature.md`, `fix-a-small-issue.md`, `improve-plan.md`, and `plan-ready-features.md`, plus any other task file in `ai/tasks/` whose text contains `product/`. A `grep` for `product/` over `ai/tasks/` defines the exact set at implementation time; a task file with no `product/` reference is not modified.

**No source, test, config, or spec changes.** This feature edits only the markdown task prompts under `ai/tasks/`. It does not touch `src/`, `web/src/`, specs under `product/specs/`, or any config — the task files are documentation for agents, not executable code.

## Tests

- **No automated tests.** These are documentation/prompt files with no code path, so there is nothing to unit-test. The change is verified by inspection and by a manual end-to-end run (see Verification).
- If a lint or link-check step already covers `ai/tasks/*.md` (markdown lint), it must still pass after the edits; no new test tooling is introduced.

## Out of scope

- Rewriting non-`product/` references (`ai/guidelines/`, `help.md`, `documentation/`, `scripts/`, etc.) to be project-relative — only `product/` is in scope.
- Any create-if-missing behavior when a project lacks a `product/` directory or plan/backlog structure — behavior there is unchanged.
- Introducing a runtime templating or token-substitution mechanism for task files — the change is static wording only (a note plus `./` prefixes).
- Editing task files that never reference `product/`.
- The task-picker two-sources work itself (that a built-in task is launched via an absolute `execute` command) — that is the companion plan; this plan only makes the tasks' internal `product/` references resolve to the project once they are launched.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` — lints the changed files (markdown) and runs any affected checks. No server or web tests are affected by documentation-only edits.
- Manual: `grep -rn "product/" ai/tasks/` and confirm every remaining `product/...` reference is written as `./product/...`, and that each affected task carries the clarifying note near its top. Then, in a scratch project directory that is **not** the Janissary repo (but has its own `product/` structure), have an agent execute one of the built-in tasks via the absolute `execute <janissary>/ai/tasks/<name>` command and confirm it reads and writes that project's `product/` directory rather than the Janissary codebase's.
