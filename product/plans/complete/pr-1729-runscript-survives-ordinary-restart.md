# PR 1729: verify runscript persistence across ordinary restart

**Complexity: 2/10** — extend the existing restart scenario to check that its seeded script remains on disk and runs in the visible managed shell after relaunch.

## Goal

Make the ordinary-restart E2E scenario fail if startup cleanup loses the runscript or if the retained script cannot execute after restart.

## Approach

Keep the current scratch project, persisted schedule assertion, and launcher lifecycle. In the post-restart phase, verify the script path exists, execute the script through the normal command path, and wait for its distinctive output in the visible system shell before recording success.

## Implementation steps

1. Extend `scripts/e2e/system-schedules-restart.mjs` after the persisted entry checks with the runscript existence assertion, `execute restart-probe`, and a bounded wait for its marker in the visible system shell.
2. Update `product/specs/scheduling.md` to state that ordinary-restart E2E verification checks retained runscripts by executing them after relaunch.
3. Promote this plan, remove only the resolved first PR backlog entry, run diff checks and script tests, then commit and push to the existing PR branch.

## Tests

- Run `./scripts/run.mjs check-diff` after each change and once after all changes.
- Run the script-focused test command for the changed E2E driver and fixture scripts.

## Out of scope

- Changes to other system-schedule drivers or the ordinary launcher restart flow.
- Changes to schedule storage, script cleanup, or public user documentation.
- PR description edits, merging, closing, or publishing to another branch.
