# Correct the Hosts import/export description's stale test and runner anchors

**Complexity: 1/10** — no production code added or edited, no test scenarios, no new units (p=1.578); the fix is five stale citations in the pull request description plus plan and backlog bookkeeping.

## Goal

The pull request description cites line ranges that no longer prove the claims they support: two `activate.test.ts` lines are unrelated `sendSave` assertions, and two `ssh-intents.ts` lines are the symbol-link resolver rather than the catalog guard and its refusal message. A reader who follows those citations lands on wrong code and can conclude the import/export behavior is unverified. Re-anchor each claim to the cases and functions that actually pin it, and leave the author's every other description paragraph exactly as written.

## Requirements

1. "The description cites `src/plugins/hosts/activate.test.ts:836` and `:855` as proof that the new intents return `null`" — the replacement must name the two `hosts activation ssh intents` cases that send `import` and `export`, assert a null result, and pin a Hosts-tab notification.
2. "The description cites ... `:836` ... as proof ... that a command import notes the `; skipped 2.` summary" — the replacement must name the exact-summary assertion in `src/plugins/hosts/import-ssh.test.ts` instead of the unrelated save test.
3. "it also cites `src/plugins/hosts/ssh-intents.ts:38-48` and `:45-48` for the catalog and remote refusals, which are implemented in `isCatalogPath`, `catalogRefusal`, and `runSshIntent` further down the file" — the catalog-operand claim must cite `isCatalogPath`, and the catalog-refusal message claim must cite `catalogRefusal`.
4. "Point the claim that the two intents are registered with an empty payload and return null at the `hosts activation ssh intents` cases ... together with the `defineIntents` table in `src/plugins/hosts/activate.ts`" — the existing `defineIntents` citation stays, and the test citation names both intents cases.
5. "Change no source or test file; the import and export command cases ... keep passing untouched" — no file under `src/`, `web/src/`, or any test file is edited.
6. "copy every other paragraph byte for byte into `./temp/pr-body.md`" — only the cited strings change; every other paragraph, heading, code block, and the title stay byte-for-byte.
7. "apply the description edit with `gh pr edit --body-file` after the branch commit is pushed" — the body is staged in `./temp/pr-body.md` during the fix but applied only after a successful push.
8. "Confirm the pull request stays open on its head branch and that its head matches the pushed commit." — the pull request remains OPEN, unmerged, with `headRefOid` equal to the pushed `HEAD`.

## Design decisions

- Each stale citation is replaced in place; no sentence is rewritten around it. That keeps the change inside the four strings the work item names and preserves the author's prose.
- The two intents cases are named by their `it(...)` titles and their lines, `imports from ~/.ssh/config, publishes once, notifies the Hosts tab, and returns null` at `activate.test.ts:878` and `exports without publishing or changing the payload, notifying the Hosts tab` at `:898`, so a reader can find the null assertions and the Hosts-tab notification directly.
- The skipped-summary claim cites `import-ssh.test.ts:74`, the exact `summary: 'Imported 1 host from ~/.ssh/config; skipped 2.'` assertion, alongside the two intents cases that pin the Hosts-tab notification.
- The catalog claims cite the function that owns the guard, `isCatalogPath` at `ssh-intents.ts:52-57`, and its call in `runSshIntent` at `:95-98`; the refusal message cites `catalogRefusal` at `:59-62`. Those are the real implementations, not the `realPath` symbol-link loop at `:30-49`.
- `defineIntents` at `activate.ts:165-172` and `catalogPaths` at `hosts-file.ts:87-95` are already correct citations; they are not touched.
- `gh pr edit` replaces the body wholesale, so the complete revised body is written to `./temp/pr-body.md` with only the named citations changed. `temp/` is gitignored, so the scratch file never reaches a commit.
- The body edit lands after the push. If checks, commit, or push fail, the pull request still carries the author's original description rather than describing work that is not on its branch.
- The resolved backlog entry is removed and the plan is promoted to `complete/`, so a description-only fix still produces a commit for `pr-check-changes` to ship.
- The pull request title is not touched.

## Preserved behavior

1. Both import and export intents keep returning `null` and notifying the Hosts tab; they must not start returning a value or noting into the originating transcript instead. The existing test `imports from ~/.ssh/config, publishes once, notifies the Hosts tab, and returns null` in `src/plugins/hosts/activate.test.ts:878` pins this behavior.
2. The import summary keeps the exact `; skipped 2.` wording when aliases are skipped; it must not lose the clause or change its spelling. The existing assertion `summary: 'Imported 1 host from ~/.ssh/config; skipped 2.'` in `src/plugins/hosts/import-ssh.test.ts:74` pins this behavior.
3. A saved-host catalog path keeps being refused as an import source and an export target with the exact catalog-role message; it must not be read or written. The existing test `refuses an export aimed at the home catalog without touching either catalog` in `src/plugins/hosts/activate.test.ts:421` pins this behavior.

## Assumptions

1. `src/plugins/hosts/activate.test.ts:836` holds `expect(result).toEqual({` inside `returns the unusable-file diagnostic inline and attributes its warning`, a `sendSave` case about an unusable catalog, not about ssh intents.
2. `src/plugins/hosts/activate.test.ts:855` holds `expect(f.updated).toEqual([]);` inside `returns the write-failure diagnostic inline and leaves the file untouched`, another `sendSave` case.
3. `src/plugins/hosts/activate.test.ts:878` and `:898` hold the two `hosts activation ssh intents` cases, each asserting a null result and a Hosts-tab notification.
4. `src/plugins/hosts/import-ssh.test.ts:74` holds `summary: 'Imported 1 host from ~/.ssh/config; skipped 2.',`, the exact-summary assertion.
5. `src/plugins/hosts/ssh-intents.ts:52-57` holds `function isCatalogPath(`, `:59-62` holds `function catalogRefusal(`, and `:95-98` holds the `isCatalogPath(target.path, root, home)` call in `runSshIntent`; `:38-48` and `:45-48` hold the `realPath` ENOENT and `readlinkSync` branches.
6. `product/backlog/pull-request.md:5` holds the sole recorded work item, whose `Proposal:` at `:13` names this exact invocation, so the invocation selector matches a recorded entry.
7. The pull request body fetched with `gh pr view <reference> --json body` contains the four named stale citations at the positions recorded in `./temp/pr-body.md`.
8. `product/backlog/pull-request.md:1-3` is the comment-and-heading skeleton the file must be restored to once its only entry is removed.

## Existing functionality

1. `src/plugins/hosts/activate.test.ts:877` provides the `describe('hosts activation ssh intents', ...)` evidence the replacement cites, with the quoted identifier `hosts activation ssh intents`.
2. `src/plugins/hosts/import-ssh.test.ts:74` provides the exact-summary evidence, with the quoted fragment `summary: 'Imported 1 host from ~/.ssh/config; skipped 2.'`.
3. `src/plugins/hosts/ssh-intents.ts:52` provides the catalog-guard evidence, with the quoted identifier `isCatalogPath`.
4. `src/plugins/hosts/ssh-intents.ts:59` provides the refusal-message evidence, with the quoted identifier `catalogRefusal`.
5. `src/plugins/hosts/ssh-intents.ts:79` provides the shared-runner call site, with the quoted identifier `runSshIntent`.
6. `ai/tasks/feature/work-pull-request-issue.md:148` provides the multi-line body edit route, the quoted command `gh pr edit <reference> --body-file ./temp/pr-body.md`, which avoids shell quoting problems with markdown.
7. `product/backlog/pull-request.md:1-3` provides the comment-and-heading skeleton that the file is restored to once its only entry is removed.

## Implementation steps

1. Read the pull request body with `gh pr view <reference> --json body` into `./temp/pr-body.md`, confirm the four named stale citations are still at their recorded positions, and confirm the replacement anchors at `activate.test.ts:878,898`, `import-ssh.test.ts:74`, and `ssh-intents.ts:52-57,59-62,95-98` describe the claims they will pin. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Replace the five citation occurrences in `./temp/pr-body.md` in place: `:836,855` and `:836` in `activate.test.ts` with the two named intents cases plus the exact-summary assertion, `:38-48` and `:38-48,81-84` in `ssh-intents.ts` with `isCatalogPath` and its `runSshIntent` call, and `:45-48` with `catalogRefusal`. Do not call `gh pr edit` yet, and change no source or test file. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Move the finished plan from `./product/plans/ready/` to `./product/plans/complete/`, remove the resolved entry whole from `./product/backlog/pull-request.md`, and restore that file to the master comment-and-heading skeleton because the entry was its only one. Use plain `mv` for the plan. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Confirm with `git status` and `git diff` that the only tracked changes are the completed plan and the emptied pull-request backlog, with no source, test, spec, help, or documentation file touched. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Commit the file changes with a Conventional Commit subject describing the description correction, push to the same head branch, and only then apply the staged body with `gh pr edit <reference> --body-file ./temp/pr-body.md`. Confirm the pull request is still `OPEN` and its `headRefOid` matches `git rev-parse HEAD`. Build command: `$janissary/scripts/run.mjs check-diff` after each file change; the body edit changes GitHub state, not the tree.

## User interface

1. None. This change edits pull-request prose and two product-planning files; it adds or changes no surface a user sees or operates inside the app, and no application behavior is modified.

## Tests

This plan changes no application behavior and introduces no code, so no new tests are written. The cases the description points to already cover the claims: the two `hosts activation ssh intents` cases (`src/plugins/hosts/activate.test.ts:878,898`) cover requirement 1, the exact-summary assertion (`src/plugins/hosts/import-ssh.test.ts:74`) covers requirement 2, and the catalog guard and refusal (`src/plugins/hosts/ssh-intents.ts:52-57,59-62`) with the refusal case at `activate.test.ts:421` cover requirement 3. Requirements 4 through 8 are prose and bookkeeping work with no test surface; `$janissary/scripts/run.mjs check-diff` is the check for them.

## Out of scope

- Every description paragraph other than the five named citations, including the `### Screenshots`, `### Behavior examples`, and `### How to verify` sections.
- The pull request title.
- Source code, tests, CSS, functional specs, help pages, and both `documentation/user-documentation/` and `documentation/developer-documentation/`.
- `product/backlog/issues.md` and any new backlog entry for the named work item, which was already recorded on this branch.
- Merging, closing, or replacing the pull request, and rewriting any published commit.

## Verification

`$janissary/scripts/run.mjs check-diff` — expected green after every file change; with no source under `src/` or `web/src/` changed, it checks only the touched files and reports no lint, typecheck, or test regression.

Manual, reading-based: run `gh pr view <reference> --json body` and confirm the two intents claim cites the `hosts activation ssh intents` cases at `src/plugins/hosts/activate.test.ts:878,898` with the `defineIntents` table at `activate.ts:165-172` still cited, the skipped-note claim cites `src/plugins/hosts/import-ssh.test.ts:74`, the catalog guard claim cites `isCatalogPath` at `ssh-intents.ts:52-57`, and the catalog refusal message cites `catalogRefusal` at `:59-62`. Confirm no `activate.test.ts:836` or `:855` and no `ssh-intents.ts:38-48` or `:45-48` citation remains. Read every other paragraph, the code blocks, and the title and confirm they are byte-for-byte what the author wrote. A failure is any other text rewritten, a missing function or case name, or a body edit applied before the push.
