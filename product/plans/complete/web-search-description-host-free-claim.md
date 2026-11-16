# Correct the pull request description's host-free claim about the web-search directory

**Complexity: 1/10** — a one-sentence PR description correction with no production files, lines, new units, or tests (p=2.07).

## Goal

The body of PR #2010 must state the actual boundary of the new `src/web-search/` feature directory: its search core stays free of tabs, ACP, and the remote channel, while one small tab-adapter module chooses the local or remote side and posts the local disabled-provider notification.

## Issue

Recorded on PR #2010's branch backlog, severity 2/10:

> Correct the pull request description's claim that the new web-search feature directory knows nothing about tabs or the remote channel, which the new tab adapter contradicts.

The paragraph that introduces the directory says:

> It adds a new `src/web-search/` feature directory that knows nothing about tabs, ACP, or the remote channel, and wires it into registries that already exist: the command registry, the native ACP vocabulary and tool table (as a `runsOn: 'workspace'` tool, like `file read`), the command-bar completion chain, and the remote filesystem operations.

The first clause is false for the directory as a whole. `src/web-search/tab-search.ts` imports the `Managers` type, `localReadRoot`, `withRemoteTabPort`, and `notify`, and chooses between a local search and the tab's remote port.

Verified against the code:

- `src/web-search/search.ts` imports only the `ProjectTokens` type and other `./` web-search modules. It knows nothing about tabs, ACP, or the remote channel.
- `src/web-search/tab-search.ts` is the only module in the directory that imports `../managers.js`, `../file-read/tab-read.js`, `../file-read/remote-tab-port.js`, or `../notifications/index.js`. It parses first, uses `localReadRoot(managers, label)` to pick the side, calls `webSearch` locally with `getProjectTokens()`, the global `fetch`, the signal, and a `reportDisabled` that posts the `plugin-failure` notification through `notify`, and otherwise sends the `web-search` operation through `withRemoteTabPort`.
- A search of `src/web-search/` for `withRemoteTabPort`, `localReadRoot`, or `notify(` finds them only in `tab-search.ts` and its test. Every other cross-directory import in the directory is host-agnostic: `../positive-integer.js`, `../error-text.js`, `../value-guards.js`, `../models/providers/result.js`, and the `ProjectTokens` type.
- The design plan records the same split: `./product/plans/complete/web-search.md` names `tab-search.ts` as the module shaped like `globFilesInTab`, and `./product/plans/complete/web-search-10-typed-command.md` says it "is the only `src/web-search/` module that knows about tabs; `search.ts` stays host-free."

## Approach

1. After the commit is pushed, read the current body verbatim with `gh pr view <reference> --json body`.
2. Replace only the sentence that introduces `src/web-search/` with a single corrected sentence that names both halves of the boundary: the search core stays free of tabs, ACP, and the remote channel, and one small tab-adapter module chooses the local or remote side and posts the local disabled-provider notification.
3. Keep the rest of that sentence's registry list, and every other paragraph, byte-for-byte as written.
4. Write the complete revised body to `./temp/pr-body.md` and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Do not touch the title.
5. Re-read the applied body and compare it to the original to confirm the single sentence is the only difference.

## Design decisions

- **Name both halves of the boundary.** Saying the directory "knows nothing about tabs" is the defect. The correction must state that one module does know about them, so a reviewer cannot take the claim as a directory-wide invariant.
- **Keep the entry's two jobs for the tab adapter.** It chooses the local or remote side and posts the local disabled-provider notification. Both are real work in `tab-search.ts`, and both are host-side concerns the core does not carry.
- **Rewrite one sentence, not the paragraph.** The entry names the sentence that introduces the directory, and the registry list that follows in the same sentence is accurate. Keeping it preserves the author's explanation of how the feature is wired in.
- **No change to the same overclaim in the plans.** `./product/plans/complete/web-search.md` and `./product/plans/complete/web-search-6-search-core.md` use similar language about the search core, which is accurate for `search.ts`. The recorded work is the pull request description, and the completed plans are out of scope.
- **No source, test, spec, or help change.** The behavior already matches the corrected sentence. `./product/specs/web-search.md` describes the actual routing and notification behavior without making the directory-boundary claim, and `tab-search.test.ts` pins the local-versus-remote choice.
- **Apply the description only after the push.** A description is live on GitHub while a file edit is not, so correcting it earlier would leave the PR describing work that is not on its branch if a later step failed.

## Proposed changes

Only the PR body changes. Its sentence:

```markdown
It adds a new `src/web-search/` feature directory that knows nothing about tabs, ACP, or the remote channel, and wires it into registries that already exist: the command registry, the native ACP vocabulary and tool table (as a `runsOn: 'workspace'` tool, like `file read`), the command-bar completion chain, and the remote filesystem operations.
```

becomes:

```markdown
It adds a new `src/web-search/` feature directory whose search core stays free of tabs, ACP, and the remote channel, while one small tab-adapter module chooses the local or remote side and posts the local disabled-provider notification, and it wires that feature into registries that already exist: the command registry, the native ACP vocabulary and tool table (as a `runsOn: 'workspace'` tool, like `file read`), the command-bar completion chain, and the remote filesystem operations.
```

No source, test, config, spec, help, or documentation file changes. This run also adds this plan file and removes the resolved entry from `./product/backlog/pull-request.md`.

## Tests

No automated test covers pull request prose, and this fix changes no code. The existing tests must keep passing unchanged through `$janissary/scripts/run.mjs check-diff`:

- `src/web-search/tab-search.test.ts` — the local case proves a local search uses the local path and posts the disabled-provider notification, and the remote case proves the `web-search` operation is sent for a remote tab.
- `src/web-search/search.test.ts` — the core cases prove `search.ts` runs with injected tokens, `fetch`, and signal, with no tab knowledge.

Verify the corrected text by reading:

- The sentence says the search core stays free of tabs, ACP, and the remote channel.
- The sentence says one small tab-adapter module chooses the local or remote side.
- The sentence says that module posts the local disabled-provider notification.
- The registry list and every other paragraph are byte-for-byte unchanged, and the title is untouched.

## Verification

- `$janissary/scripts/run.mjs check-diff` (description-only; no source or test change).
- Re-read the sentence beside `src/web-search/search.ts` and `src/web-search/tab-search.ts`.
- Search `src/web-search/` for `withRemoteTabPort`, `localReadRoot`, and `notify(` to confirm `tab-search.ts` is still the only module that knows about tabs.
- After applying the body, compare it with the previous body to confirm only the one sentence differs.
- Confirm the PR is still open and its `headRefOid` matches `git rev-parse HEAD`.

## Spec

No `./product/specs/` update. `./product/specs/web-search.md` already describes the actual behavior in "Where a typed search runs" and "Disabled providers" and makes no claim about what the feature directory knows. This fix corrects PR prose, not behavior.

## Out of scope

- Changing `src/web-search/search.ts`, `src/web-search/tab-search.ts`, or any other source file.
- Adding or changing tests.
- Updating `./product/specs/web-search.md`, `./help/web.md`, or `./documentation/`.
- Rewording `./product/plans/complete/web-search.md` or the completed subplans that use similar search-core language.
- Any other paragraph of the PR description, and the PR title.
- Other backlog entries on the branch.
- Rebasing, merging, or resolving the branch's conflict with `master`.

## Rating basis

lines_added=0, files_edited=0, requirements=1, scenarios=0, new_units=0. Production counts are zero because the only edited artifact is the pull request description; the single requirement is that the sentence state the actual directory boundary. p = 1.578 + 0.705·ln(2) = 2.07, under the 3.461 threshold for 1.
