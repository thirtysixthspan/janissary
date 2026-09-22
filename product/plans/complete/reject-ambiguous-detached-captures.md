# Reject ambiguous detached capture labels

Complexity: 3/10

## Goal

Prevent a detached capture from selecting an arbitrary persisted session when several sessions retain the same label.

## Approach

Return a distinct ambiguous result from persisted-process lookup and turn it into a recovery-oriented capture error.

## Implementation steps

1. Detect multiple matching persisted processes without changing one-match lookup.
2. Report ambiguity from detached capture resolution while preserving open-tab precedence.
3. Add lookup and command tests, then update the harness spec.

## Tests

- Cover duplicate records in session lookup.
- Cover the capture ambiguity error and the existing one-record query.

## Out of scope

- Session attachment or record lifecycle changes.
