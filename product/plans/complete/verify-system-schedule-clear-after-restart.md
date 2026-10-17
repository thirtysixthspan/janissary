# verify aggregate system-schedule clear after restart

**Complexity: 4/10** — split the existing management browser driver into a marker-selected second phase and assert the cleared owners remain empty after the normal app relaunch.

## Goal

Verify that aggregate Clear all schedules remains effective after an ordinary application restart while preserving the project runscript and existing row-action coverage.

## Approach

Use a scratch evidence marker in the existing project to select first-run management setup versus post-restart verification. The first phase keeps duplicate keyed-delete assertions, clears the aggregate schedules, verifies both owners and the script, writes phase evidence, and returns. The established two-batch E2E lifecycle closes the browser and server between phases and relaunches the same project. The second phase checks the persisted system store, aggregate empty state, and runscript existence.

## Implementation steps

1. Extend the system-schedules management driver with marker-based phase selection and restart persistence assertions without removing its dialog or keyed row-action coverage.
2. Update the scheduling spec to state that aggregate clear-all remains empty after ordinary restart while the runscripts remain available.
3. Remove the selected PR backlog entry while preserving the hidden-shell entry.

## Tests

- Run `./scripts/run.mjs check-diff` for the changed scripts and spec.
- Run the management E2E in its two ordinary-launch batches with an attached browser, reusing the same scratch project.

## Out of scope

- Changing scheduling behavior or UI implementation.
- Modifying the remaining PR backlog item or PR description.
- Merging or closing PR #1729.
