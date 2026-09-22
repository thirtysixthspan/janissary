# Preserve detached auto-approve state

Complexity: 4/10

## Goal

Restore a detached remote harness with the same auto-approve setting retained by its running remote detector.

## Approach

Carry the optional spawn flag through remote state and persisted harness records, defaulting legacy records to false.

## Implementation steps

1. Include auto-approve in remote process state and snapshots.
2. Persist and validate the optional harness field.
3. Use the recorded value when rebuilding a harness tab.

## Tests

- Cover state round trips and legacy-record fallback.

## Out of scope

- Changes to auto-approve behavior while a session remains attached.
