# Launcher SQL command

**Complexity: 3/10** — add one default command, one icon, and focused regression tests.

## Goal

The launcher's built-in command rail includes a SQL item that runs `sql`.

## Approach

Add a built-in SQL entry with the database icon, and register `faDatabase` in the launcher's recognized icon set so it renders without a fallback. Update the default command and icon tests, then document the new built-in entry.

## Implementation steps

1. Add the SQL entry to `src/plugins/launcher/commands-file.ts` and its expected defaults in `src/plugins/launcher/commands-file.test.ts`.
2. Register `faDatabase` in `web/src/plugins/launcher/launcher-icons.ts` and test it in `launcher-icons.test.ts`.
3. Update the built-in command list in `product/specs/launcher.md`.
4. Run `./scripts/run.mjs check-diff`.

## Tests

- The default launcher list includes a SQL entry whose command is `sql` and icon is `faDatabase`.
- The launcher recognizes `faDatabase` as a supported icon.
- Run server and web tests through `check-diff`.

## Out of scope

- Changing SQL command behavior or the database selection rules.
- Adding the SQL command to a user's custom `launcher.json`.
