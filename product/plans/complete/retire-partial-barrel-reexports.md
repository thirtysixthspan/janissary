# Retire the partial barrel re-exports in commands.ts, connections.ts, and profiles.ts

**Complexity: 4/10** — a mechanical import refactor. Four re-export lines are deleted and nine importing files are repointed at the defining module. No logic moves, no behavior changes; the typechecker proves the repointing is complete.

## Goal

Remove the re-export lines that make `src/commands.ts`, `src/connections.ts`, and `src/profiles.ts` partial barrels. Each of these files holds real logic of its own *and* forwards symbols that are defined in its own sibling directory:

- `src/commands.ts` forwards `resolveAgentName` and `parseAgentCommand` from `./agent/commands.js`, and `agentNames` from `./agent/names.js`.
- `src/connections.ts` forwards `parseConnectionCommand` from `./connection/parsing.js`.
- `src/profiles.ts` forwards `PROFILE_USAGE` and `parseProfileCommand` from `./profile/command.js`, and `loadProfile` from `./profile/file.js`.

`ai/guidelines/imports-and-barrel-files.md` rules this out for application code: every symbol is imported directly from the module that defines it. The extra hop is not theoretical — `src/connection/manager.ts` reaches up to `../connections.js` for a function defined next to it at `connection/parsing.ts`, and `src/profile/manager.ts` and `src/profile/new-agent.ts` do the same through `../profiles.js` and `../commands.js`.

Removing the `loadProfile` forward also breaks a genuine import cycle: `src/profiles.ts` imports `./profile/file.js`, which imports `profileReadPath` back from `../profiles.js`.

## Approach

Repoint every caller first, then delete the four re-export lines, so the tree never sits in a state where a symbol is unreachable. Where a caller currently pulls a mix of forwarded and locally defined symbols from the same barrel in one statement, split it into two import statements: one for the barrel's own exports, one for the defining module.

## Implementation steps

1. Repoint the `agent/` symbols: `src/profile/manager.ts` and `src/profile/new-agent.ts` take `resolveAgentName`/`parseAgentCommand` from `../agent/commands.js`; `src/commands/agent.test.ts` takes those from `../agent/commands.js` and `agentNames` from `../agent/names.js`; `src/controller.test.ts` takes `agentNames` from `./agent/names.js`.
2. Repoint `parseConnectionCommand`: `src/connection/manager.ts` imports it from `./parsing.js`, and `src/connections.test.ts` from `./connection/parsing.js`, keeping its `dbPath`/`initDbDir` import on `./connections.js`.
3. Repoint the `profile/` symbols: `src/profile/manager.ts` takes `parseProfileCommand` from `./command.js` and `loadProfile` from `./file.js` while keeping `listProfiles`/`profileExists` on `../profiles.js`; `src/profile/file.test.ts` and `src/profile/save.test.ts` take `loadProfile` from `./file.js`; `src/profiles.test.ts` takes `parseProfileCommand`/`PROFILE_USAGE` from `./profile/command.js` and `loadProfile` from `./profile/file.js`.
4. Delete the four re-export lines from `src/commands.ts`, `src/connections.ts`, and `src/profiles.ts`.

## Tests

No new tests. This change moves no logic and alters no behavior, so there is nothing new to pin; the existing suites that exercise these symbols (`src/commands/agent.test.ts`, `src/connections.test.ts`, `src/profiles.test.ts`, `src/profile/command.test.ts`, `src/profile/file.test.ts`, `src/profile/save.test.ts`, `src/controller.test.ts`) are the coverage, and they must keep passing while importing through the new paths. The typecheck is what proves no caller was missed: a stale import of a deleted re-export fails to compile.

## Out of scope

- Moving test cases to sit beside the module they exercise. `src/connections.test.ts` covers `parseConnectionCommand` and `src/profiles.test.ts` covers `parseProfileCommand`, both now imported across a directory boundary; relocating those cases is a separate colocation change.
- Splitting `src/commands.ts`, `src/connections.ts`, or `src/profiles.ts` further, or renaming them.
- Any other re-export elsewhere in `src/`.

## Documentation

None. This change is invisible from outside the codebase — no command, flag, default, or user-visible behavior changes, so no functional spec, `help.md` entry, or user documentation page describes anything that is now different.
