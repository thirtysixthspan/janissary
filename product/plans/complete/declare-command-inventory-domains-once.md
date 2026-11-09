# Declare command inventory domains once
**Complexity: 3/10** — move three literal domains into the import-free shared contract and derive the server types and the runtime guard sets from them.

## Goal

Declare the native tool, settings source, and row kind domains once in `src/shared/application-commands.ts` so the server types and the Commands plugin validators cannot drift.

## Approach

- `src/shared/application-commands.ts` exports `as const` arrays `APPLICATION_COMMAND_NATIVE_TOOLS`, `APPLICATION_COMMAND_SOURCES`, and `APPLICATION_COMMAND_KINDS`, and derives `ApplicationCommandNativeTool`, `ApplicationCommandSource`, `ApplicationCommandKind`, and the row and declaration types from them.
- `src/native-commands/settings-types.ts`, `src/plugins/commands/shared.ts`, and `src/acp/native-commands.ts` alias those types instead of repeating the unions.
- `src/plugins/commands/shared.ts` builds `SOURCES`, `NATIVE_TOOLS`, and a new `KINDS` set from the arrays; `src/plugins/commands/payload.ts` imports `KINDS` rather than declaring it.
- The shared file imports only the import-free `src/shared/application-commands.ts`, so the commands client chunk gains no server module. The server-plugin boundary rule in `eslint.plugin-boundaries.mjs` rejected `../../shared/application-commands.js`; it gains that one allowed specifier, with an allowed case in `src/eslint-plugin-boundaries.test.ts`.

## Tests

- New `src/plugins/commands/domains.test.ts`: the guard sets equal the shared arrays; every declared kind, tool, and source is accepted by `isCommandsData` and `isCommandsPayload`; values outside the domains are rejected.
- Existing payload, shared, and chunk-import tests pass unchanged.

## Out of scope

Roles and launcher source unions, and any behavior change.
