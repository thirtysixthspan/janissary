# Rename `connection` to `connections`, capture its list output in shell tabs, and report closes as notifications

**Complexity: 4/10** — the code change is small (one command, its parser, its completion handler, the connection manager, and two new notification events), but the rename fans out across help pages, user documentation, and specs that quote the command by name.

## Goal

- The command is `connections` (`connections list`, `connections close <kind>:<id>`). The old `connection` word is no longer a command.
- `connections list` typed in a shell tab prints its lines. Today it prints nothing there: `ConnectionManager.run` appends its output with `tab.append`, which carries no invocation id, so the shell tab's capture (which filters appended entries by invocation id) never sees it.
- `connections close` reports its outcome as a notification instead of a transcript line: `Closed connection <kind>:<id>.` on success, and an error notification when the connection does not exist (`No open connection <kind>:<id>.`) or closing it fails (`Could not close connection <kind>:<id>: <reason>.`).

## Approach

1. **Rename.** `src/commands/connection.ts` becomes `src/commands/connections.ts` with `name: 'connections'`, `match: /^connections\b/i`, and samples updated. `parseConnectionCommand` strips `connections` and its usage strings read `Usage: connections <list|close> [kind:id]  (e.g. connections close sqlite:mydb)` and `Usage: connections close <kind>:<id>`. `completeConnectionClose` checks for `connections`. Comments in `src/` that quote the command are updated to the new name.
2. **List output through the invocation.** `ConnectionManager.run` takes the optional `CommandInvocationContext` and writes `list` and usage/validation output through `appendCommandOutput`, so a shell tab's capture receives it.
3. **Close outcomes as notifications.** Add two explicit notification events: `connection-closed` (success cue, no desktop banner by default) and `connection-close-failed` (error cue, desktop banner). Both are attributed to the issuing tab, have no toggle, bypass focus suppression, and render their message as-is. `ConnectionManager.run` classifies each close result (from `closeConnection` and from the browser's `window close` reply) by its `Closed connection ` prefix, and a thrown error becomes `Could not close connection <kind>:<id>: <first line of error>.` The browser close no longer opens a running transcript entry; it awaits the browser and notifies.
4. **Docs.** Rename `help/connection.md` to `help/connections.md`, update `help/commands.md`, the user documentation pages and specs that quote `connection list`/`connection close`/`connection`, and document the two new events in `product/specs/notifications.md`.

## Implementation steps

1. Rename the command module and test, register it under the new name, update the parser and completion handler, and update references in tests.
2. Thread the invocation into `ConnectionManager.run`; route list and usage output through `appendCommandOutput`.
3. Add the `connection-closed` and `connection-close-failed` events (type union, explicit-events map, text, alert defaults) and notify close outcomes from `ConnectionManager.run`.
4. Update specs, help, and user documentation.

## Tests

- `src/commands/connections.test.ts`: the command is named `connections`, matches `connections list`/`connections close …` case-insensitively, and does not match `connection`.
- `src/connections.test.ts`: the parser accepts `connections` and its usage strings name `connections`.
- `src/connection/manager.test.ts`:
  - `connections list` with an invocation appends through `appendForInvocation` with that invocation id.
  - `connections list` with nothing open writes `No open connections.`.
  - a successful close sends a `connection-closed` notification with `Closed connection …` and writes nothing to the transcript.
  - a close with nothing to close sends a `connection-close-failed` notification with `No open connection …`.
  - a close that throws sends a `connection-close-failed` notification with `Could not close connection …: <reason>.`.
  - a browser close awaits the browser and notifies its result.
- `src/notifications/format.test.ts`: the two new events render their detail as-is.
- Completion and controller tests updated to the new command word.

## Out of scope

- Keeping `connection` as an alias.
- Changing the connections panel or the close messages' wording beyond the new failure line.
- Reporting `connections list` or usage errors as notifications.
