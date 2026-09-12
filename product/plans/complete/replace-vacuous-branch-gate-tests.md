# Make the two vacuous branch-gate tests assert the behavior they name

**Complexity: 3/10** — two test cases rewritten in one file, one row added to an existing `it.each` table in another, and one fixture stub changed from a fixed value to one the test can flip. No production code changes. The number is not lower because one of the two replacements needs a second open to prove the flip took effect, which is the difference between the new case asserting something and repeating the old one's mistake.

Work item, verbatim: *"Replace the two branch-gate tests that assert nothing their neighbours do not already assert, so the coverage the pull request claims actually exists."*

In `src/open/file-manager.test.ts`'s `branch gate` block, the case named "never re-points an already-open synced tab; the decision is the navigator branch at open time" opens exactly one tab with the navigator reporting a feature branch and asserts only the path — a byte-for-byte weaker repeat of the feature-branch case above it, with no second open and no branch change. The case named "still routes a main-default repository sitting on main through the sync workspace" builds the same primary-navigator fixture as the first case and cannot observe a `main` default at all: the stub returns a fixed boolean and never reaches `isPrimaryBranch`. Both the plan's Tests section and the pull request description list these two behaviors as covered, so a later change that breaks the open-time decision or the `main`-default classification passes a green suite while a reader auditing coverage is told the cases exist.

## Design decisions

- **The open-time decision is proved by two opens, not one.** A single open cannot distinguish "decided at open time" from "decided once, ever". The replacement opens the file while the navigator reports primary, flips the stub to a feature branch, then opens the same file again — asserting the first tab is untouched *and* that the second open takes the ordinary-editor path. The second assertion is what proves the flip was effective, so the first assertion cannot pass vacuously.
- **The absence of a watcher can only be shown as an absence.** The first tab's `path` and `sync` staying put after the flip is the strongest available statement; there is no positive mechanism to assert against, because the mechanism is that nothing watches. The second open is what keeps that absence meaningful.
- **The fixture's navigator answer becomes late-bound.** `makeSyncedManagers`'s stub closes over a fixed value today. It gains the ability to take a getter instead, so a test can flip the answer between two calls. Every existing call site passes a plain value and is unchanged.
- **The `main`-default behavior belongs to the classifier, not the gate.** The file-manager stub short-circuits `isPrimaryBranch` entirely, so no test in that file can observe a `main` default. The assertion moves to `src/git/status.test.ts`'s `isPrimaryBranch` block, and the file-manager case is deleted rather than left as a duplicate of the first case.
- **The moved assertion is a new row, not a copy of an existing one.** The proposal names `['a main-default repository on main', 'main', 'main', true]` — but that table's first row is already `['an exact branch/default match', 'main', 'main', true]`, the same inputs and the same expectation. Adding it verbatim would recreate, in the destination, exactly the vacuity this work exists to remove. Instead the existing row is relabelled to name the `main`-default repository it already covers, and a genuinely absent case is added beside it: a `main`-default repository sitting on `master`, which is `false`. That is the consequence the deleted file-manager case was gesturing at and the one the table does not pin — that `master` is not primary by name once a default branch has actually been detected.

## Proposed changes

- `src/open/file-manager.test.ts`:
  - `makeSyncedManagers`'s `navigatorPrimary` parameter accepts a getter as well as a value, and the navigator stub's `onPrimaryBranch` resolves it per call.
  - The "never re-points an already-open synced tab" case is rewritten as described above: open on primary (asserting the tab resolves inside `/workspace`), flip, assert the first tab's `path` and `sync` are unchanged, and assert a second open of the same file produces an ordinary editor tab against the real file.
  - The "still routes a main-default repository sitting on main through the sync workspace" case is deleted.
- `src/git/status.test.ts`, the `isPrimaryBranch` `it.each` table: the `['main', 'main', true]` row is relabelled to name the `main`-default repository, and a `['main'-default repository on master, 'master', 'main', false]` row is added.

## Tests

The change *is* the tests. After it, the `branch gate` block holds: the primary-navigator route, the feature-branch route, the unloaded-navigator fallback, the out-of-project-navigator fallback, the below-launch-dir navigator, the non-config-listed path, the launch-dir `it.each`, and the rewritten open-time case — each asserting something no other case in the block asserts. The two pre-existing synced-path cases above the block, and the rest of `isPrimaryBranch`'s table, must keep passing untouched.

## Out of scope

- Any production code change. Both behaviors are already implemented correctly; only their coverage was fictional.
- Adding a branch-change watcher so the open-time decision could be asserted positively. The completed sync plan explicitly rules that out.
- The remaining cases in the `branch gate` block, which cover the routing and are left as they are.

## Verification

- `./scripts/run.mjs check-diff`
