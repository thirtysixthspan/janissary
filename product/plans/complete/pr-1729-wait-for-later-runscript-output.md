# PR 1729: wait for later runscript output before checking continuation

**Complexity: 4/10** — remove an observation race in the system-schedule E2E driver without changing application behavior.

## Goal

Make the execution scenario wait until the managed system shell visibly prints the line after a failing runscript command before capturing its transcript and asserting continuation.

## Approach

Keep the existing runscript sequence, including `false` between the unique marker and `later-line`. After execution and focusing the system tab, wait with a bounded timeout for the exact `later-line` text inside the visible system-shell locator. Then capture the transcript and assert both the marker and later output. This preserves the test's coverage that a failed command does not stop subsequent script lines while removing the race between marker output and queue completion.

## Implementation steps

1. Update `scripts/e2e/system-schedules-execution.mjs` to wait for exact visible `later-line` output before reading the transcript.
2. Run `./scripts/run.mjs check-diff` and the relevant E2E driver/helper tests.
3. Confirm `product/specs/scheduling.md` still describes the existing continuation behavior; no behavior or spec wording changes are expected.
4. Promote this plan to `product/plans/complete/`, remove only the selected entry from the PR backlog, and publish to PR 1729's existing branch.

## Tests

- Run the system-schedule fixture/helper test and E2E session helper tests.
- Run `./scripts/run.mjs check-diff` to lint and test the changed driver.
- The browser scenario's bounded exact-text wait verifies both the expected visible output and continued execution after `false` when the E2E driver runs.

## Out of scope

- Changes to application scheduling, shell, or queue behavior.
- Changes to other PR backlog entries, the PR description, or public documentation.
- Merging, closing, or publishing to another branch.
