# Move the find-* task playbooks into ai/tasks/research/

**Complexity: 2/10** — a pure file move plus mechanical relative-link updates in the four files that
reference them; no logic, behavior, or architecture change. Mirrors the precedent set by
`product/plans/complete/move-ai-tasks-to-subdirectory.md` (moving task playbooks from `ai/` into
`ai/tasks/`), one directory level deeper.

## Goal

The three research-only task playbooks currently sitting directly under `ai/tasks/`
(`find-product-gaps.md`, `find-technical-debt.md`, `find-user-documentation-gaps.md`) move to
`ai/tasks/research/`, and every reference to them — from each other and from
`improve-user-documentation.md` — is updated to the new path.

## Design decisions

**No source code change needed, same as the precedent move.** `src/tasks.ts`'s `listTasks()`
already recurses generically into any subdirectory; `product/specs/task-picker.md` already
describes this generically ("recursing into subdirectories," "indented one level deeper than their
parent") without claiming a fixed depth, so it needs no correction — unlike the earlier `ai/` →
`ai/tasks/` move, which had to fix specs that claimed task files sit *directly* under `ai/`.

**Path-reference convention, same as the precedent.** Real markdown links inside the moved files
that point at a file staying behind in `ai/tasks/` (`prepare-workspace.md`, `quick-commit.md`, and
`find-technical-debt.md`'s links to `reduce-technical-debt.md`, `reduce-complexity.md`,
`remove-deadcode.md`, `remove-duplication.md`, `improve-modularity.md`) gain one more `../` to
account for the new nesting level. A link that already climbs above `ai/tasks/`
(`find-technical-debt.md`'s `../guidelines/code-guidelines.md`) gains one more `../` too. A link
between two files that move together (`find-product-gaps.md`'s reference to
`find-technical-debt.md`) stays a same-directory sibling link, unchanged. A link from a file that
*isn't* moving (`improve-user-documentation.md`, which stays in `ai/tasks/`) to one that is
(`find-user-documentation-gaps.md`) gains a `research/` prefix instead.

**No other file references these three playbooks.** Verified via repo-wide search: `commands.md`,
`CLAUDE.md`, `product/specs/*.md`, and `documentation/user-documentation/**` mention `ai/tasks/`
only generically (globs or the directory as a whole), never these three files by name.
`CHANGELOG.md` mentions `find-product-gaps.md` but as a historical release note — left alone, same
as the precedent's treatment of `plans/complete/*.md`.

## File-by-file changes

**Move (`git mv`), 3 files:** `ai/tasks/{find-product-gaps,find-technical-debt,find-user-documentation-gaps}.md`
→ same filename under `ai/tasks/research/`.

**Within the moved files**, per the rules above:
- `find-product-gaps.md`: `prepare-workspace.md` → `../prepare-workspace.md`; `quick-commit.md` →
  `../quick-commit.md`; the `find-technical-debt.md` mention is plain text, not a link, and needs no
  change.
- `find-technical-debt.md`: `reduce-technical-debt.md`, `reduce-complexity.md`,
  `remove-deadcode.md`, `remove-duplication.md`, `improve-modularity.md`, `prepare-workspace.md`,
  `quick-commit.md` each gain a `../` prefix; `../guidelines/code-guidelines.md` →
  `../../guidelines/code-guidelines.md`.
- `find-user-documentation-gaps.md`: `prepare-workspace.md` → `../prepare-workspace.md`;
  `quick-commit.md` → `../quick-commit.md`.

**Other real, live reference updated:**
- `ai/tasks/improve-user-documentation.md` — its three
  `` [`find-user-documentation-gaps.md`](find-user-documentation-gaps.md) `` links →
  `` [`find-user-documentation-gaps.md`](research/find-user-documentation-gaps.md) ``.

**Left unchanged (verified, not overlooked):** `CHANGELOG.md` (historical record);
`product/specs/task-picker.md` and `documentation/user-documentation/command-bar/tasks.md` (already
describe recursion generically, make no "directly under" claim); `commands.md` (no scheduled
command references any of these three files).

## Tests

None — no source or behavior code changes; `src/tasks.ts` and its test suite are already
directory-agnostic (the same reasoning the precedent move already verified applies unchanged here).

## Verification

- `./scripts/run.mjs check-diff` — confirms nothing else was inadvertently broken (this change
  touches no source or test files, but the gate still runs clean per the standard workflow).
- Manual (not run in this environment): open the app, press Ctrl+A, expand the `tasks` row —
  confirm a new `research ▸` row appears with the three moved files inside it, and picking one still
  populates `execute ./ai/tasks/research/<file>.md` on the command line.

## Out of scope

- Moving any other `ai/tasks/*.md` file — covered separately by the sibling backlog issue for
  `improve-*`/`reduce-*`/`remove-*`/`update-*` into `ai/tasks/hygiene/`.
- Any change to `ai/guidelines/` or `ai/personas/`.
- Rewriting `CHANGELOG.md`'s historical mention.
