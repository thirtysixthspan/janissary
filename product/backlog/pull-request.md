<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Clarify the `help file` page's Usage notes so the read-only `--offset`/`--limit` defaults no longer appear to apply to the newly listed `file glob`.

Existing Issue: The commit inserts the `file glob` usage line into the page's shared **Usage** list, directly above the unchanged paragraph saying "`--limit` is the number of lines to print and defaults to 2000" and the unqualified **Output** and **Errors** sections, all of which describe `file read` only, while `file glob --limit` counts paths, defaults to 100, and caps at 1000. Severity: 3/10

Existing Risk: 3/10 - A user reading `help file` top to bottom meets a 2000 default for `--limit` right after the glob usage line and may pass a limit above 1000 and get the usage line back, or misread the read-specific error list as the glob's.

Proposal Risk: 1/10 - The page states which subcommand each note covers; the remaining risk is only that later subcommands are added without the same qualification.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2001 "qualify the help file page's read-only usage notes now that file glob shares the page". In `help/file.md`, reword the paragraph after the **Usage** list to name its subcommand, for example "For `file read`, `--offset` is the first line to print and defaults to 1, and `--limit` is the number of lines to print and defaults to 2000 …", and add a short pointer that `file glob`'s flags are described under **Finding files** and `file write`/`file edit` under **Writing and editing**. Make the **Output** and **Errors** lead sentences say they describe `file read` (for example "`file read` prints each line with its line number" and "Each `file read` failure prints one line …"). Change no command behavior and no other help page; keep the page's bold-heading style. Check that `src/commands.test.ts` and any help-page tests (grep for `help/file.md` or `help file` under `src/`) still pass with the diff-scoped server tests, since some tests read help pages verbatim.
