# Refuse case-folding aliases of protected folders in file write and edit
**Complexity: 3/10** — ~10 added lines, 2 files, 4 requirements, 7 scenarios (p=4.50)

## Goal

On a case-insensitive APFS volume, a path such as `.janiſſary/roles.json` (U+017F LONG S) names the real `.janissary/roles.json`, yet it passes `checkProtectedPath`, because segments are compared with plain `toLowerCase()`, and it passes the real-path checks, because `src/file-write/target.ts` resolves with JavaScript `realpathSync`, which keeps the caller's spelling. `file write` and `file edit` can therefore replace the role grants, command settings, system schedules or runscripts under `.janissary`, or git config and hooks under `.git`. Refuse every such alias as `Protected file` before any folder is created or any byte is written, without weakening any existing containment, secret, symlink or trailing-segment check.

## Approach

Two layers:

- Lexical (defense in depth, and the only layer when the aliased folder does not exist yet): in `src/file-read/policy.ts`, `checkProtectedPath` compares each segment as `segment.normalize('NFKC').toLowerCase()` through one private fold helper. NFKC maps U+017F to `s` and the Kelvin sign to `K`, so the long-s and Kelvin spellings fold to `.janissary`, and a missing `.janiſſary` folder that `createTargetParents` would otherwise create (and a case-insensitive volume would later treat as `.janissary`) is refused up front. Keep the existing comment that the reader never calls it.
- Canonical names: in `src/file-write/target.ts`, resolve every real ancestor, symlink target, the root, and the recheck parent with `realpathSync.native`, which returns the on-disk spelling. `findAncestor`, `followSymlink`, `resolveRoot`, `recheckDestination`, and the parent resolution in `danglingEntryRefusal` all switch to one shared `realPath` alias of `realpathSync.native`, so `checkMutablePath` (containment, secret and protected checks) compares canonical names and the root stays comparable with every path resolved under it. `realpathSync.native` reports the same `ENOENT`, `ENOTDIR` and `ELOOP` codes, so the existing `hasCode`/`fileOperationReason` branches and the `followSymlink` dangling fallback behave as before.
- `isSecretPath`, `checkLexicalPath`, `checkRealTarget` and the reader stay unchanged; the secret checks on resolved paths gain canonical names through the target resolution alone.

## Implementation steps

1. Add the fold helper and use it in `checkProtectedPath`.
2. Switch the five resolution sites in `target.ts` to `realpathSync.native`.

## Tests

- `src/file-read/policy.test.ts`: `checkProtectedPath` refuses `.janiſſary/roles.json`, `.janiſsary/commands.json`, an upper-case long-s spelling, and a fullwidth-letter `.git` spelling built with `String.fromCodePoint`; `.github/workflows/ci.yml` and `.gitignore` stay allowed (existing case).
- `src/file-write/target.test.ts`: on a case-insensitive temp volume (detected by probing whether an upper-cased spelling of a created entry exists; skipped otherwise), a target whose aliased ancestor is an existing folder spelled differently from the request resolves to the on-disk spelling; with an existing `.janissary/roles.json`, the long-s request is refused as `Protected file` and creates no folder.
- `src/file-write/filesystem.test.ts`: a write to the long-s spelling of an existing `.janissary/roles.json` is refused as `Protected file`, leaves the file byte-identical, and creates no `.janiſſary` folder (runs on any volume: the lexical layer refuses it).
- Existing protected-directory, symlink, dangling-link, containment and trailing-segment tests in `target.test.ts`, `filesystem.test.ts`, `edit.test.ts` and `src/remote/serve-file-navigator.test.ts` keep passing unchanged.

## Specs and docs

- `help/file.md`: the `Protected file` bullet also covers case-folding and compatibility spellings of the folder names.
- `product/specs/acp.md`: the matching clause in the typed file writes and edits paragraph says the same.

## Out of scope

- `file read` behavior and `isSecretPath` folding.
- Filesystems that fold characters that NFKC plus lowercasing does not map; the canonical-name layer covers existing folders there.
