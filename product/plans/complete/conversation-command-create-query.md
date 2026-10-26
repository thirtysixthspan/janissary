# Conversation command creates or opens by title

## Complexity

6/10. The command declaration currently supports only one plugin command name, so the fix also needs a small additive extension to command claims and adapter tests. Existing conversation tab and query actions keep the implementation local rather than introducing a new subsystem.

## Goal

Make `conversation <title>` open a saved conversation when one matches, or create a new conversation and submit `<title>` as its first query when none matches. Preserve `conversations` and its `left`/`right` docking behavior.

## Approach

Add optional command aliases to the static plugin declaration and have the existing command adapter register each claim against the same activation handler. Pass the matched command name as an optional activation argument so one plugin can vary behavior by alias. Reuse the current list matching and tab/query actions so stored conversation behavior and model lifecycle remain owned by the conversations manager. Do not change the plural command grammar.

## Implementation steps

1. Add optional command aliases to tab-plugin declarations, pass the matched name to the activation handler, and register each alias through the command adapter, refusing reserved or duplicate claims as for primary command names.
2. Add the singular `conversation` alias to the conversations plugin and use the matched command name to select singular create-on-miss behavior.
3. For an unmatched singular command argument, create a conversation and submit the argument as the first query; preserve existing behavior for matched titles and plural commands.
4. Add adapter and plugin command tests for alias registration, conflict rejection, creating and sending a query via the singular alias, opening a matching conversation via the alias, and retaining plural list/docking behavior.
5. Update the conversations spec with the singular command behavior.

## Tests

- Plugin command tests verify a matching title opens the existing conversation and an unmatched title creates a conversation then sends the title as its query.
- Plugin command tests verify `conversations <left|right>` remains docking syntax and bare `conversations` still opens the list.
- Command adapter tests verify aliases register, match case-insensitively, and reject reserved or duplicate names.

## Documentation

- Update help and the command reference and conversation page because they currently describe the plural command's missing-title error and omit the singular command.

## Out of scope

- Changing stored conversation title matching or the conversations manager's query lifecycle.
