# Move task playbooks from ai/ into ai/tasks/

**Complexity: 3/10** — a pure file move plus mechanical reference updates; no logic, behavior, or
architecture changes. The only genuine behavior change is incidental: the task picker (which
recurses generically into any non-excluded subdirectory of `ai/`) will now show a collapsed
`tasks` directory row that must be expanded before an individual task appears, instead of listing
every task flat at the top level.

## Goal

The 13 executable task playbooks currently sitting directly under `ai/` (`build-a-feature.md`,
`fix-a-small-issue.md`, `improve-modularity.md`, `improve-plan.md`, `improve-security.md`,
`improve-style.md`, `improve-test-coverage.md`, `merge-change-to-master.md`,
`open-feature-pull-request.md`, `prepare-workspace.md`, `reduce-complexity.md`,
`remove-deadcode.md`, `remove-duplication.md`) move to `ai/tasks/`, and every reference to them —
from each other, from `CLAUDE.md`, from other guideline docs, from `commands.md`, from the
`small-fix` profile, and from a script comment — is updated to the new path. `ai/guidelines/` and
`ai/personas/` are untouched; they are not task playbooks.

## Design decisions

**No source code change needed.** `src/tasks.ts`'s `listTasks()` already recurses generically into
any subdirectory of `ai/` not named `guidelines` or `personas` — `ai/tasks/` is just another such
subdirectory. Its own test suite (`src/tasks.test.ts`) exercises this against a synthetic temp
directory, not the real repo, so it's unaffected by the real move.

**Path-reference convention: repo-root-relative text, but real relative markdown links stay
relative.** These playbooks already mix two styles — plain-text/backtick mentions of sibling
playbooks written root-relative (`` `ai/merge-change-to-master.md` ``), and a few real markdown
links using file-relative paths (`` [`code-guidelines.md`](guidelines/code-guidelines.md) ``, `` [`ai/improve-modularity.md`](improve-modularity.md) ``,
`` [`CLAUDE.md`](../CLAUDE.md) ``). Each is updated according to its own kind:
- Root-relative text mentions get `tasks/` inserted (`ai/merge-change-to-master.md` →
  `ai/tasks/merge-change-to-master.md`).
- File-relative markdown links get re-derived for the new depth: a link to a same-directory
  sibling playbook (`improve-modularity.md` from `reduce-complexity.md`) needs no change — both
  move together and stay siblings. A link that climbs out of `ai/` (`../CLAUDE.md`,
  `guidelines/code-guidelines.md`) needs one more `../` to account for the new `ai/tasks/` nesting.

**Two markdown links were already broken before this move, and get corrected here rather than
moved-while-still-broken.** `ai/merge-change-to-master.md` and `ai/open-feature-pull-request.md`
each link `` [`ai/guidelines/conventional-commits.md`](../../ai/guidelines/conventional-commits.md) ``
— `../../ai/guidelines/...` from `ai/` climbs two levels above `ai/`, outside the repo entirely;
the correct link from `ai/` is one `../` fewer. Since these lines are being rewritten anyway for the
move, they're fixed to the actually-correct relative path (`../guidelines/conventional-commits.md`
from the new `ai/tasks/` location), matching `CLAUDE.md`'s own root-relative reference to the same
file.

**`plans/complete/*.md` and `commands.md`'s historical/plan-record mentions of these paths are left
alone where they're a record of the past, updated where they're a live, still-executed
reference.** Completed plans (`plans/complete/ai-workflow-pull-latest.md`,
`plans/complete/task-picker.md`, `plans/complete/scheduled-harness-via-profile.md`,
`plans/complete/task-picker-hide-extension.md`) are historical records of what was true when they
shipped, like a commit message — not retroactively rewritten. `commands.md` (repo root, tracked) is
different: it's a live list of commands the user actually runs/schedules today, so its `ai/*.md`
paths are updated to keep working. Same reasoning for `profiles/small-fix/opencode.json` (a real,
shipped harness profile whose `run`/`schedule` entries type `execute ./ai/fix-a-small-issue.md`
into a live opencode session) and `scripts/coverage-file.mjs`'s comment pointing at
`ai/improve-test-coverage.md`'s Step 6.

**`src/controller.test.ts` and `web/src/useTaskPicker.test.ts`'s `execute ./ai/fix-a-small-issue.md`
strings need no change.** These pass a synthetic path into pure functions / synthetic profile
fixtures under a temp directory — they never touch the real `ai/` directory, so they stay valid
regardless of where the real file lives.

**Docs describing "task files live directly under `ai/`" get corrected, since that's no longer
true.** `specs/task-picker.md` and `public-documentation/command-bar/tasks.md` both describe task
files as sitting directly under `ai/`. After the move that's inaccurate — and the resulting
picker-opens-to-a-collapsed-`tasks`-row behavior is itself a real, user-visible change worth
stating plainly, not just a path tweak.

## File-by-file changes

**Move (`git mv`), 13 files:** `ai/{build-a-feature,fix-a-small-issue,improve-modularity,improve-plan,improve-security,improve-style,improve-test-coverage,merge-change-to-master,open-feature-pull-request,prepare-workspace,reduce-complexity,remove-deadcode,remove-duplication}.md` → same filename under `ai/tasks/`.

**Within the moved files themselves**, update every reference to another moved file or to
`CLAUDE.md`/`ai/guidelines/` per the rules above (root-relative mentions gain `tasks/`;
file-relative links gain or lose a `../` to match the new depth; same-directory sibling links are
untouched).

**Other real, live references updated:**
- `CLAUDE.md` — project-structure line: `` `ai/*.md` `` → `` `ai/tasks/*.md` ``.
- `ai/guidelines/pull-request-automation.md` — its two mentions of
  `` `ai/merge-change-to-master.md` `` → `` `ai/tasks/merge-change-to-master.md` ``.
- `commands.md` — every `./ai/<file>.md` → `./ai/tasks/<file>.md`.
- `profiles/small-fix/opencode.json` — both `execute ./ai/fix-a-small-issue.md` strings →
  `execute ./ai/tasks/fix-a-small-issue.md`.
- `scripts/coverage-file.mjs` — comment's `ai/improve-test-coverage.md` →
  `ai/tasks/improve-test-coverage.md`.
- `specs/task-picker.md` — task files described as living under `ai/tasks/`; note that the
  top-level picker view now shows a single collapsed `tasks` row to expand.
- `public-documentation/command-bar/tasks.md` — same correction, plus the example
  `execute ./ai/<filename>` → `execute ./ai/tasks/<filename>`.

**Left unchanged (verified, not overlooked):** `ai/guidelines/*.md` and `ai/personas/*.md`
themselves (not task playbooks, don't move); `plans/complete/*.md` (historical records);
`scripts/docs-screenshots/manifest.mjs`'s synthetic `shell touch ai/build-a-feature.md ...`
fixture setup (creates its own throwaway `ai/` in an isolated scratch directory, unrelated to the
real repo layout); `src/controller.test.ts` and `web/src/useTaskPicker.test.ts` (synthetic
fixtures, not real-file-dependent); `specs/application-commands.md`'s generic
`` executable `ai/*.md` task files `` mention (still accurate as a glob, makes no "directly under"
claim).

## Tests

None — no source or behavior code changes; `src/tasks.ts` and its test suite are already
directory-agnostic (verified above), and no other test asserts against the real `ai/` directory's
contents.

## Verification

- `./scripts/run.mjs check-diff` — confirms no source/test files were inadvertently broken (this
  change touches none, but the gate still needs to run clean per the standard workflow).
- Manual (not run in this environment): open the app, press Ctrl+A — confirm a single `tasks ▸`
  row appears; expand it and confirm all 13 playbooks are listed and picking one still populates
  `execute ./ai/tasks/<file>.md` on the command line.

## Out of scope

- Any change to `ai/guidelines/` or `ai/personas/` — not task playbooks, not part of this move.
- Rewriting historical `plans/complete/*.md` entries that mention the old paths.
- Reworking `scripts/docs-screenshots/manifest.mjs`'s synthetic task-picker fixture to mirror the
  new nested layout — its purpose (populate *some* rows for a screenshot) is unaffected by where
  the real files live.
