# Prefer canonical command names over fixed forms in the commands grammar

Issue: `parseCommand` scans rows in payload order and accepts the first row whose name, aliases, or forms match, so the builtin `question` row's fixed forms `question ask` and `question approve` win over the native rows' canonical names. `commands disable question ask` changes the builtin `question` setting and `commands disable agent question ask` is refused as non-native, while the settings manager's resolver targets the native row.

Complexity rating: 2/10

## Goal

Make `commands enable|disable [agent|global] <command>` resolve a normalized remainder against canonical names before aliases before fixed forms across every row, so a native row's canonical name wins over an earlier row's fixed form. `question ask` and `question approve` target the native commands while every existing name, alias, and unique fixed-form case keeps its current owner.

## Approach

In `src/plugins/commands/parse-command.ts`, replace the single `rows.find` over the concatenated name, aliases, and forms with three ordered passes: an exact canonical `name` match across all rows, then an exact `aliases` match, then an exact `forms` match. Each pass keeps row order within itself and returns the first match's `name`. Canonical names therefore outrank another row's alias or fixed form, and aliases outrank fixed forms, without changing the canonical name returned for a row.

This matches the topic's existing `resolveApplicationCommand` behavior, which already prefers the native `question ask` and `question approve` rows, so the command bar and the Commands tab settings manager agree.

## Implementation steps

1. Change `parseCommand` in `src/plugins/commands/parse-command.ts` to resolve the normalized remainder in the three ordered passes.
2. Add question rows to the `ROWS` fixture in `src/plugins/commands/parse-command.test.ts` — the builtin `question` row with forms `question ask` and `question approve`, ordered before the native `question ask` and `question approve` rows — and add a case asserting `enable question ask` and `disable agent question ask` both target `question ask`, with `enable question approve` targeting `question approve`.
3. Add the same builtin and native question rows to the `DATA` fixture in `src/plugins/commands/activate.test.ts` and add a case asserting the sent `set` action names `question ask` with the `enabled` and `agentAccess` settings.
4. Update `product/specs/application-commands.md` to state the precedence.
5. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/commands/parse-command.test.ts`: `enable question ask` resolves to name `question ask` with setting `enabled`; `disable agent question ask` resolves to name `question ask` with setting `agentAccess`; `enable question approve` resolves to name `question approve`; the existing `ask reset`, `search transcript`, `db sqlite`, `db sqlite query`, `exit`, `agent`, and `agent agent` cases keep their current results.
- `src/plugins/commands/activate.test.ts`: `enable question ask` sends `{ name: 'question ask', setting: 'enabled', value: true }`; `disable agent question ask` sends `{ name: 'question ask', setting: 'agentAccess', value: false }`; the existing activate cases keep passing.

## Specs and docs

- `product/specs/application-commands.md`: state that names match canonical names first, then aliases, then fixed forms, so `commands enable question ask` targets the native `question ask` command rather than the builtin `question` command.

## Out of scope

- Changing `resolveApplicationCommand`, the topic validator, or the settings manager; they already prefer the native row.
- Changing row order, labels, or the native `question ask` and `question approve` commands.
- Help and user documentation: they describe exact matching but state no wrong precedence, so no correction is needed.
