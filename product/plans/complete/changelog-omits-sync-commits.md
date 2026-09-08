# Leave git-sync commits out of the changelog section a release writes

**Complexity: 3/10** — one script's changelog generation gains a second omission rule, and the categorization is extracted into a small pure module so it can be tested without cutting a release. No application source changes, no wire protocol, nothing a user of the app can observe. The one judgment call is whether the sync entries already sitting in `CHANGELOG.md` come out too, and they do — they are the same defect's output, and leaving them would have the file contradict what the script now produces.

`changelogSection` in `scripts/release.mjs` reads every non-merge commit subject since the last tag and sorts it into `feat`, `fix`, `docs`, `refactor`, `chore`, or `other`. It skips exactly one kind of commit on the way:

```js
for (const line of lines) {
  if (isReleaseCommit(line)) continue;
  const match = line.match(/^(\w+)(?:\(.+?\))?!?:\s(.+)$/);
```

Every save of a synced backlog or spec file through an editor tab commits `sync: <filename>` (`src/git/sync.ts`, `commitIfChanged`). `sync` is not a category the script knows, so each one lands in `other` and is printed verbatim. There are hundreds of them between tags, and the result is a changelog whose Other section is a wall of repeats:

```
### Other

- sync: features.md
- sync: technical-debt.md
- sync: documentation.md
- sync: features.md
- test(lint-boundaries): pay the ESLint cold start in a hook (#912)
- test(file-navigator): cover paste replay branches (#906)
- sync: issues.md
- sync: issues.md
```

That is the 0.12.0 section. Of the 74 entries under its Other heading, 66 are `sync:` lines, and the two `test(...)` commits a reader actually wants are buried between them. Across the whole file 153 entries are sync commits, and two sections — 0.10.1 and 0.10.0 — have an Other heading whose every entry is one.

## Goal

A changelog section written by `scripts/release.mjs` reports no `sync:` commit, in any category, and omits the Other heading altogether when sync commits were all it would have held. The sync entries already in `CHANGELOG.md` are removed, along with the two headings left empty by their removal.

## Design decisions

**Drop sync commits the way release commits are already dropped, not by adding a category for them.** A `Sync` heading would be a shorter wall in the same place. These commits record that a file was saved, not that anything about the product changed — they belong outside the changelog entirely, which is exactly the judgment `isReleaseCommit` already encodes for version bumps. One predicate joins another.

**Match the conventional-commit type, not the word.** `/^sync(\(.+?\))?!?:\s/i` matches the `sync: <filename>` subject `src/git/sync.ts` writes, plus any scoped or breaking variant of the same type, and nothing else. A subject that merely mentions syncing — `feat(git-sync): share one workspace clone`, `fix: report asynchronous profile failures` — keeps its own type and stays in the changelog. This mirrors how `isReleaseCommit` anchors on the subject's shape rather than searching it.

**Filter once, then categorize and scan for breaking changes.** Today the breaking-changes list is built from the unfiltered subject lines while the category loop skips release commits, so the two disagree about what the release contains. Deriving both from one filtered list closes that gap and is what makes the omission actually total: a `sync:` subject that happened to carry a `BREAKING CHANGE` trailer would otherwise still surface.

**Extract the categorization, keep the choreography.** `release.mjs` runs its work at import time — it validates the branch, prompts, commits and tags as top-level statements — so nothing in it can be imported by a test. Moving the pure part into `scripts/release/changelog.mjs` makes the part worth testing importable, and leaves the `git log` capture, the dry-run preview and the file write in the script. This is the seam `ai/guidelines/architecture-principles.md` §4 asks for, the layout `scripts/release/version-files.mjs` already established, and it takes `release.mjs` from 212 lines to about 160.

**The extracted function takes subjects, not a git range.** `changelogSection(version, date, subjects)` receives the array of commit subjects and returns markdown. The caller runs `git log`. A test can then state a commit history as a list of strings, with no repository to build and no `git` to stub.

**Clean the existing file with a one-off script, not by hand.** 153 line removals across eleven sections is not an edit to make by eye. A throwaway script in the scratchpad does it, and the result is verified by re-grepping the file for `- sync: ` and diffing the line count against what was removed. The script is not committed — it runs once and describes no ongoing behavior.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The omission predicate shape to copy | `isReleaseCommit` in `scripts/release.mjs` |
| The subject the filter has to catch | `` `sync: ${filename}` `` in `src/git/sync.ts` |
| Runner-at-top / modules-in-a-sibling-directory layout with colocated `.test.mjs` | `scripts/release/version-files.mjs` and its test |
| `scripts/**/*.test.mjs` in the `server` vitest project | `vitest.config.ts` |
| `scripts/` changes trigger `test:server` | `scripts/check-diff.mjs` |

## Implementation steps

1. **New module `scripts/release/changelog.mjs`.** Exports:
   - `isReleaseCommit(subject)` — moved verbatim from `release.mjs`.
   - `isSyncCommit(subject)` — true for a subject whose conventional-commit type is `sync`.
   - `isOmittedCommit(subject)` — either of the above; the single question the section builder asks.
   - `changelogSection(version, date, subjects)` — filters `subjects` through `isOmittedCommit`, then builds the `## [<version>] - <date>` section from what remains: the breaking-changes list, then each non-empty category in `feat`, `fix`, `docs`, `refactor`, `chore`, `other` order. A category with no entries emits no heading, which is what drops an all-sync Other section.

2. **`scripts/release.mjs`: capture the log, delegate the formatting.** Delete `changelogSection` and `isReleaseCommit` from the script and import `changelogSection` from the new module. `updateChangelog` runs the `git log --no-merges --format=%s <range>` capture that `changelogSection` used to run, splits it into subjects, and passes them in. `lastTag` stays — it is what builds the range.

3. **Strip the sync entries already in `CHANGELOG.md`.** Remove every `- sync: <filename>` line, and remove any `### Other` heading (with its following blank line) whose entries were all sync lines — the 0.10.1 and 0.10.0 sections. Every other line of the file, including its version headings and the blank line before each one, stays byte-for-byte as it was.

## Tests

`scripts/release/changelog.test.mjs` — new file, vitest, matching the plain `describe`/`it`/`expect` style of `scripts/release/version-files.test.mjs`:

`isSyncCommit`

- recognizes the `sync: <filename>` subject the editor's save cycle writes.
- recognizes a scoped or breaking variant of the same type.
- rejects a subject whose scope merely names the sync feature (`feat(git-sync): …`).
- rejects a subject that only contains the word (`fix: report asynchronous profile failures`).

`changelogSection`

- leaves sync commits out of the Other section, keeping the real entries that sat among them.
- omits the Other heading entirely when sync commits were all it would have held.
- still omits the release bump commit, and omits it alongside sync commits in the same history.
- keeps a `sync:` subject out of the Breaking Changes list even when it carries a `BREAKING CHANGE` trailer.
- writes the `## [<version>] - <date>` heading and the categories in Features, Bug Fixes, Documentation, Refactoring, Chores, Other order.
- files a subject with an unrecognized type under Other, verbatim.
- returns just the heading for a history that is nothing but omitted commits.

## Spec and documentation

- `product/specs/release.md` — the sentence naming what the changelog section leaves out ("Earlier version-bump commits are left out of it.") names the sync commits too, and says an emptied category prints no heading.
- `documentation/developer-documentation/release-process.md` — its step 3 ("Generates the changelog section from conventional commits since the last tag, categorized by type") describes what reaches the changelog and is now incomplete; it names the two kinds of commit that do not.

## Out of scope

- **The git-sync commit subject itself.** `sync: <filename>` is the message `product/specs/editor-tab.md` documents and other tooling may key on. The changelog decides what to print; it does not get to rename what it reads.
- **The rest of the changelog's noise.** Several sections carry entries with no issue number or an uninformative subject. Those are real commits and stay.
- **`scripts/publish.mjs`.** It reads the version and pushes a tag; nothing it does touches the changelog.
- **Retagging past releases.** The tags already cut point at commits whose `CHANGELOG.md` had the sync lines in it. This change edits the file on `master` and does not rewrite history.
