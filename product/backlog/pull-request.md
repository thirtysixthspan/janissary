<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pay down the technical debt in the patch change builder's over-broad view dependency and its incomplete test fixtures.

Existing Issue: `buildPatchChanges` in `src/file-patch/changes.ts` declares a full `PatchView` but reads only `places()` and `plannedFolders()`, while the two inline view fixtures in `src/file-patch/sections.test.ts` omit the required `setExists` and `resolveLink` members; `tsconfig.json` excludes `**/*.test.*`, so no compiler checks the mismatch and the fixtures run only because the function never calls the missing members. Severity: 2/10

Existing Risk: 2/10 - The contract is invisible to every tool today, but a future change that typechecks tests or a fixture that needs the omitted members surfaces an error with no behavioral clue and invites copying the incomplete shape.

Proposal Risk: 1/10 - The narrowed dependency removes only an unused declaration surface; the fixture edit is mechanical and the existing assertions stay untouched.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "narrow the patch change builder's view dependency". In `src/file-patch/view.ts`, export a read-only `PatchViewReads` interface carrying `places(): readonly PatchPlace[]` and `plannedFolders(): readonly string[]`, and have `PatchView` extend it; change `buildPatchChanges` in `src/file-patch/changes.ts` to accept `PatchViewReads`. Update the two inline fixtures in `src/file-patch/sections.test.ts` (`indexes removed locations once when deriving many writes` and `tracks and reports many moves without repeatedly scanning chains`) to declare that type and drop their unused `contents` and `resolve` members, or keep those members on a wider typed variable if the tests still need them. Keep both performance assertions, the 1000 `location` reads and the sub-40,000 chain reads, and every other section test unchanged; no production behavior changes.
