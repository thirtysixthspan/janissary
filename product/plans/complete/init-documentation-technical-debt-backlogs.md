# `janus init` should also seed `documentation` and `technical-debt` backlogs

**Complexity: 2/10** — extends the same list of literal names already used by `scaffoldProject`; no new logic.

## Goal

`janus init` (`src/project-init.ts`) currently seeds `product/backlog/` with four files — `bugs.md`, `chores.md`, `features.md`, `issues.md` — via the `BACKLOG_FILES` list. This repo's own `product/backlog/` also carries `documentation.md` and `technical-debt.md`, which are useful, established backlog categories (documentation gaps and code-quality/tech-debt items) but are not part of what `scaffoldProject` creates for a freshly-initialized project. `janus init` should create these two backlogs as well, with the same empty `ready`/`development`/`deferred` structure as the other four.

## Approach

Extend `BACKLOG_FILES` in `src/project-init.ts` from `['bugs', 'chores', 'features', 'issues']` to also include `'documentation'` and `'technical-debt'`. The existing `backlogFileContent`/seeding loop already handles any name in the list identically (same structure, same idempotent skip-if-exists check), so no other code change is needed.

## Implementation steps

1. `src/project-init.ts`: add `'documentation'` and `'technical-debt'` to `BACKLOG_FILES`.

## Tests

- `src/project-init.test.ts`: extend the "seeds product/backlog with the standard backlog files" test's name list to include `documentation` and `technical-debt` (so all six files are asserted to contain `# <name>`, `## ready`, `## development`, `## deferred`).

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/cli.md`: update the "Scaffolding a new project" section to say `product/backlog/` is seeded with **six** standard backlog files — `bugs.md`, `chores.md`, `documentation.md`, `features.md`, `issues.md`, `technical-debt.md` — instead of four.

## Docs

- Check `help.md` and `documentation/user-documentation/` for any page documenting `janus init`'s output; update only if one already exists and would now be inaccurate. Do not add new documentation pages for previously-undocumented behavior.

## Out of scope

- Populating the new backlog files with any starter content beyond the empty section headers.
- Adding CLAUDE.md's "Backlogs of smaller items" prose line to name the two new files — CLAUDE.md is outside this task's allowed file set.
- Changing the `ai/`/`product/specs`/`product/plans` scaffold directories or their `.gitkeep` behavior.
