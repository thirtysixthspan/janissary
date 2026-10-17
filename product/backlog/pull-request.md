<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Protect runscript files from accidental Git staging when they are used without a system schedule.

Existing Issue: The repository-local exclusions for `.janissary/scripts/` are added only by `SystemScheduleStore.save`, while `execute`, `edit`, and the runscript catalog can use or list scripts without saving a schedule. Severity: 5/10

Existing Risk: 5/10 - A user can create a runscript and follow the documented `execute` workflow without ever scheduling it, leaving the script visible to Git and easy to stage accidentally.

Proposal Risk: 2/10 - Ensuring the runscript directory is excluded before the feature exposes or uses it removes this accidental-staging path, while a test can pin the Git behavior without changing project `.gitignore` files.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "exclude runscripts on execution-only paths". Establish the narrow repository-local exclusions for `.janissary/system-schedules.json` and `.janissary/scripts/` when the system-schedule feature initializes or before the runscript catalog/read paths in `src/schedule/system/runscript-files.ts` are used, rather than relying only on `SystemScheduleStore.save` in `src/schedule/system/store.ts`. Preserve effective existing ignore rules and never rewrite the project `.gitignore`; keep startup nonfatal if exclusion setup cannot be completed. Add an integration test in `src/schedule/system/storage.integration.test.ts` that initializes a temporary Git project with a runscript, exercises the execution-only or catalog path without creating a system schedule, and confirms the script is ignored by Git. Retain coverage for schedule persistence and tracked-target refusal.
