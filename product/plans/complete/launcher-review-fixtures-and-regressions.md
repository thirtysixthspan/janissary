# Repair launcher review fixtures and pin the remaining regressions

**Complexity: 6/10** — the production behavior is already present; the work makes existing tests exercise the published contracts and adds focused regression assertions in three established test suites.

## Goal

Launcher tests use valid host activity and notification data, and the initialisation, transcript timestamp, and missing-tab focus guarantees stay covered by the project’s tests.

## Approach

Use complete `TabActivityEntry` values and a narrow typed summarizer capability contract so fixtures expose contract mismatches at compile time. Send activity rows through the tabs topic fixture. Keep host-backed launcher close/reopen coverage from the preceding fix and add checks for launcher file seeding, the three transcript timestamp writers, and focus of an absent tab.

## Implementation steps

1. Complete the summarizer activity fixture, use only contract-supported view values, supply a delimiter to every prompt builder call, and assert the actual prompt description.
2. Narrow the summarizer capability dependency and type the summarizer test stubs without forced casts. Pass `TabActivityEntry` objects through moved-topic tests.
3. Add project-init coverage proving `.janissary/launcher.json` is seeded from the launcher defaults once and preserved on a second init; keep the fixture inside the repository's `temp/` directory.
4. Add deterministic `lastActivity` timestamp assertions for append, running-entry update, and transcript clear. Strengthen the existing missing-label focus test.
5. Run `./scripts/run.mjs check-diff` after each change, update this plan to complete, and remove this entry from the PR backlog.

## Tests

- `src/plugins/launcher/summarizer.test.ts`: typed activity fixtures, valid views, delimiter arguments, and matching marker descriptions.
- `src/plugins/launcher/activate.test.ts`: moved topic delivery contains full activity entries.
- `src/project/init.test.ts`: launcher defaults are seeded and a later init preserves existing user content.
- `src/tab/transcript/events.test.ts`: each transcript writer stamps `lastActivity`.
- `src/plugins/topics.test.ts`: focus of a missing tab leaves selection unchanged.
- `src/plugins/launcher/host-lifecycle.test.ts`: retain the existing real host and tab manager close/reopen regression.

## Spec updates

None. This change strengthens tests for behavior already described in `product/specs/launcher.md`.

## Out of scope

- Changing launcher behavior or the published plugin contract.
- Editing the separate production fix from the preceding backlog entry.
- Adding user documentation for behavior already covered by the launcher spec.
