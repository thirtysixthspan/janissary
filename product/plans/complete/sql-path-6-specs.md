# Update the specs for path-backed SQL databases

**Complexity: 1/10** — docs only: lines_added=0, files_edited=0, requirements=0, scenarios=0, new_units=0 (p=1.58).

## Goal

Bring the four behavior specs that describe the SQL command, the connection registry, plugin docking and `connections list` in line with the shipped `sql file <path>` / `sql database <name>` behavior, so a contributor can predict the command's exact output and the tab's metadata row from the docs alone.

## Design decisions and dependencies

The source plan is `./product/plans/complete/sql-path.md`. This subplan depends on `./product/plans/ready/sql-path-5-payload-and-switcher.md` (and through it on subplans 1–4): all code and tests are complete, and only docs remain. It lands last so the specs describe the final behavior rather than an intermediate checkpoint.

- Specs are behavior docs, not design essays: state exact usage and error lines verbatim, cover the edge cases as first-class statements, and use `[[name]]` cross-references in the existing house style (`ai/guidelines/developer-documentation.md`). Do not add implementation code blocks.
- `product/specs/launcher.md` keeps its SQL entry running bare `sql`, which is unchanged, and is not edited.
- No other spec needs an edit. The unreadable-file behavior in `sql-database.md` ('one that is not an SQLite database at all, or one another process holds locked', lines 396–398: object list, pages and exports fail with the SQLite error as notifications while the tab carries on) already states the generic case, which includes a directory and a locked file opened by path, so it is kept, not rewritten.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The `sql` command section | `product/specs/sql-database.md:13` (`### The \`sql\` command`) | Rewritten around the three forms and their exact messages; the keep-versus-replace split is fixed in Proposed changes. |
| Opening paragraph | `product/specs/sql-database.md:3` ('browses one of the project's SQLite databases') | Qualified so it also covers a file reached by path. |
| Metadata-row paragraph | `product/specs/sql-database.md:49` ('The row carries a database dropdown') | Gains one sentence on the read-only basename label and full-path tooltip for a path-backed tab. |
| The "What it does not do" section | `product/specs/sql-database.md:408` (`### What it does not do`) | Two bullets corrected: reachability by path, and the connections-list boundary. |
| Browsing-a-database paragraph | `product/specs/database.md:51` (the paragraph beginning 'The command surface above is the only way to *run* SQL') | Reworded to name both forms, the browser-owned path connection, and the removal of the name-only reachability clause. |
| SQL dock-grammar sentence | `product/specs/tab-plugins.md:146` ('The SQL plugin reads its own, because its dock word follows an optional database name') | SQL removed from the shared dock grammar; its own grammar no longer reads a dock word. |
| SQL-plugin paragraph | `product/specs/tab-plugins.md:270` ('Bundled SQL database plugin', the `sql notes` example at :272) | Example becomes `sql database <name>` and the name-only reachability clause at :270 is qualified for the path form. |
| `connections list` wording | `product/specs/connection.md:75` ('`connections list` shows every open connection') and `product/specs/connection.md:53` ('A database opened by the SQL browser tab ... appears in `connections list`') | Both extended with the path-backed-SQL exclusion. |

## Proposed changes

- `product/specs/sql-database.md`, in "The `sql` command" (line 13): rewrite it around the three forms. State that `sql file <path>` opens and browses the SQLite file at that path and `sql database <name>` keeps the current name behavior, including the verbatim lines `No database named "<name>". Create it with: db sqlite create <name>`, `Invalid database name "<name>".` and `No databases. Create one with: db sqlite create <name>`; bare `sql` still opens or focuses the most recently reached open database or the first by name. Keep the existing sentences at lines 36–40 on one tab per database, on reopening a tab keeping its filters, search term, hidden columns, order, page and exports, and on a closed tab starting over. They describe the named form and still hold. State the exact usage line `Usage: sql [file <path>|database <name>]` for any unrecognized argument (including the old bare name, the removed `left`/`right` words and a keyword with no separating whitespace such as `file/path`) and for a keyword with no value; state `No database file at "<path>".` for a missing path, with no file created, and note that the `<path>` shown is the resolved absolute path that was checked. State that keywords are lower case only, the value is the trimmed remainder so paths with spaces survive, a relative path resolves against the project directory, and no form docks — every SQL tab opened by the command lands in the centre. State that a path-backed tab is keyed by the resolved absolute path and titled with the file's basename with exactly one trailing `.sqlite` removed case-insensitively (any other extension, such as `.db`, is kept), that reopening the same path focuses one tab while two paths with the same basename stay distinct, and that a path under `.janissary/db/sqlite/` is still path-keyed and distinct from the same file opened by name.
- `product/specs/sql-database.md`, elsewhere in the same spec: in the opening paragraph at line 3, qualify 'browses one of the project's SQLite databases' so it also covers a file reached by path. In "What it does not do" (line 408), replace the bullet that says only the project's own databases are reachable with one that says the command is the only path-opening surface and the dropdown still lists named databases only; correct the final connections bullet so it says a path-backed database is absent from `connections list`, tab completion and the tab's own connections panel, and cannot be closed with `connections close sqlite:<name>`. Add one sentence to the metadata-row paragraph at line 49 (the one beginning 'The row carries a database dropdown') describing the read-only basename label with the full path in its tooltip for a path-backed tab. Leave the unreadable-file behavior at lines 396–398 untouched.
- `product/specs/database.md`: update the "Browsing a database" paragraph at line 51 (the one beginning 'The command surface above is the only way to *run* SQL') so the browser is reached by `sql database <name>` or `sql file <path>`; a path-backed connection is held by the browser under the resolved absolute path and is not added to the name registry, while the name path keeps using the registry and name rule. Replace the closing clause 'a database is reachable only by the name the registry holds it under' rather than leaving it to stand. It still claims no file extensions.
- `product/specs/tab-plugins.md`: remove the SQL sentence from the shared dock-grammar paragraph at line 146 ('The SQL plugin reads its own, because its dock word follows an optional database name') — SQL no longer reads a dock word — and update the SQL-plugin paragraph (the 'Bundled SQL database plugin' section at line 268) so its example at line 272 uses `sql database <name>` rather than `sql notes`, and qualify the 'a database is reachable only by the name the registry holds it under' clause at line 270 so it no longer denies the path form. The command can open a file by path without claiming a file extension.
- `product/specs/connection.md`: extend the `connections list` sentence at line 75 ('`connections list` shows every open connection') so it explicitly excludes path-backed SQL databases and says `connections close sqlite:<name>` cannot close one. Also update the paragraph at line 53 ('A database opened by the SQL browser tab ([[sql-database]]) is a global connection, so it appears in `connections list` and in tab-completion') so that claim applies to a name-backed database only. A path-backed one is neither global nor listed. Keep the reference-resolution paragraph at line 77 unchanged.

## Tests

None: this subplan edits documentation only. Existing tests do not read specs, so no test file changes.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Read the four spec diffs side by side with subplans 1–5 and grep `product/specs/` for stale `sql <name>`, `sql left`, `sql right` and `sql notes` forms tied to the old grammar. Confirm `product/specs/launcher.md` is unchanged and that all exact error and usage lines match the strings subplan 3 adds to `src/plugins/sql/activate.test.ts`. Every `[[link]]` you add or keep follows the house rule in `ai/guidelines/developer-documentation.md`: a link to a spec that does not exist yet is fine, so do not delete one for that reason. Finish with the manual walk in `./product/plans/ready/sql-path-5-payload-and-switcher.md`, comparing each printed line and metadata-row label with the spec's verbatim wording.

## Out of scope

- No source, test, config or code change.
- No change to `product/specs/launcher.md` or to any spec other than the four named above.
- No change to the feature's scope: no path picker, no `.sqlite` extension claim, no `db sqlite` path forms, and no path-backed database in the name registry or `connections list`.
