# Move the improve-*/reduce-*/remove-*/update-* task playbooks into ai/tasks/hygiene/

**Complexity: 4/10** — a pure file move (14 files, more than the two prior moves individually) plus
mechanical relative-link updates across the moved files and every other file that references one of
them; no logic, behavior, or architecture change. Mirrors the same pattern as
`product/plans/complete/move-ai-tasks-to-subdirectory.md` and
`product/plans/complete/move-find-tasks-to-research-subdirectory.md`, one directory level deeper
than `ai/tasks/`.

## Goal

The 14 codebase-hygiene task playbooks currently sitting directly under `ai/tasks/`
(`improve-codebase.md`, `improve-modularity.md`, `improve-namespacing.md`,
`improve-plan-with-minimalism.md`, `improve-plan.md`, `improve-security.md`, `improve-style.md`,
`improve-test-coverage.md`, `improve-user-documentation.md`, `reduce-complexity.md`,
`reduce-technical-debt.md`, `remove-deadcode.md`, `remove-duplication.md`, `update-package.md`)
move to `ai/tasks/hygiene/`, and every reference to them — from each other, from `commands.md`,
from `ai/guidelines/imports-and-barrel-files.md`, from `ai/tasks/plan-ready-features.md`, from
`ai/tasks/research/find-technical-debt.md`, and from `scripts/coverage-file.mjs` — is updated.

## Design decisions

**No source code change needed, same as both prior moves.** `src/tasks.ts`'s `listTasks()` already
recurses generically; `product/specs/task-picker.md` and
`documentation/user-documentation/command-bar/tasks.md` already describe recursion generically with
no fixed-depth claim (re-verified for this move), so neither needs correcting.

**Same path-reference convention as both prior moves.** A link between two files that both move to
`hygiene/` stays a same-directory sibling link, unchanged. A link from a moving file to one staying
in `ai/tasks/` (`prepare-workspace.md`) or already in `ai/tasks/research/` gains a `../` (or, for
the already-moved-to-`research/` case inside `improve-user-documentation.md`, becomes
`../research/<file>.md` — one more `../` than before, then across into the sibling directory). A
link that already climbs above `ai/tasks/` (to `ai/guidelines/*.md` or `CLAUDE.md`) gains one more
`../`. A link from a file that is *not* moving (`plan-ready-features.md`,
`find-technical-debt.md`, `imports-and-barrel-files.md`) to one that is gains a `hygiene/` segment.

**One display-text nit fixed in passing, not left inconsistent.** `improve-codebase.md`'s own
generic `` ai/tasks/<task>.md `` placeholder text (describing where each of its 9 linked sub-tasks
lives) becomes `` ai/tasks/hygiene/<task>.md `` alongside the file's own move, so the file doesn't
ship internally inconsistent about its own new location.

**Left unchanged (verified, not overlooked):**
- `scripts/docs-screenshots/manifest.mjs`'s synthetic `shell touch ai/tasks/...` fixture — an
  isolated scratch-directory fixture unrelated to the real repo layout, per the identical precedent
  already established for the first `ai/`→`ai/tasks/` move.
- `CHANGELOG.md` and every `product/plans/complete/*.md` mention — historical records, not
  retroactively rewritten.
- Root-relative plain-text mentions of files that are **not** moving (`ai/tasks/prepare-workspace.md`,
  `ai/tasks/merge-change-to-master.md`, `ai/tasks/fix-an-issue.md`, `ai/guidelines/code-guidelines.md`
  as a bare root-relative mention rather than a file-relative link) — these stay correct regardless
  of the referencing file's own depth.

## File-by-file changes

**Move (`git mv`), 14 files:**
`ai/tasks/{improve-codebase,improve-modularity,improve-namespacing,improve-plan-with-minimalism,improve-plan,improve-security,improve-style,improve-test-coverage,improve-user-documentation,reduce-complexity,reduce-technical-debt,remove-deadcode,remove-duplication,update-package}.md`
→ same filename under `ai/tasks/hygiene/`.

**Within the moved files**, per the rules above:
- `improve-codebase.md`: `prepare-workspace.md` → `../prepare-workspace.md`; the 9 sibling links
  (`improve-modularity.md`, `reduce-complexity.md`, `improve-namespacing.md`, `remove-deadcode.md`,
  `remove-duplication.md`, `improve-test-coverage.md`, `improve-security.md`, `improve-style.md`,
  `update-package.md`) unchanged; the `` ai/tasks/<task>.md `` placeholder text →
  `` ai/tasks/hygiene/<task>.md ``.
- `improve-namespacing.md`: `../guidelines/imports-and-barrel-files.md` →
  `../../guidelines/imports-and-barrel-files.md`.
- `improve-plan-with-minimalism.md`: both `../../CLAUDE.md` links → `../../../CLAUDE.md`; sibling
  link to `improve-plan.md` unchanged.
- `improve-plan.md`: both `../../CLAUDE.md` links → `../../../CLAUDE.md`.
- `improve-user-documentation.md`: the 3 `research/find-user-documentation-gaps.md` links →
  `../research/find-user-documentation-gaps.md`; the 4 `../guidelines/*.md` links (2×
  `user-documentation.md`, 1× `human-writing-guidelines.md`, 1× `documentation.md`) →
  `../../guidelines/*.md`.
- `reduce-complexity.md`: `../guidelines/code-guidelines.md` → `../../guidelines/code-guidelines.md`;
  root-relative `ai/tasks/improve-modularity.md` mentions → `ai/tasks/hygiene/improve-modularity.md`;
  sibling link to `improve-modularity.md` unchanged.
- `reduce-technical-debt.md`: `../../CLAUDE.md` → `../../../CLAUDE.md`.
- `improve-security.md`, `improve-style.md`, `improve-test-coverage.md`, `remove-deadcode.md`,
  `remove-duplication.md`, `update-package.md`: no internal changes beyond the move itself (their
  only cross-references are root-relative mentions of non-moving files, already correct).

**Other real, live references updated:**
- `commands.md` — 5 lines: two `ai/tasks/improve-modularity.md`, one `ai/tasks/improve-test-coverage.md`,
  one `ai/tasks/remove-duplication.md`, two `ai/tasks/reduce-complexity.md` → each gains `hygiene/`.
- `scripts/coverage-file.mjs` — its comment's `ai/tasks/improve-test-coverage.md` → gains `hygiene/`.
- `ai/guidelines/imports-and-barrel-files.md` — its link to `../tasks/improve-namespacing.md` →
  `../tasks/hygiene/improve-namespacing.md`.
- `ai/tasks/plan-ready-features.md` — 3 root-relative mentions of `ai/tasks/improve-plan.md` → gain
  `hygiene/`.
- `ai/tasks/research/find-technical-debt.md` — its one line linking `reduce-technical-debt.md`,
  `reduce-complexity.md`, `remove-deadcode.md`, `remove-duplication.md`, and `improve-modularity.md`
  (each currently `../<file>.md`) → each becomes `../hygiene/<file>.md`.

## Tests

None — no source or behavior code changes; same reasoning as both prior moves.

## Verification

- `./scripts/run.mjs check-diff` — confirms nothing else was inadvertently broken (touches no
  source or test files, but the gate still runs clean per the standard workflow).
- Manual (not run in this environment): open the app, press Ctrl+A, expand the `tasks` row —
  confirm a new `hygiene ▸` row appears alongside `research ▸` with all 14 moved files inside it,
  and picking one still populates `execute ./ai/tasks/hygiene/<file>.md`.

## Out of scope

- Any change to `ai/guidelines/` or `ai/personas/` beyond the one link update in
  `imports-and-barrel-files.md`.
- Rewriting `CHANGELOG.md` or `product/plans/complete/*.md` historical mentions.
- Reworking `scripts/docs-screenshots/manifest.mjs`'s synthetic fixture.
