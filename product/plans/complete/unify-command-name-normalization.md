# Make command-name normalization one shared rule across the command bar, inventory, and ACP gate

**Complexity: 4/10** — ~10 added lines, 5 files, 8 requirements (p=4.93); five one-line import-and-call swaps around an existing shared helper, no new module.

## Goal

The rule that decides which spelling of a command name is accepted — trim the ends, collapse repeated whitespace to single spaces, lowercase — is defined once in `src/shared/command-matching.ts` as `normalizeCommandName`, and the application inventory already uses it. But `src/acp/native-commands.ts` re-implements it inline by trimming, splitting on whitespace, and lowercasing each word, and the command bar re-implements it with `command.trim().toLowerCase()` in four places. A change to accepted spelling made in the shared helper or in the command bar does not reach the ACP gate, so the same typed line can run in one entry point and be refused in the other. Make every gate and resolver normalize through the one shared helper.

## Approach

Route the four inline command-bar comparisons and the ACP native-command matcher through `normalizeCommandName`. The ACP matcher keeps its own word-boundary comparison and the `file ls` alias rewrite in `nativeCommandName` — only the normalization step is shared. Nothing about which command wins, how forms are ranked, or how the inventory is built changes. Add one test that feeds a mixed-case, multi-space line to both the command bar's resolver and the ACP gate and asserts they agree on the command name.

## Implementation

1. In `src/acp/native-commands.ts`, import `normalizeCommandName` from `../shared/command-matching.js` (NodeNext `.js` extension). In `matchesNativeCommand`, normalize the command once through that helper and compare its words with `name.split(' ')` using the existing `every` word-boundary check. Leave `FILE_LS_ALIAS` and `nativeCommandName` unchanged.
2. In `src/commands.ts`, import `normalizeCommandName` and replace `command.trim().toLowerCase()` in `getOutput` with `normalizeCommandName(command)`, keeping `help`/empty/unknown classification and every message unchanged.
3. In `src/commands/harness.ts`, import the helper and replace the bare-`harness` inline comparison in `run`.
4. In `src/commands/quit.ts`, import the helper and replace the inline comparison in `match`.
5. In `src/commands/schedule.ts`, import the helper and replace the bare-`schedule` inline comparison in `run`.
6. Run `$janissary/scripts/run.mjs check-diff` after each step and fix any failure before continuing.

## Tests

- In `src/acp/native-commands.test.ts`, add one case asserting the command bar and the ACP gate agree on one mixed-case, multi-space line: resolve a line such as `  TAB   FOCUS  notes  ` through `resolveCommand` and through `nativeCommandName`, and assert both name `tab`. Import the two functions needed from `../resolve.js` and `./native-commands.js`.
- Keep every existing assertion in `src/shared/command-matching.test.ts`, `src/acp/native-commands.test.ts`, and `src/commands.test.ts` byte-for-byte — they pin accepted spellings and command ordering.

## Out of scope

- `atFormBoundary` and the ranking in `rankCommandRows`, which `src/application-commands.ts` relies on for `search transcript` precedence.
- The `FILE_LS_ALIAS` rewrite, `nativeCommandTool` routing, and the `NATIVE_ACP_COMMANDS` vocabulary.
- The command `match` regexes and the shape of `CommandOutput`, `Resolution`, or the command registry.
- Any user-visible message, help page, or documentation text.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- A search for `.trim().toLowerCase()` under `src/commands.ts`, `src/commands/harness.ts`, `src/commands/quit.ts`, `src/commands/schedule.ts`, and `src/acp/native-commands.ts` finds no remaining inline normalization.

## Documentation and specification impact

None. This is a behavior-preserving refactor: the accepted spellings are unchanged and are already recorded in `product/specs/application-commands.md`, so no spec, `help/`, or user-documentation update is needed.
