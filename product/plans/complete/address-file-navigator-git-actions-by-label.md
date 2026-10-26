# Address file-navigator Git actions by label

**Complexity: 6/10** — three related RPCs change from positional tab indices to stable labels across the protocol, server adapter, and client hook, with targeted decoder and routing tests.

## Goal

Ensure pull, commit, and nothing-to-commit requests only reach the navigator that sent them, even if tabs close and shift positions before the server handles the request.

## Approach

Change the three request parameter shapes to `{ label }` (plus the existing commit message and paths), validate labels as strings, and pass them unchanged through dispatch and the controller adapter. Server wrappers return without side effects when the label no longer belongs to an open tab. The navigator already receives its label as a prop; the client hook will use it for these three requests while retaining the index for unrelated indexed actions.

## Implementation steps

1. Update protocol shapes and client parameter validators for pull, commit, and nothing-to-commit.
2. Thread labels through the message dispatcher and controller adapter, guarding each operation against a closed navigator.
3. Update the client intent hook and its call site to send the tab label.
4. Update decoder, controller, adapter, and client tests, including a tab-shift regression proving a request cannot commit a different navigator's tree.
5. Update the file-navigator spec and remove the resolved backlog entry.

## Tests

- Parameter decoder accepts labels and rejects missing or non-string labels.
- Controller and adapter tests prove each action is addressed by label and becomes a no-op after that navigator closes.
- Client hook tests pin the label-based payloads.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Converting other index-addressed file-navigator requests.
- Adding tab-incarnation identities to distinguish a closed and reopened navigator reusing the same label.
