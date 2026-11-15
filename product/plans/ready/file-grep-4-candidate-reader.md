# Read only permitted regular grep candidates
**Complexity: 6/10** — ~95 added production lines, 12 reader/policy requirements and 36 path, byte-boundary and silent-failure scenarios (p=5.74351).

## Dependencies

Depends on: `product/plans/ready/file-grep-3-shared-primitives.md`, which exports `isSecretPath` unchanged. Source: `product/plans/complete/file-grep.md`, the unchanged canonical feature document archived by the decomposition.

## Goal and decisions

Add `src/file-grep/read-candidate.ts` for per-candidate reads that satisfy the source's never-follow-links and never-read-secrets promises. This implements the canonical feature's “Size and binary skips”, “Secret files” and “Symbolic links” decisions. Plan 5 owns the sole planned caller, the sequential scan. No existing reader or caller changes in this foundation.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Lexical secret predicate | `src/file-read/policy.ts:23`, `isSecretPath` | Import the export added by plan 3; preserve its native-separator, case-insensitive basename and complete-segment-run rules. |
| Cached real-target policy | `src/file-read/policy.ts:78`, `createRealTargetCheck` | Construct once with the canonical root; reuse its literal/resolved home-secret anchors and containment checks. Do not copy the deny table or anchor resolver. |
| Strict containment | `src/path-containment.ts:23`, `containedStrictly` | Reject paths resolving to the root or outside it; do not use string-prefix containment. |
| Search bounds | `src/search/types.ts:3`, `SEARCH_MAX_FILE_BYTES`; `src/search/types.ts:5`, `SEARCH_BINARY_PREFIX_BYTES` | Import the 2,097,152-byte cap and 8192-byte prefix. Do not use the file reader's 5 MB classifier. |
| Silent read failure model | `src/file-navigator/search-text.ts:14`, private `readCandidate` | Reuse the text-or-null convention only. That reader uses `stat`, follows links and slices decoded text, so it cannot be called or extracted unchanged here. |
| Once-per-operation policy precedent | `src/file-glob/walk.ts:144`, `walkGlob`, especially `secretCheck` initialization | Cache policy at reader creation as the glob walk does. Its link handling is unsuitable: glob can list allowed file links, whereas grep reads none. |
| Filesystem fixtures | `src/file-read/policy.test.ts:11`, `beforeEach` temporary roots; `src/file-read/policy.test.ts:108`, named-pipe case | Use temporary regular-file, link and FIFO fixtures with cleanup. Mock home resolution before invoking the factory. |

`checkLexicalPath` at `src/file-read/policy.ts:60` resolves home anchors on every call. Do not call it per candidate: use the exported pure predicate and one cached real-target check instead. Existing policy readers, glob, and the search tab stay unchanged. `listProjectFiles` at `src/file-navigator/search.ts:44` can return stale cached git paths beneath a directory replaced with a link; listing is not proof that a candidate is safe to open.

## Proposed changes

- Export the type `CandidateReader` and the async factory `createCandidateReader(root)` directly from `read-candidate.ts`. The factory accepts one root string and resolves to a `CandidateReader`. That reader accepts one root-relative path string and resolves to the complete text string or `null`. `null` is the only skipped sentinel; an empty string is a successful empty-file read. Plan 5 awaits the factory once per scan, then calls the returned reader for each path. It must not call a two-argument per-file factory or redeclare this type. There is no retained handle, worker, timer or disposal obligation.
- Canonicalize the supplied root once at factory creation and create one `createRealTargetCheck` closure for its home-secret anchors. All candidate filesystem work starts from that canonical root, allowing the supplied root itself to be a safe symlink alias. If root canonicalization or policy setup fails, resolve to a reader returning `null` for every candidate. Check the canonical root with the cached policy; a root within a literal or resolved home-secret anchor also returns no candidate contents. This applies without any `--path` value and with `--path .`; neither is an input to this reader.
- Reject absolute candidate paths, empty/root paths and normalized parent escapes before candidate filesystem I/O. Resolve safe relative dot segments beneath the canonical root, require strict containment, and derive the normalized native-separator relative path for `isSecretPath`. Reject lexical secrets before content reads. Run the cached real-target policy on the expected canonical-root-plus-relative path before candidate metadata as well, so a home-secret root cannot leak ordinary-looking children. Preserve plan 3's predicate semantics, including `.environment` and an ordinary child inside a directory named `.env` remaining eligible.
- Inspect each ancestor component beneath the canonical root with asynchronous `lstat`, from the root outward. Every ancestor must be a real directory, never a symlink. Stop on a link even if it points inside the root or to its own containing directory; do not allow a link merely because canonical path comparisons pass. Then use `lstat` on the final candidate and require a regular file. Skip final links regardless of target, including dangling links, and skip directories, FIFOs and other nonregular candidates without opening them. The canonical root's own alias is not a candidate ancestor.
- Before content I/O, resolve the candidate's canonical path, require exact equality with the expected path beneath the canonical root and pass that canonical path through the same cached real-target policy. Any mismatch, policy refusal or metadata error skips it. The component checks enforce the link rule; equality alone and final-file `lstat` alone are insufficient. This covers stale git candidates under replaced directories without changing listing or introducing a tree walker.
- Skip when final regular-file metadata reports more than `SEARCH_MAX_FILE_BYTES`; exactly 2,097,152 bytes remains eligible. Read accepted contents as bytes, test only byte offsets 0 through 8191 for NUL, then decode the complete contents as UTF-8. A NUL at offset 8192 or later does not trigger this skip. Return text unchanged, retaining CRLF, whitespace and later NULs for the matcher. No line splitting or binary encoding inference belongs here.
- Honor the source's byte-prefix promise explicitly. The existing search reader's decoded `text.slice` measures UTF-16 units and can see beyond the first 8192 bytes after multibyte text. For example, 4096 `é` characters followed by NUL place NUL at byte offset 8192: grep accepts this file. Do not copy that slice or change the search-tab reader in this plan.
- Every candidate `lstat`, `realpath` or content-read failure resolves to `null`, without a reason, diagnostic or rejection. A missing or unreadable candidate must leave the reader usable for the next sibling. Keep matching, row counts, ordering and scan deadlines in plan 5; rejected candidates contribute no rows there.

## Tests

Add colocated Vitest coverage in `src/file-grep/read-candidate.test.ts`, importing the factory/type directly from `./read-candidate.js`. Use real temporary filesystem fixtures for ordinary reads, size boundaries and links, and scoped filesystem mocks for deterministic failure paths. Mock `node:os` `homedir` to a temporary home before creating any reader, including ordinary cases, so policy initialization never probes actual user secret directories. Restore mocks and clean fixtures after each case.

- Ordinary nested UTF-8 text, empty text, `.environment`, and a normal child of a `.env` directory succeed with exact unmodified text. The first case includes CRLF and whitespace. Reuse one factory-produced reader for multiple relative paths to exercise its public shape.
- `.env`, nested `.env.local`, mixed-case `.ENV`, and a nested multi-segment deny run such as `.config/gh/hosts.yml` return `null`. Assert that content reads never occur for secret candidates.
- Empty candidate, `.`, an absolute candidate and a normalized parent escape all skip without candidate content reads. Use a sibling outside the root whose name shares the root's prefix for the escape fixture, catching prefix-based containment.
- A directory and a FIFO skip without opening. Exactly the size cap succeeds using non-NUL bytes; one byte over skips without reading. Avoid sparse zero-filled files for the exact-size case, which would be skipped by the independent binary rule.
- NUL at byte offset 0, NUL at 8191, NUL at 8192 after ASCII, and NUL at 8192 after 4096 `é` characters cover the prefix boundary and distinguish bytes from decoded string slicing. The first two skip; the latter two return the full decoded text including NUL.
- Final links to an ordinary file inside the root, a file outside it, and a missing target skip. Ancestor links pointing inside, outside, and to the containing directory also skip, with no content reads through any link. Pass a simulated stale tracked relative path directly to the reader after replacing its directory with a link; no git subprocess or listing changes are needed.
- A safe canonical root alias reads an ordinary child. Separately force candidate canonicalization to return a differing path and verify it skips before content reads.
- A disappeared candidate, rejected `lstat`, rejected candidate `realpath`, rejected content read and rejected root canonicalization all resolve to `null`. After each per-candidate failure, a safe sibling succeeds on the same reader. Mock permission errors rather than relying on host permission bits.
- A temporary workspace rooted below the mocked home's literal `.ssh` anchor yields no contents despite an ordinary candidate basename, with no `--path` argument involved. A second fixture makes a mocked home-secret entry a symlink to a temporary directory and roots the reader in that resolved directory: it also yields no contents without candidate reads. Neither fixture uses the user's real home.
- Observe factory root canonicalization and home-anchor initialization once, then read two ordinary candidates and verify neither is repeated per candidate. Candidate canonicalization remains per file; distinguish those paths when counting calls.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. During implementation confirm the new reader suite runs; if related-test selection misses it, run `npm run test:server -- src/file-grep/read-candidate.test.ts`. No full check is needed.

For a manual module-level smoke check, create a temporary root and mocked temporary home, await one `createCandidateReader`, then read an ordinary UTF-8 fixture, a secret fixture and a linked fixture with that same reader. Confirm exact text, `null`, `null`, and no content calls for the last two. Repeat with the multibyte byte-boundary fixture to confirm the later NUL survives in the returned text. Full `file grep` command execution becomes available in plan 12.

## Out of scope

No matcher, candidate listing, parallel reads, policy relaxation, following links, search-tab changes, public command route or help/spec edits. This resolves the source's stale claims that final-file `lstat` alone suffices and home checks can rely on an explicit `--path`; its observable exclusion requirements are unchanged. Concurrent malicious filesystem mutation hardening is not added here. Public behavior documentation remains with the later behavior-exposing plans and plan 17.

## Implementation constraints

Use direct `.js` imports in `src` and no re-export barrel. The only production addition is the new reader module; no existing production file grows. Keep it below 200 lint-counted lines and follow the type-aware/security rules in `eslint.config.mjs`; extract cohesive logic rather than compacting if needed. Tests are exempt from the line limit. No `npm run check`; use the diff-scoped development gate.
