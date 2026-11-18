# Unify native-command recognition across gating and extraction

**Complexity: 2/10** — ~6 added lines across 2 production files, 3 requirements and 3 test scenarios (p=3.98); a localized recognizer unification with no new architecture.

## Goal

`nativeCommandName` in `src/acp/native-commands.ts` recognizes a command by splitting the `NATIVE_ACP_COMMANDS` vocabulary and matching token prefixes. `createAcpToolTable` in `src/acp/tool-table.ts` gives each tool its own `match` predicate: regexes for browser, question, and file, `isWebCommandLine` for web, and a `match: () => true` database fall-through. `gateCoreCommand` and `toolExtractor` consult both recognizers for the same command, so the two can drift: rewording or adding a native command on one side can narrow gating or extraction on the other. Make both paths consume one recognizer over the vocabulary.

## Approach

Export a pure predicate from `src/acp/native-commands.ts` that decides whether a command matches one canonical vocabulary entry using the same token-prefix rule `nativeCommandName` uses today. Have `nativeCommandName` find the canonical entry with that predicate. In `createAcpToolTable`, drive the browser, question, file, and web `match` predicates from the canonical name the shared recognizer resolves and the owner it maps to; keep the database entry's `() => true` match as the explicit fall-through. The reply-line `isCommandLine` predicates stay as they are because they read different text, and no behavior, primer, or command vocabulary changes. Add a parity test that walks every `NATIVE_ACP_COMMANDS` entry through the name recognizer and the tool-table matchers and asserts they recognize it the same way, plus near-miss commands both reject.

## Implementation steps

1. In `src/acp/native-commands.ts`, export `matchesNativeCommand(command, name)` containing the whitespace-splitting, case-insensitive token-prefix check currently inlined in `nativeCommandName`, and rewrite `nativeCommandName` to find the vocabulary entry through it.
2. In `src/acp/tool-table.ts`, change the browser, question, file, and web `match` predicates to recognize a command when the canonical name resolved by the shared recognizer maps to that tool's owner; leave the database `match: () => true` fall-through and every `isCommandLine` predicate untouched.

## Tests

- In `src/acp/native-commands.test.ts`, add a parity test that, for every `NATIVE_ACP_COMMANDS` entry, asserts `nativeCommandName` returns that entry and the tool table's non-fall-through matchers recognize exactly the entry's owning tool, and that near-miss commands (`browser gotofoo …`, `file greps …`, `web searching …`) are rejected by `nativeCommandName` and by every non-fall-through matcher.
- Keep the existing `native-commands.test.ts` and `tool-table.test.ts` cases green, including the database fall-through, gating, and extraction cases.

## Out of scope

- The reply-line `isCommandLine` predicates and the `cleanCommandLine`/`findLastCommandLine` helpers.
- The command vocabulary, grants, primers, gate decisions, and extraction behavior.
- The per-tool line matchers' own parsing rules.

## Specs and docs

- `product/specs/acp.md`: checked at implementation time; recognition behavior does not change, so no spec edit is expected.
- `help/` and `documentation/user-documentation/`: checked at implementation time; neither documents this internal recognition path, so no change is expected.
