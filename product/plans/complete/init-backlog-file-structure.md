# `janus init` should create backlog files with the correct markdown structure, empty sections

**Complexity: 2/10** — small change to an existing pure function (`scaffoldProject`), no new subsystems.

## Goal

`janus init` (`src/project-init.ts`) currently creates `product/backlog/` as a bare, empty directory and drops a `.gitkeep` in it since nothing else is there. But `product/backlog/` is meant to hold the four backlog files documented in `CLAUDE.md`'s Project Structure section — `bugs.md`, `chores.md`, `features.md`, `issues.md` — each with the standard `# <name>` / `## ready` / `## development` / `## deferred` structure (see any file in this repo's own `product/backlog/` for the convention). A freshly-scaffolded project should get those four files pre-created with the correct structure and empty sections, not an empty directory.

## Approach

Extend `scaffoldProject` in `src/project-init.ts`:

- Add a `BACKLOG_FILES` list: `['bugs', 'chores', 'features', 'issues']`.
- After creating `SCAFFOLD_DIRS`, for each name in `BACKLOG_FILES`, write `product/backlog/<name>.md` with the content:
  ```
  # <name>

  ## ready

  ## development

  ## deferred
  ```
  (trailing newline, matching how the other scaffolded content in this repo is written) — only if the file does not already exist, so re-running `init` against a project with existing backlog content never overwrites it (idempotency, matching the existing directory-creation behavior).
- Because `product/backlog/` will now always contain these four files, it will never be empty after scaffolding, so the existing "drop `.gitkeep` in empty directories" pass naturally stops adding one there — no special-casing needed, the existing `readdirSync(...).length === 0` check already handles it.

## Implementation steps

1. `src/project-init.ts`: add `BACKLOG_FILES` and a `backlogFileContent(name)` helper; after the existing directory-creation loop, write each backlog file (skip if it already exists) before the `.gitkeep` pass.

## Tests

- `src/project-init.test.ts`: add cases —
  - `scaffoldProject` creates `product/backlog/bugs.md`, `chores.md`, `features.md`, `issues.md`, each containing `# <name>`, `## ready`, `## development`, `## deferred`.
  - `product/backlog/` does not get a `.gitkeep` (it's non-empty once the backlog files exist).
  - running `scaffoldProject` twice does not overwrite an existing backlog file's content (idempotency test: write custom content to `issues.md` between the two calls, assert it survives the second call).

Run `./scripts/run.mjs check-diff` after implementing.

## Spec updates

- `product/specs/cli.md`: update the "Scaffolding a new project" section (added by the `init` command's own plan) to mention that `product/backlog/` is seeded with the four standard backlog files in their empty structure, not left as a bare directory.

## Docs

- Check `help.md` and `documentation/user-documentation/` for any page documenting `janus init`'s output; update only if one already exists and would now be inaccurate. Do not add new documentation pages for previously-undocumented behavior.

## Out of scope

- Populating backlog files with any starter content beyond the empty section headers.
- Changing the `ai/`/`product/specs`/`product/plans` scaffold directories or their `.gitkeep` behavior.
- Adding a `documentation.md` or `technical-debt.md` backlog file — those are ad hoc additions in this repo's own backlog, not part of the documented four-file convention in `CLAUDE.md`.
