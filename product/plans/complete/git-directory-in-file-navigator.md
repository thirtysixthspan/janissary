# Show .git as a directory in the file navigator

**Complexity: 2/10** — remove one name from a hardcoded exclude set, plus updating the one test that currently asserts the opposite and the spec line describing default excludes.

## Goal

The file navigator tree currently drops `.git` entirely (`src/file-navigator/index.ts:7`, `EXCLUDES`), alongside `.svn`, `.hg`, `.DS_Store`, and `Thumbs.db`. It should show up like any other directory — expandable, sorted with the other directories — while the other VS Code default excludes stay hidden.

## Approach

`readDirSorted` (`src/file-navigator/index.ts:15-29`) is the single point where directory entries are read and filtered for the navigator tree; `EXCLUDES` there is a plain `Set<string>` matched against `dirent.name`. Removing `'.git'` from that set is sufficient — everything downstream (`buildRows`, sort order, drag/drop's `hasNameConflict`) already treats any non-excluded entry uniformly, so `.git` will sort and render as a normal directory with no other code change.

The fuzzy-search walker's separate `EXCLUDES` copy in `src/file-navigator/search.ts:9` stays as-is: `.git`'s internal object/pack contents aren't meaningful search results, and that walker's own comment already notes it mirrors `index.ts`'s set for the *default-excludes* policy generally, not specifically that the two sets must always be identical. Its comment needs a small update since the two sets are no longer identical.

## Implementation steps

1. **`src/file-navigator/index.ts`** — remove `'.git'` from `EXCLUDES` (line 7), updating the comment above it to note `.git` is intentionally shown (unlike the other VS Code default excludes) so a future reader doesn't "fix" it back.
2. **`src/file-navigator/search.ts`** — update the comment at line 8 (currently "matching the sync walk in `file-navigator/index.ts`") since the two sets now differ: search still excludes `.git` from its walk/index, the navigator tree does not.

## Tests

- **`src/file-navigator/index.test.ts`** — the existing test `'excludes .git, .DS_Store, and other VS Code default excludes'` (line 24) currently asserts `.git` is absent; split it:
  - Rename/rewrite to `'excludes .DS_Store and other VS Code default excludes, but not .git'`: create `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db`, and `keep.txt`; assert the listing contains `.git` (as a directory) and `keep.txt`, but none of the other four.
  - Add an explicit assertion that the `.git` entry's `dir` flag is `true` (mirrors the existing symlink test's shape at line 36-42), directly covering "shows up as a directory."

No change needed in `search.test.ts` — that suite's `.git`-exclusion coverage is about the search index, which is out of scope for this fix.

## Spec

Update `product/specs/file-navigator-tab.md`, "Tree contents" section (~line 86): change "Default excludes: `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db`" to drop `.git` from that list and note it is shown like any other directory (alongside the existing "every other dotfile is shown" sentence).

## Out of scope

- Any change to the fuzzy-search index (`search.ts`) — `.git`'s contents remain unsearched.
- Special-casing `.git`'s *contents* (still shown/browsable like any other directory's children once expanded — no filtering inside it).
