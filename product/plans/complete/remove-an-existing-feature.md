# A task file for removing an existing feature

**Complexity: 3/10** — one new prose task file and one spec section, with no application code, test, or config change; every mechanism it drives already exists (`plan-a-new-feature.md`'s questioning, `remove-deadcode.md`'s Knip handling, the start, stop, and PR workspace tasks). The number comes from what a run has to get right on any project: ordering the clean-tree and baseline gates before the questions, scoping dead code against a baseline, and reverting cleanly on a late stop.

Janissary has task files for adding things (`plan-a-new-feature.md`, `build-a-feature.md`) and for clearing dead code a tool can find (`hygiene/remove-deadcode.md`), but nothing for taking a whole working feature out on purpose. Removing a feature by hand means finding every piece of it: its code, its tests, its spec, its user and developer documentation, its help text, and the places other features lean on it. Miss one and the product either breaks somewhere unrelated or carries dead code and stale docs that describe behavior that no longer exists. This adds a new task file, `remove-an-existing-feature.md`, that removes all of a named feature's code, tests, specs, and documentation, detaches it from the features that touch it without breaking them, verifies the remaining features still work, and makes sure no dead code is left behind.

## Design decisions

Settled by the feature request and by existing behavior:

**It removes everything belonging to the feature.** Code, tests, specs, and documentation all go. The feature request names all four. A spec or documentation page that describes only the removed feature is deleted; one that also describes something that stays has only the feature's sections removed. Deleting a page also means removing every link to it: `[[name]]` cross-references in other specs, links in other documentation pages, and on Janissary its entry in the `sidebar` of `documentation/.vitepress/config.mts`. Screenshots and other assets that only a deleted page used are deleted with it, along with any screenshot definition that produced them (on Janissary, the shot's entry in `scripts/docs-screenshots/manifest.mjs`, such as the one named `task-picker`).

**It detaches the feature from other features without breaking them.** Where another feature calls into, renders, routes to, or documents the removed one, the task changes that feature only as far as needed to keep it working without the removed one.

**It verifies the remaining features still work.** Removal is not done until the rest of the product is shown to still work.

**It leaves no dead code behind.** Code that only the removed feature used goes with it. The repository already has a dead-code scan, `npm run knip`, which reports unused files, exports, types, and dependencies across `src/` and `web/src/` (`documentation/developer-documentation/dead-code.md`).

**It asks the user questions to settle the scope of the removal.** Like `plan-a-new-feature.md`, which asks about the boundary of a new feature, this task asks clarifying questions to decide what has to be removed and what has to stay so that every other feature keeps working uninterrupted. It is an interactive task, not an unattended one.

Settled with the user:

**It lives at `ai/tasks/remove-an-existing-feature.md`**, at the top level beside `plan-a-new-feature.md`, `build-a-feature.md`, and `fix-a-bug.md`. It is a deliberate product change the user asks for, not a hygiene sweep, so it does not go under `ai/tasks/hygiene/`. It ships as a built-in Janissary task, so the task picker offers it on any project, and on Janissary's own workspace as a project task.

**The user names the feature at invocation.** The argument is free text: a spec name (`image-tab`), a command name (`schedule`), or a description (`the audio player`), e.g. `execute ai/tasks/remove-an-existing-feature.md "the audio player"`. No backlog file is read for it. If nothing is named, the task's first question asks which feature to remove.

**An unmatched or ambiguous name becomes the first question.** The task searches the project's specs, command definitions, and documentation for the named text. When it matches more than one thing (`search` could be the search tab or transcript search), the first question lists the closest candidates, each with a one-line description, and the user picks one. When it matches nothing, the task says so, offers the closest candidates it did find, and asks the user to pick one or describe the feature differently. The run never guesses which feature was meant.

**Part of a feature can be removed through the same flow.** The named target may be a whole feature or a part of one: a subcommand, a flag, an option, one tab action. The scope questions settle where the boundary falls, and the part that stays counts as a remaining feature, so it is verified like any other.

**One run settles the scope, removes the feature, and opens a pull request.** Like `fix-a-bug.md`, the task questions the user, records the removal as a plan, carries the removal out, verifies it, and opens a PR through `ai/tasks/workspace/open-feature-pull-request.md`. Merging stays with the human. It never merges.

**Scope is settled in decision-tree rounds.** The task reuses `plan-a-new-feature.md`'s questioning mechanism unchanged: it models every open scope decision as a node in a decision tree, asks every decision whose prerequisites are settled in one round of numbered questions, gives a recommended answer for each, waits for the answers, and recomputes what is askable. There is no cap on the number of rounds or questions. Facts come from the code, specs, and docs, and the task looks them up itself rather than asking. The questioning ends only when every scope decision is settled.

**Four categories are always covered.** Before the first round, the task makes sure it has at least one question in each of these, skipping a category only when the code already answers it unambiguously, and then quoting that answer back to the user as its understanding rather than assuming it silently:

- **Boundary**: exactly what counts as the feature and what does not, which matters most for a partial removal.
- **Touch points**: each remaining feature that calls, renders, routes to, or documents the removed one, and how it behaves once detached.
- **Shared pieces**: helpers, types, styles, and doc sections used both by the feature and by something that stays, and whether each is kept or removed.
- **User-visible wording**: any text in what stays that has to change because it mentioned the feature, such as help, menus, labels, and messages.

**A removed name behaves as if it never existed.** After removal, typing a removed command or pressing a removed key binding gets whatever the app already does for any unknown command or unbound key. The task adds no "this was removed" message and keeps no stub reserving the old name.

**Stopping before removal leaves nothing behind.** If the user stops the run during the scope questions, or chooses to stop the removal when a remaining feature cannot be detached, the task deletes the draft plan, changes no other file, and reports `Status: stopped: <reason>`.

**Stopping after removal has begun reverts everything.** A stop can also come once files have started changing: a remaining feature found mid-removal that cannot be detached and the user chooses to stop, or a check that cannot be brought back to green within the settled scope. The task then restores every file the run changed or deleted, deletes the plan, and reports `Status: stopped: <reason>` together with what it found. The tree ends exactly as the run found it. No partial removal is ever left in the tree or committed.

**The plan file is named `remove-<feature-slug>.md`.** The slug is the kebab-case name of the feature as settled with the user, for example `./product/plans/draft/remove-audio-player-tab.md`, the same pattern as `product/plans/complete/remove-gruvbox-dark-theme.md`. The same name is used in `draft/`, `ready/`, and `complete/`.

**The removal plan follows `fix-a-bug.md`'s lifecycle.** Once scope is settled, the task writes the plan to `./product/plans/draft/<name>.md`, moves it to `./product/plans/ready/` before removing anything, and moves it to `./product/plans/complete/` after verification. It moves the file with plain `mv`, because the file is untracked until the PR workflow stages it. The plan ships in the same PR as the removal, as the record of what was removed and why.

**Anything the plan missed goes back to the user.** When removal turns up something the settled plan did not cover, such as an unforeseen caller, a helper the feature shares with another one, or a doc page nobody listed, the task puts the new decision to the user in another round with a recommended answer, writes the answer into the plan, and continues. It never silently widens or narrows the scope.

**It works on any project, not only Janissary.** The task finds the project's check commands in the project's own instructions, in this order: `AGENTS.md` / `CLAUDE.md`, then the README, then the build tool's script list (`package.json` scripts or the equivalent for another toolchain), the same order `ai/tasks/workspace/start-application.md` Step 0 reads them in to find how an app builds and runs. It looks for four commands: a typecheck, a lint, the full test suite, and a dead-code scan. On a Janissary checkout they resolve to `npm run typecheck`, `npm run lint`, `npm test`, and `npm run knip` (all four are `package.json` scripts). The typecheck is `npm run typecheck` rather than the `npx tsc --noEmit` that `hygiene/remove-deadcode.md` runs, because only the script checks `web/tsconfig.json` as well as the root `tsconfig.json`, and a removal is as likely to break the web client as the server. A project with no typecheck, lint, or dead-code command has that check skipped, and the report says which ones were missing. A project with no test command stops the run before anything is removed, because nothing could then show that the remaining features still work. Living documentation is likewise found where the project keeps it rather than at fixed Janissary paths: Janissary keeps it in `product/specs/`, `documentation/`, `help.md`, `ai/guidelines/`, and `AGENTS.md`.

**It stops before touching anything if the working tree is not clean.** The first thing the task does, before workspace preparation, is check `git status` for uncommitted changes, untracked files included. If there are any, it lists them and stops without changing anything, so the user can commit or stash them and run it again. A clean start is what makes the revert on a late stop safe, and what keeps someone else's work out of the commit `open-feature-pull-request.md` makes of everything in the tree.

**It stops before touching anything if the project is not green.** Before removing anything it runs the discovered typecheck, lint, and test commands as a baseline, exactly as `hygiene/remove-deadcode.md` Step 1 does. If any of them reports an error or a failing test, it reports what failed and stops without changing a file, because a remaining feature broken by the removal could not be told apart from a failure that was already there. Lint warnings do not count as red.

**It removes only the dead code the removal created.** The dead-code scan runs as part of the baseline, and its findings are written into the plan's Verification section when the plan is written, so the comparison survives the run and ships with the PR. After the feature is removed the scan runs again, and every finding that was not in the baseline is removed, the way `hygiene/remove-deadcode.md` Step 4 removes a finding: the whole declaration, file, or dependency line, never just the `export` keyword, and never with an automatic fixer such as `knip --fix`. Before a new finding is removed, the task searches for it by name, because a scanner cannot see a use by string, by dynamic `import()`, or from outside the repository (`remove-deadcode.md`'s "non-obvious way"). A finding that turns up such a use is put to the user rather than removed. Findings that were already in the baseline are left alone for `hygiene/remove-deadcode.md` and named in the report. The scan is repeated until it reports nothing beyond the baseline, since removing one orphan can orphan another. A project with no dead-code scan gets a reference search instead: the task searches the codebase for remaining references to every symbol, file, and dependency the removal deleted, and for anything those were the only users of, removes what only the removed feature used, and says in the report that no scan was available.

**The remaining features are proven to work in three layers.** After each removal step the task runs a fast check: on a Janissary checkout (recognized, as `prepare-workspace.md` recognizes one, by `bin/janus.mjs` at the root) that is `$janissary/scripts/run.mjs check-diff`; on any other project it is the discovered typecheck command, because `scripts/check-diff.mjs` only knows Janissary's `src/`, `scripts/`, and `web/src/` layout and would check nothing elsewhere. Once the removal is complete, one full run of the discovered typecheck, lint, and test commands must be as green as the baseline. When the removal deleted or edited any page of a documentation site and the project's instructions name a docs build, that build runs too and must pass: on Janissary that is `npm run docs:build`, which fails on a link to a deleted page because `documentation/.vitepress/config.mts` sets no `ignoreDeadLinks`. Then every feature that touched the removed one, and so had to be detached from it, is checked live in a scratch instance the way `fix-a-bug.md` Step 5 does it: the start task with `./temp/remove-an-existing-feature/` as the scratch root, one `$janissary/scripts/run.mjs e2e-driver` batch whose driver lives inside that scratch root, then the stop task with the same scratch root. Unlike `fix-a-bug.md`, which keeps its driver outside the scratch root to rerun it after the fix, this run drives each instance once, so the driver can go when the stop task clears the root. When nothing was detached there is no live check. When the tab has no attached browser (`JANISSARY_BROWSER_WS_ENDPOINT` or `JANISSARY_PLAYWRIGHT` unset), or a touched feature cannot be reached in a live instance, that check is skipped and the reason is written in the plan's Verification section, the PR body, and the report. A skipped check is never reported as a pass. These commands are named individually because `npm run check` is the human's end-of-work gate (`AGENTS.md`) and the task never runs it.

**A failing test of a remaining feature is a real break unless it asserts on the removed feature.** The task may edit a remaining feature's test only to delete an assertion about the removed feature itself. Any other failure means the removal broke something: it is fixed in the remaining feature's code within the settled plan, or put to the user when the fix falls outside it. A check is never silenced to get green, whether by skipping a test, adding `eslint-disable`, or adding a scanner `ignore` entry.

**Workspace tasks resolve project-first.** Every workspace task the run executes (`prepare-workspace.md`, `start-application.md`, `stop-application.md`, `open-feature-pull-request.md`) is read from the project's own `ai/tasks/workspace/` when the project has that file, and from `$janissary/ai/tasks/workspace/` otherwise, with the same wording `research/find-bugs.md` Step 2 and `fix-a-bug.md` Step 5 use. After preparation, if the install rewrote the lockfile without a dependency change, the task reverts it with `git checkout -- <lockfile>`, as `take-documentation-screenshots.md` Step 0 does for `package-lock.json`, so the tree is clean again before the baseline.

**Data already on users' machines is tolerated, not migrated.** A feature may have left configuration keys, state files, or saved profiles that mention it. The task adds no migration and no cleanup of those files. It does confirm, by reading the code that loads each kind of old data, that the app will still start and load with that data present. It adds no test and no live check for this: `start-application.md` creates its own scratch state and refuses one that already exists, so old data cannot be seeded ahead of a live start, and the user chose reading the loader over adding a regression test per removal. On Janissary this already holds for configuration, because `decodeConfig` in `src/config-decode.ts` reads only the keys it knows and ignores the rest. When the loader shows that the old data would break loading, that becomes a scope question for the user.

**A remaining feature that cannot be detached with a small change is put to the user.** When a remaining feature is built around the removed one, or would lose its main purpose without it, detaching it would mean redesigning it. The task then asks the user to choose one of three: remove that feature too (it joins the removal and its own touch points are inventoried the same way), keep the shared piece the remaining feature needs (it stays, and the plan says why), or stop the removal before anything has been deleted.

**Plugin and extension contracts get no deprecation window.** When the removed feature is, or shrinks, a published extension contract such as a tab plugin or a capability in `src/plugins/api.ts`, the task removes it like any other code. It does not add a compatibility shim or a deprecation warning first, even though `ai/guidelines/plugins.md` section 4 asks for a window before a documented contract is removed. The user decided this explicitly, and the task file says so where it names the exception, so a reader of `plugins.md` is not surprised by it.

**The commit type says whether users lose something.** A removal users can see (a command, a tab, a key binding, an option, documented behavior) is committed and titled `feat(<scope>)!: remove <feature>` with a `BREAKING CHANGE:` footer naming what users lose, for example `feat(audio)!: remove the audio player tab`. A removal users cannot see is `refactor(<scope>): remove <feature>`. Both follow `ai/guidelines/conventional-commits.md`, and the PR title matches the commit subject as `open-feature-pull-request.md` requires.

**Historical records are left as they are.** Completed plans in `./product/plans/complete/` and entries in a changelog record what happened, not current behavior, so the task never edits or deletes them, the same call `product/plans/complete/remove-gruvbox-dark-theme.md` made about the theme's original plan. Only living documentation is updated.

**Backlog entries about the removed feature go with it.** An entry in any `./product/backlog/*.md` file, in any section, that concerns only the removed feature is deleted in the same PR, because it describes work on something that no longer exists. Each deleted entry is listed in the report and the PR body. An entry that concerns the removed feature and another one as well is put to the user as a scope question. Every other entry is left byte for byte as it was.

**It works on the project in the current directory.** Like the other task files, every `./product/...` path refers to the product directory of the project being worked on, never to the Janissary installation's own `product/`, and Janissary's scripts are reached as `$janissary/scripts/run.mjs`.

**No AI attribution.** Like every task file, it carries the rule that nothing it produces credits an AI agent.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Interactive, phased decision-tree questioning with numbered questions and recommended answers | `ai/tasks/plan-a-new-feature.md`, "Phased questioning — the decision tree" and Steps 2d–2g |
| Implementing a change end to end, updating specs, and opening a PR | `ai/tasks/build-a-feature.md`; `ai/tasks/workspace/open-feature-pull-request.md` |
| Finding and deleting dead code with Knip, with backups and a green-before/green-after rule | `ai/tasks/hygiene/remove-deadcode.md`; `npm run knip` |
| Workspace preparation, including the supply-chain gate before install | `ai/tasks/workspace/prepare-workspace.md` |
| Diff-scoped lint, typecheck, and tests | `$janissary/scripts/run.mjs check-diff` |
| Starting, driving, and stopping a scratch instance of the app for a live check | `ai/tasks/workspace/start-application.md`, `ai/tasks/workspace/stop-application.md`, `$janissary/scripts/run.mjs e2e-driver` (as used in `ai/tasks/fix-a-bug.md` Step 5) |
| Where task behavior is described for contributors | `product/specs/task-picker.md` (one `###` section per notable task) |
| Where task behavior is described for users | `documentation/user-documentation/command-bar/tasks.md`, `documentation/user-documentation/workflows/product-development.md` |
| A precedent for pinning a prose playbook's load-bearing literals in a test | `scripts/find-bugs-playbook.test.mjs`, `scripts/test-pull-request-playbook.test.mjs` |
| A precedent removal plan | `product/plans/complete/remove-gruvbox-dark-theme.md` |

## Proposed changes

**`ai/tasks/remove-an-existing-feature.md`** (new). A prose playbook in the house shape of `plan-a-new-feature.md`, `build-a-feature.md`, and `fix-a-bug.md`: a job statement, the `./product/` paragraph, the no-AI-attribution rule, a statement that the task is interactive (the opposite of the "Run autonomously" paragraph those unattended tasks carry), an allowed/forbidden list, numbered steps, and a fixed report shape. The questioning mechanism is not restated: the task file points at `plan-a-new-feature.md`'s "Phased questioning — the decision tree" section (the project's copy when it has one, `$janissary/ai/tasks/plan-a-new-feature.md` otherwise) and applies it to scope decisions, so the two tasks cannot drift apart. Only what differs is written out: the four categories and the decisions the inventory adds to the tree.

**Allowed:** read any file; ask the user questions; delete and edit source, tests, styles, specs, documentation, `help.md`, docs-site configuration, screenshot definitions and assets, dependency lines, and `./product/backlog/*.md` entries as the settled plan directs; write the plan and move it through `draft/` → `ready/` → `complete/`; create and delete anything under `./temp/remove-an-existing-feature/`; run the discovered check commands and `check-diff`; execute the four workspace tasks. The one `temp/` line `start-application.md` Step 2 may append to `.gitignore` ships in the PR, as `fix-a-bug.md` allows.

**Forbidden:** starting with a dirty tree or a red baseline; removing anything before the scope questions are settled and the plan is in `ready/`; changing anything the settled plan does not name without first asking the user; editing completed plans or changelog entries; removing a dead-code finding that was already in the baseline; running an automatic fixer (`knip --fix`, `eslint --fix` across the project); adding a migration, a deprecation shim, or a "removed" message; silencing a check (`eslint-disable`, a scanner `ignore` entry, a skipped test) to get green; editing a test of a remaining feature except to delete an assertion about the removed feature; running `npm run check`; merging the PR; leaving a partial removal in the tree.

The steps, in order:

0. Check `git status`. Stop on any uncommitted or untracked file, listing them.
1. Prepare the workspace by executing `prepare-workspace.md` (project copy first). Revert a lockfile the install rewrote.
2. Discover the typecheck, lint, test, dead-code, and docs-build commands. Stop if there is no test command. Run the baseline typecheck, lint, and tests, and stop if any is red. Run the dead-code scan and keep its findings for the plan. The baseline runs before any question, so a project that cannot be worked on does not cost the user a round of answers.
3. Resolve the named feature, asking with candidates when the name matches nothing or more than one thing, or asking for one when none was named.
4. Inventory, by searching the codebase, specs, docs, help, backlog files, and loaders of persisted data: everything that belongs to the feature, every touch point, every shared piece, every backlog entry about it, and each kind of user data it left behind and what loads it.
5. Settle the scope with the user in decision-tree rounds that cover the four categories, plus every deep tie, mixed backlog entry, shared contract, and breaking-loader case the inventory found.
6. Write `./product/plans/draft/remove-<feature-slug>.md` in the house shape of `product/plans/complete/remove-gruvbox-dark-theme.md` (goal, approach, implementation steps, tests, spec updates, verification with the dead-code baseline, out of scope), then move it to `ready/`.
7. Remove and detach in the plan's order, running the fast check after each step. Anything the plan did not cover goes to the user, and the answer goes into the plan.
8. Re-run the dead-code scan (or the reference search) and remove new findings until none is left beyond the baseline.
9. Run the full typecheck, lint, and tests, the docs build when documentation changed, and the live check of each detached feature.
10. Move the plan to `complete/`, then execute `open-feature-pull-request.md` with the commit type the design decision above prescribes and a PR body that lists the removed backlog entries, the pre-existing dead code left alone, and any skipped live check with its reason.
11. Report.

A stop at Steps 0–6 leaves the tree as it was (deleting the draft plan if one was written); a stop at Steps 7–10 reverts everything first, per the design decision above.

The report shape, verbatim:

- `Feature:   <feature, as settled with the user>`
- `Plan:      ./product/plans/complete/<file> | none`
- `Removed:   <N files deleted, M edited> — code, tests, specs, docs`
- `Detached:  none | <remaining feature — what changed>, one each`
- `Dead code: <N new findings removed>; <K pre-existing left> | no scan — reference search`
- `Backlog:   none | <entries removed, file each>`
- `Checks:    typecheck, lint, tests green | <missing command each>`
- `Live:      <features checked live> | none — nothing detached | skipped — <reason>`
- `PR:        <url> (#<number>) | none`
- `Status:    open | stopped: <reason>`

**`product/specs/task-picker.md`** (edit). Add a `### Removing a feature` section directly after `### Planning a new feature`, describing in the spec's prose style what the task does: it takes the feature named at invocation, settles the scope with the user in decision-tree rounds covering the four categories, records the plan, removes the feature and detaches what touched it, removes only the dead code it created, verifies the remaining features in three layers, and opens a PR it never merges; and it stops, leaving the tree as it found it, on a red baseline, a missing test command, or a user's stop.

## Tests

No automated test. The change is a prose task file plus a spec section, with no application code, and the user chose not to pin the task file's literals the way `scripts/find-bugs-playbook.test.mjs` does. Correctness is checked by running the task end to end (see Verification).

## Out of scope

- Merging the PR. The human merges.
- Editing completed plans or changelog entries for the removed feature.
- Removing dead code that was already there before the removal; that is `ai/tasks/hygiene/remove-deadcode.md`'s job.
- Migrating or cleaning up configuration, state, or profiles already on users' machines.
- A deprecation window, compatibility shim, or "this was removed" message for anything removed.
- Picking the feature from a backlog file. It is named at invocation.
- Updating the user documentation (`documentation/user-documentation/command-bar/tasks.md`, `documentation/user-documentation/workflows/product-development.md`) to mention the new task.
- An automated test for the task file.

## Verification

`$janissary/scripts/run.mjs check-diff` (nothing under `src/`, `scripts/`, or `web/src/` changes, so this is a formality). Then run the new task end to end on a Janissary workspace launched with `-b`, and close the PRs it opens without merging them:

1. With an untracked file in the tree, run `execute ./ai/tasks/remove-an-existing-feature.md "audio player"`. Confirm it lists the file and stops before preparing the workspace, with nothing changed.
2. On a clean tree, run it again. Confirm it resolves the name to the audio tab plugin (`src/plugins/audio/`, `web/src/plugins/audio/`, `product/specs/audio-tab.md`), asks at least one question in each of the four categories with a recommended answer each, and writes `./product/plans/draft/remove-audio-player-tab.md` only after the questions are settled. Then confirm the PR it opens: the plugin's directories, tests, spec, and user documentation page are gone; its entries in `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx` are removed; no `[[audio-tab]]` link and no docs-site sidebar entry points at a deleted page; `npm run knip` reports nothing that was not in the baseline recorded in the plan; `npm run docs:build` passes; the commit subject is `feat(<scope>)!: remove …` with a `BREAKING CHANGE:` footer; the plan is in `./product/plans/complete/`; and the report has all ten lines.
3. Run it once more, naming `search`. Confirm the first question offers the candidates (the search tab and transcript search) instead of guessing. Answer that you want to stop, and confirm the draft plan is gone and the tree is clean.
