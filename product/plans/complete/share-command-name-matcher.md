# Share one command-name normalizer and form matcher across server and client

**Complexity: 3/10** — a mechanical extraction of three copies of the same rules into one import-free module, with the existing tests on both sides guarding behavior.

The whitespace-and-case normalizer and the longest-form and canonical-form ranking were written out separately in `src/application-commands.ts`, `src/native-commands/decode.ts` and `web/src/shared/command-availability.ts`.

## Goal

One module owns which row a command input belongs to. The server resolver, the settings decoder and the browser's disabled-command check all import it, so a tie-break change cannot leave the client blocking or allowing a line the server decides otherwise. No user-visible behavior changes.

## Approach

1. Add `src/shared/command-matching.ts`, pure and import-free so the browser can load it through `@shared`: `normalizeCommandName`, `atFormBoundary`, `matchesCommandRow` and `rankCommandRows`, typed over rows carrying `name`, `aliases` and `forms`.
2. The server's local `longestForm` measured only `forms`, the client's also measured `name` and `aliases`. The shared ranking measures all three spellings; every inventory row spells its name and aliases among its forms or is matched identically either way, so the server's results are unchanged and the existing tests confirm it.
3. Replace the copies in `src/application-commands.ts` and `web/src/shared/command-availability.ts`; `resolveApplicationCommand`'s search-owner special case stays on the server.
4. Remove `normalizeCommandName` from `src/native-commands/decode.ts` and import it from the shared module there and in `src/native-commands/settings-file.ts`.

## Tests

- `src/shared/command-matching.test.ts`: normalization, word-boundary matching, alias matching, longest-form and canonical-form ranking, non-matching rows dropped.
- `web/src/shared/command-availability.parity.test.ts`: runs the same inputs, including `question ask`, `ask reset`, `search transcript` and `browser goto`, through the server resolver and the client matcher and asserts they pick the same row.
- Existing `src/application-commands.test.ts`, `src/native-commands/decode.test.ts` and `web/src/shared/command-availability.test.ts` pass unchanged.

## Out of scope

- Changing which row owns any input.
- Moving the search-owner special case off the server.
- Specs and documentation: behavior is unchanged, so none apply.
