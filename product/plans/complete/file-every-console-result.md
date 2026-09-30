# File every console result and link it from a one-line notification

**Complexity: 3/10** — the console read always streams its result into the result file it already knows how to write, and the notification becomes one line naming how many rows came back.

## Goal

A statement typed into the sql tab's console that returns rows reports its result as a notification whose body is the result itself: the column names, up to forty tab-separated rows, and a count. The feed is a list of one-line events, and a table pasted into it is not one. The result should be attached to the notification the way an auto-approved permission prompt's screen capture is: the line says what happened in a few words, and the result is in a file the line links to, which opens in an editor tab when clicked.

## Approach

Write every read's result to the result file, not only a long one. `readStatement` opens the file before the walk, writes the column names as its first line, streams each row as a tab-separated line, and ends it with the row count. The million-row ceiling stays: a result longer than that is written to the ceiling and the file's last line says it was capped.

The notification's text becomes one line:

- `Query returned 12 rows.`, `Query returned 1 row.`, or `Query returned no rows.`;
- `Query returned more than 1,000,000 rows; the first 1,000,000 are in the file.` when the file was capped.

The line carries the file as its link, through the `openFile` the sql plugin already passes, so clicking it opens the result in an editor tab — the auto-approve arrangement exactly. A statement that changed rows still says `OK.` or `3 rows changed.`, and a failure still says the SQLite error: neither has a result to attach.

When the file cannot be opened, the old shortened text is the fallback, so a statement that ran perfectly well never loses its result to a full disk. That is the one case the line holds rows.

The grid is unchanged: it still fills with the first two hundred rows and says on its range line when it was cut off.

## Implementation steps

1. **`src/database/console-read.ts`** — `take` opens the file up front and writes the header, streams every row into it, and buffers the forty-line shortening only when there is no file; `readStatement` ends the file with the count and reports the one-line summary with the file, or the shortening without one.
2. **`src/plugins/sql/activate.ts`** — the `say` comment describes the one-line summary; the code already carries the file.

## Tests

- `src/database/console-read.test.ts` — a short result is one summary line and a file holding the header, every row, and the count; one row and no rows read as such and still have a file; a long result's file holds every row; a capped result says so on the line and in the file; with nowhere to put a file the shortening is the fallback; the grid keeps its own ceiling; the statement is prepared once.
- `src/plugins/sql/activate.test.ts` — a result is said as its summary line with the file linked and the tab named.

## Spec

`product/specs/sql-database.md` — the console section: a statement that returned rows reports `Query returned <n> rows.` with a link to a file holding the whole result, opened in an editor tab like an auto-approved prompt's capture; the file's name and location; the cap; the fallback.

## Out of scope

- Removing old result files.
- Attaching a file to a count or a failure.
