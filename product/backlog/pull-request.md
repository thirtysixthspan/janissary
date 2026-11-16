<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's promised case-only path sharing for files the patch itself creates on a case-insensitive volume.

Existing Issue: On a case-insensitive volume, `placeKeys` in `src/file-patch/view-entry.ts` keys a path that does not exist on disk by its typed letter case, so two sections naming the same not-yet-created path in different case resolve to separate places: `*** Add File: a.txt` followed by `*** Add File: A.txt` plans two writes to one file, reports two added paths, and keeps only the last content, while an Update or Delete through the other spelling fails `File not found`. Severity: 5/10

Existing Risk: 5/10 - A patch that scaffolds a file set with a case-only duplicate silently loses the first file's content and prints a success report that does not match the tree, which a person or agent then treats as applied.

Proposal Risk: 2/10 - The view must probe the volume's case behavior carefully and keep case-sensitive paths exact; a wrong probe would merge two genuinely distinct files, so both volume outcomes need tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "share case-only patch places for paths the patch itself creates on a case-insensitive volume". Add a cached case-sensitivity probe to `createPatchView` in `src/file-patch/view.ts`, using the same read-only existence check the `unifies case-only file and link spellings on a case-insensitive volume` case in `src/file-patch/view.test.ts` already uses (toggle the case of an existing entry under the root or its nearest ancestor; write nothing), and keep a second case-folded location index only when that probe says the volume is case-insensitive. Have `resolvePath` consult that index before creating a missing place, reusing the existing place and clearing `implicit` for an explicit section, so `*** Add File: a.txt` then `*** Add File: A.txt` fails `File already exists` at section 2 with nothing changed, an Update or Delete through `A.txt` acts on the added `a.txt`, and a nested `a/b/file` plus `A/b/file` pair shares one planned folder; keep exact keys on a case-sensitive volume. Extend `src/file-patch/view.test.ts` with Add/Add, Add/Update, Add/Delete, and nested missing-folder cases guarded by the existing case-insensitivity skip, and add an end-to-end `src/file-patch/apply.test.ts` case that expects the second Add to fail before any disk write. Keep the existing `unifies case-only file and link spellings on a case-insensitive volume`, planned-folder, and section-row cases passing untouched, and do not change `resolveMutationTarget` in `src/file-write/target.ts` or the file-read policy.


* Pay down the technical debt in the patch change builder's over-broad view dependency and its incomplete test fixtures.

Existing Issue: `buildPatchChanges` in `src/file-patch/changes.ts` declares a full `PatchView` but reads only `places()` and `plannedFolders()`, while the two inline view fixtures in `src/file-patch/sections.test.ts` omit the required `setExists` and `resolveLink` members; `tsconfig.json` excludes `**/*.test.*`, so no compiler checks the mismatch and the fixtures run only because the function never calls the missing members. Severity: 2/10

Existing Risk: 2/10 - The contract is invisible to every tool today, but a future change that typechecks tests or a fixture that needs the omitted members surfaces an error with no behavioral clue and invites copying the incomplete shape.

Proposal Risk: 1/10 - The narrowed dependency removes only an unused declaration surface; the fixture edit is mechanical and the existing assertions stay untouched.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "narrow the patch change builder's view dependency". In `src/file-patch/view.ts`, export a read-only `PatchViewReads` interface carrying `places(): readonly PatchPlace[]` and `plannedFolders(): readonly string[]`, and have `PatchView` extend it; change `buildPatchChanges` in `src/file-patch/changes.ts` to accept `PatchViewReads`. Update the two inline fixtures in `src/file-patch/sections.test.ts` (`indexes removed locations once when deriving many writes` and `tracks and reports many moves without repeatedly scanning chains`) to declare that type and drop their unused `contents` and `resolve` members, or keep those members on a wider typed variable if the tests still need them. Keep both performance assertions, the 1000 `location` reads and the sub-40,000 chain reads, and every other section test unchanged; no production behavior changes.
