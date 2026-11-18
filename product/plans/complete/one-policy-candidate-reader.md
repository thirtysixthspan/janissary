# Read every search candidate through one policy-carrying reader

**Complexity: 5/10** — ~130 added lines across 4 production files, 6 requirements and 8 test scenarios (p=5.55); a security-policy consolidation behind one injectable reader, bounded by existing seams.

## Goal

`src/file-grep/read-candidate.ts` `createCandidateReader` is the only candidate reader that applies the workspace's file-safety policy: it refuses secret paths, checks the real target against the home-secret anchors, rejects symlinked ancestors and a final link whose real path differs from the requested path, and bounds size and binary content. `src/file-navigator/search-text.ts` `readCandidate` and `src/plugins/search/scan.ts` `readableText` each re-implement only the size-and-binary part with plain `stat`/`read` calls, so the navigator search and the search plugin will happily read a `.env` file or a symlink-escaped file that `file grep` refuses. Consolidate all three onto one shared reader so the policy is a property of reading a candidate, not of which command happened to do the reading. No command, flag, key binding, or user-visible behavior changes.

## Approach

Put the shared reader in `src/search/search-files.ts`. It is already a search-core module on the server tab plugin's explicit import allow-list (`eslint.plugin-boundaries.mjs`), so file grep, the file navigator, and the search plugin can all reach it without changing any import boundary or config. Move the exact policy logic that today lives in `src/file-grep/read-candidate.ts` into it and give it an injectable filesystem seam.

Export from `src/search/search-files.ts`:

- `CandidateReader = (relPath: string) => Promise<string | null>`.
- `CandidateIo` with `lstat`, `realpath`, and `readFile` operations, defaulting to `node:fs/promises`.
- `createCandidateReader(root, signal?, io?)`: canonicalizes the root once through `io.realpath`, builds `createRealTargetCheck(realRoot)`, and returns a reader that rejects empty/absolute/escaping paths with `containedStrictly`, refuses `isSecretPath` relatives and real-target failures, `lstat`s every ancestor to require a real directory, `lstat`s the file to require a regular file no larger than `SEARCH_MAX_FILE_BYTES`, `realpath`s it and requires canonical equality plus a clean real-target check, then reads with the signal and refuses a NUL in the first `SEARCH_BINARY_PREFIX_BYTES`. The default IO reproduces today's byte-for-byte behavior, including passing the signal to `readFile`.

Wire the three pipelines to it while preserving their seams:

- `src/file-grep/read-candidate.ts` becomes a thin `createCandidateReader` wrapper that calls the shared factory with default IO and returns its reader; it keeps its exported `CandidateReader` type so existing imports, mocks, and `withDeadline` call sites are unchanged.
- `src/file-navigator/search-text.ts` builds the shared reader once from `root` and uses it as the default for its existing injectable `candidateReader(root, relPath)` seam, whose signature is unchanged so tests can still inject fakes.
- `src/plugins/search/scan.ts` builds the shared reader once `listFiles` has yielded the root and has `readableText` read through it. When a test injects `readFile`/`fileSize`, it supplies an IO shim built from those (candidate paths from the listed set are files, ancestors are directories, `realpath` is identity); in production with no injection it uses the real IO so symlink and real-target checks apply. The two-phase scan, batching, cancellation, and 250-row cap are untouched.

This keeps every existing refusal and injectable seam intact while making secret and symlink refusal uniform. The security-sensitive checks stay in one module; file grep, the navigator, and the plugin stop deciding each for themselves.

## Implementation steps

1. In `src/search/search-files.ts`, add the `CandidateReader` and `CandidateIo` types and the `createCandidateReader` factory with default `node:fs/promises` IO, moving the helper logic (`resolveCandidate`, `isAborted`, `hasRealDirectories`, `readCandidate`) from `src/file-grep/read-candidate.ts`. Run `$janissary/scripts/run.mjs check-diff`.
2. Replace the body of `src/file-grep/read-candidate.ts` with the thin delegating wrapper and keep its `CandidateReader` type export; confirm the many `vi.mock('./read-candidate.js')` call sites still resolve `createCandidateReader`. Run `$janissary/scripts/run.mjs check-diff`.
3. In `src/file-navigator/search-text.ts`, build the shared reader from `root` after the empty-query guard and default `candidateReader` to it while keeping the `(root, relPath)` seam. Run `$janissary/scripts/run.mjs check-diff`.
4. In `src/plugins/search/scan.ts`, add the IO shim, build the shared reader in `run` after `listFiles`, and read candidates through it in `readableText`; keep `MAX_BYTES` and the batch/matcher/cancel behavior. Run `$janissary/scripts/run.mjs check-diff`.
5. Run the full `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- `src/file-grep/read-candidate.test.ts` (existing): now exercises the shared reader through the delegating wrapper; all secret, link, home-secret, size, binary, abort, and caching cases must keep passing unchanged.
- `src/file-navigator/search-text.test.ts`: add cases asserting that a secret file (`.env`) and a symlink-escaped file are skipped even when their contents would match, and that the injectable `candidateReader` seam still overrides the default.
- `src/plugins/search/scan.test.ts`: add a secret-path case through the injected IO shim, and a real-filesystem case (temporary directory with a symlink to a file outside the root) asserting the linked file produces no rows; keep every existing size, binary, ordering, cancellation, and cap case passing.
- `src/search/search-files.test.ts`: keep its matcher cases passing; no new case required there because the reader is covered through the three pipelines.

## Out of scope

- New commands, flags, key bindings, or help/documentation changes; this is a behavior-preserving security consolidation.
- Refactoring the other file-read, file-write, and file-patch path policies beyond reusing `isSecretPath` and `createRealTargetCheck` as today.
- Changing the plugin import-boundary configuration or adding a new module to its allow-list.
- Changing the remote-tab search path, which reaches the navigator through `searchText` and inherits the shared reader automatically.
