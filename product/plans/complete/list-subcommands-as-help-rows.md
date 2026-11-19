# List command subcommands as separate rows in the help command table

**Complexity: 1/10** — documentation-only change to one help table plus test and spec alignment; no production modules added or edited (p=2.95)

Bare `help` and `help commands` print the Commands table from `help/commands.md`. Today a command that owns several subcommands crams every form into one description cell: `file read`, `file glob`, `file grep`, `file write`, `file edit`, and `file patch` share the single `file` row; `tab focus` through `tab undock` share the single `tab` row; `browser open`/`goto`/`content`/`eval`/`shot` share the `browser` row. That makes the table hard to scan and hides which subcommands exist. The application-command inventory and the Commands tab already give each fixed subcommand form its own row, so the help table is the last place that still folds them together. This change gives each subcommand its own row there.

## Design decisions

- **Scope is the Commands table in `help/commands.md`**, the page bare `help` serves. The per-command help pages (`help/tab.md`, `help/file.md`, …) already document each subcommand in prose and are left alone.
- **One row per fixed subcommand form.** For every command whose description currently enumerates multiple forms, the parent row keeps a short summary of the bare command and each fixed form gets its own alphabetically placed row with a description scoped to that form. Examples: `file read`, `file glob`, `file grep`, `file write`, `file edit`, `file patch`; `tab focus`, `tab move`, `tab pane`, `tab split`, `tab color`, `tab group`, `tab dock`, `tab undock`; `browser open`, `browser goto`, `browser content`, `browser eval`, `browser shot`; `web search`, `web fetch`; `layout window`, `layout sidebar`, `layout split`, `layout reporting`, `layout show`; `question ask`, `question approve`; `commands enable`, `commands disable`; `hosts list`, `hosts add`, `hosts remove`; `profile launch`, `profile list`; `syntax theme`; `theme sync`; `ask reset`, `tell reset`; `search transcript`; `unmonitor --all`; `video snapshot`; `db sqlite`; `notifications left`, `notifications right`, `notifications clear`; `files expand`, `files collapse`, `files cursor`, `files anchor`, `files select`; and the sidebar `left`/`right`, `list`, `close`, and lookup forms of `connections`, `connection`, `conversations`, `schedules`, `sessions`, `models`, `launcher`, and `monitors`.
- **Alphabetical order by first word is preserved** — the current table contract and its test. All rows for a command cluster together, so adding `file read` and siblings between `file` and `files` keeps the first-word sequence sorted.
- **The 200-character description bound now applies to every row.** With `file`'s expanded syntax spread across rows, no row needs the old 350-character `files` exception. The `with <name|size|modified|permissions>` detail-mode selector stays in the `files` parent row because it is a view option rather than a fixed subcommand; its escaped pipe stays escaped.
- **No runtime change.** Dispatch, completion, the application-command inventory, and help-page lookup are untouched. The only observable difference is the text bare `help` prints.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this change uses it |
| --- | --- | --- |
| Commands table | `help/commands.md` | Rewritten in place; no new file. |
| Help rendering | `src/help-pages.ts`, `src/commands.ts` | Reads the page verbatim; no code change. |
| Table-structure tests | `src/commands.test.ts` | Updated to assert one row per form. |
| Help behavior spec | `product/specs/application-commands.md` (`### help`) | Updated to describe the new row structure. |

## Proposed changes

- `help/commands.md`: rewrite the Commands table so each enumerated fixed subcommand form is its own row, keep the table alphabetical by first word, keep every description at or under 200 characters, and keep the `with <name\|size\|modified\|permissions>` escape in the `files` parent row. Leave the prose below the table as it is.
- `src/commands.test.ts`: replace the single-`files`-row description bound with a bound that applies to every row; update the detail-mode/view-clause test to read the split rows; add a test that a representative set of multi-form commands (`file`, `tab`, `browser`, `web`, `layout`, `question`, `commands`, `files`) each have a dedicated row for every fixed form and no longer carry those forms in the parent description.

## Tests

- `src/commands.test.ts`:
  - every command-table row description is at most 200 characters, with no `files` exception;
  - the `files` parent row still carries the escaped `with <name\|size\|modified\|permissions>` selector and no raw pipe;
  - the `files expand`/`collapse`/`cursor`/`anchor`/`select` rows each carry their own clause syntax;
  - for each representative command, rows exist for every fixed form and the parent row no longer lists them;
  - the existing alphabetical-order, help-page-parity, and `help commands` output tests still pass.

## Specs, help, and user documentation

- `product/specs/application-commands.md`: in `### help`, state that commands with multiple fixed subcommand forms get one row per form in the alphabetical Commands table, that descriptions are limited to 200 characters for every row, and that the `with <name|size|modified|permissions>` selector remains in the `files` row while its view clauses have their own rows.
- `help/commands.md` is itself the help page changed by this fix.
- No `documentation/user-documentation/` page describes the Commands table's row layout, so none needs an update.

## Out of scope

- No command dispatch, completion, availability, or application-command inventory changes.
- No new help pages or changes to per-command help page content.
- No changes to the Commands or Roles tabs.
