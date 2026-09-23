# Prevent Notification Record Symlink Writes

**Complexity: 4/10** — the record writer has a small filesystem boundary and existing best-effort failure handling. The main care is ensuring both append and truncate validate the opened target and always close the descriptor.

## Goal

Prevent notification recording and clearing from following a symlink at either `.janissary` or `notifications.json` to modify a file outside the workspace.

## Approach

Use `O_NOFOLLOW` when opening the record for append or truncation, verify the opened descriptor is a regular file, and close it in all cases. Refuse to initialize or write through a symlinked/non-directory `.janissary` path. Preserve silent abandonment on unsafe or failed operations.

## Implementation steps

1. Replace path-following append/truncate helpers with a shared safe open-and-validate routine.
2. Add symlink tests for both append and clear, retaining ordinary write/truncate coverage.
3. Update the notification spec to state that linked paths are refused and recording remains best-effort.

## Tests

- A symlink at `notifications.json` is not followed by append or clear, and its external target remains unchanged.
- Existing append, clear, and failure-abandonment cases continue to pass.

## Out of scope

- Changing queue or toast delivery when recording is unavailable.
- Persisting notifications outside the current record format.
