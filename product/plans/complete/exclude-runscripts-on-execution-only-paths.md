# exclude runscripts on execution-only paths

**Complexity: 3/10** — reuse the existing Git exclusion helper at the runscript read/catalog boundary, with focused real-Git integration coverage and a spec clarification.

## Goal

Keep `.janissary/system-schedules.json` and `.janissary/scripts/` locally excluded when runscripts are listed or read even if the project never saves a system schedule. Preserve effective existing ignore rules and tracked-target refusal, and never edit the project's `.gitignore`.

## Approach

Call the existing `ensureSystemScheduleExcluded` before a runscript read or catalog examines the project state directory. Treat exclusion setup failure as a nonfatal warning so catalog and execution behavior remains available at startup, while retaining the store's strict save-time failure behavior. This boundary covers `execute`, bare-name `edit`, and the catalog without coupling protection to schedule persistence.

## Implementation steps

1. Ensure the local exclusions when runscript paths are first inspected, reporting setup failures to stderr without preventing reads/cataloging.
2. Add a real temporary-Git-project integration test that creates a script, catalogs it without saving a schedule, and verifies Git ignores it while preserving `.gitignore` and preexisting exclude rules.
3. Update `product/specs/scheduling.md` to state that runscript reads and cataloging establish exclusions independently of schedule saves, with nonfatal setup failures.

## Tests

- Cataloging an existing runscript in a Git project without schedule storage saves makes the script ignored by Git.
- Existing `.gitignore` and `.git/info/exclude` content remains intact; effective preexisting ignore rules are honored.
- Existing schedule persistence and tracked-target refusal integration coverage continues to pass.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Editing project `.gitignore` files or changing the exclusion patterns.
- Changing schedule persistence, startup cleanup, or runscript naming and parsing behavior.
