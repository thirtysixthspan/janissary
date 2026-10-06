# Remove an Existing Feature

Your job: take the feature the user names, settle the scope of its removal with the user, record the removal as a plan, remove the feature's code, tests, specs, and documentation, detach every remaining feature that touched it without breaking that feature, remove the dead code the removal created, prove the remaining features still work, and open a pull request that leaves the removal for a human to merge. You change only what the settled plan names: source, tests, styles, specs, documentation, `help.md`, docs-site configuration, screenshot definitions and assets, dependency lines, backlog entries, and the plan file itself.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation. Janissary's own scripts are reached as `$janissary/scripts/run.mjs`.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**This task is interactive.** Unlike the unattended tasks beside it, it stops and asks the user questions. It asks to identify the feature when the name is missing or unclear (Step 3), to settle the scope of the removal (Step 5), and whenever the removal turns up something the settled plan did not cover (Steps 7–9). Never guess a scope decision a question would settle. Facts are your job: look up anything the code, specs, or docs can tell you rather than asking for it. Every step that is not asking runs without pausing for approval.

**Workspace tasks resolve project-first.** Whenever this task executes a workspace task (`prepare-workspace.md`, `start-application.md`, `stop-application.md`, `open-feature-pull-request.md`), read the project's own `ai/tasks/workspace/<task>` and follow it when the project has one; otherwise read `$janissary/ai/tasks/workspace/<task>` and follow that. The project's copy wins for the same reason the task picker offers it in preference to the built-in task at the same path.

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Ask the user questions. Delete and edit source, tests, styles, specs, documentation, `help.md`, docs-site configuration, screenshot definitions and assets, dependency lines, and `./product/backlog/*.md` entries as the settled plan directs. Write the plan and move it through `./product/plans/draft/` → `./product/plans/ready/` → `./product/plans/complete/`. Create and delete anything under `./temp/remove-an-existing-feature/`. Run the check commands Step 2 discovers and `$janissary/scripts/run.mjs check-diff`. Execute the four workspace tasks. The one `temp/` line `start-application.md` Step 2 may append to `.gitignore` ships in the PR.

### Forbidden — no exceptions

1. **Starting with a dirty tree or a red baseline.** Steps 0–2 stop the run instead.
2. **Removing anything before the scope is settled** and the plan is in `./product/plans/ready/`.
3. **Changing anything the settled plan does not name** without first asking the user and writing the answer into the plan.
4. **Editing historical records.** Completed plans in `./product/plans/complete/` and changelog entries record what happened, not current behavior. Never edit or delete them.
5. **Removing dead code that was already there.** A dead-code finding present in the Step 2 baseline is left alone for `ai/tasks/hygiene/remove-deadcode.md`.
6. **Running an automatic fixer** across the project, such as `knip --fix` or `eslint --fix`.
7. **Adding a migration, a deprecation shim, or a "this was removed" message** for anything removed.
8. **Silencing a check to get green.** No skipped test, no `eslint-disable`, no scanner `ignore` entry.
9. **Editing a remaining feature's test** except to delete an assertion about the removed feature itself.
10. **Running `npm run check`.** That is the human's end-of-work gate.
11. **Merging the PR.** `open-feature-pull-request.md` opens it; merging is the human's decision.
12. **Leaving a partial removal in the tree.** A stop after removal has begun reverts everything (see "Stopping").

---

## Step 0 — Confirm the tree is clean

Before anything else, run:

```bash
git status --short
```

If it lists any file, modified or untracked, list those files for the user and stop with `Status: stopped: uncommitted changes in the tree`. Change nothing. The user can commit or stash them and run the task again. A clean start is what makes the revert on a late stop safe, and it keeps someone else's work out of the commit `open-feature-pull-request.md` makes of everything in the tree.

---

## Step 1 — Prepare the workspace

Execute `prepare-workspace.md` in full, resolved project-first as described above. If it cannot be read or stops partway, stop and report what it left.

Then run `git status --short` again. An install can rewrite the lockfile. If the lockfile is the only changed file and no dependency changed, revert it with `git checkout -- <lockfile>`, as `take-documentation-screenshots.md` Step 0 does for `package-lock.json`. If anything else changed, stop and report it.

---

## Step 2 — Discover the checks and run the baseline

Find the project's check commands in its own instructions, in this order: `AGENTS.md` / `CLAUDE.md`, then the README, then the build tool's script list (`package.json` scripts or the equivalent for another toolchain). You are looking for five:

| Check | On a Janissary checkout |
|---|---|
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Full test suite | `npm test` |
| Dead-code scan | `npm run knip` |
| Docs build | `npm run docs:build` |

On Janissary the typecheck is `npm run typecheck`, not `npx tsc --noEmit`: only the script checks `web/tsconfig.json` as well as the root `tsconfig.json`, and a removal is as likely to break the web client as the server.

- **No test command:** stop before anything is removed, with `Status: stopped: no test command`. Nothing could then show that the remaining features still work.
- **No typecheck, lint, dead-code, or docs-build command:** that check is skipped for the whole run, and the report names each one that was missing.

Also settle the **fast check** you will run after each removal step. On a Janissary checkout, recognized by `bin/janus.mjs` at the root, it is `$janissary/scripts/run.mjs check-diff`. On any other project it is the discovered typecheck, because `check-diff` only knows Janissary's `src/`, `scripts/`, and `web/src/` layout and would check nothing elsewhere.

Now run the baseline, fresh, before asking the user anything:

1. Run the typecheck, lint, and test commands. If any reports an error or a failing test, report what failed and stop with `Status: stopped: baseline not green`, changing nothing. A remaining feature broken by the removal could not be told apart from a failure that was already there. Lint warnings are not red.
2. Run the dead-code scan and keep its complete findings. They go into the plan's Verification section in Step 6, and Step 8 compares against them.

The baseline runs before any question so that a project that cannot be worked on does not cost the user a round of answers.

---

## Step 3 — Identify the feature

The user names the feature at invocation, in free text: a spec name (`image-tab`), a command name (`schedule`), or a description (`the audio player`), for example `execute ai/tasks/remove-an-existing-feature.md "the audio player"`. No backlog file is read for it. If nothing was named, your first question asks which feature to remove.

Search the project's specs, command definitions, and documentation for the named text.

- **One clear match:** state in one sentence which feature you will remove and where you found it.
- **More than one match** (`search` could be the search tab or transcript search): ask the user to pick, listing the closest candidates with a one-line description each.
- **No match:** say so, offer the closest candidates you did find, and ask the user to pick one or describe the feature differently.

Never guess which feature was meant. The target may be a whole feature or part of one: a subcommand, a flag, an option, one tab action. A partial removal runs through exactly the same steps, and the part that stays counts as a remaining feature.

---

## Step 4 — Inventory the feature

Search the codebase, specs, documentation, `help.md`, backlog files, and the code that loads persisted data. This step asks nothing; it gathers the facts Step 5 asks about. Record:

1. **What belongs to the feature.** Its code, tests, styles, and dependencies. Its spec, or the spec sections that describe it. Its documentation pages or sections, and its help text. Links to any page that will be deleted: `[[name]]` cross-references in other specs, links in other documentation pages, and the docs site's navigation (on Janissary, the `sidebar` in `documentation/.vitepress/config.mts`). Screenshots and other assets only those pages use, and the screenshot definitions that produce them (on Janissary, entries in `scripts/docs-screenshots/manifest.mjs`).
2. **Touch points.** Every remaining feature that calls into, renders, routes to, or documents the removed one, and what it would have to change to keep working without it.
3. **Shared pieces.** Helpers, types, styles, and doc sections used both by the feature and by something that stays.
4. **Deep ties.** Any remaining feature built around the removed one, or one that would lose its main purpose without it, so that detaching it would mean redesigning it.
5. **Extension contracts.** Whether the feature is, or shrinks, a published extension contract such as a tab plugin or a capability in `src/plugins/api.ts`.
6. **Backlog entries.** Every entry, in any section of any `./product/backlog/*.md` file, that concerns the feature. Mark each as concerning only the removed feature, or concerning it and something else as well.
7. **Data already on users' machines.** Each kind of configuration key, state file, or saved profile the feature may have left behind, and the code that loads it. Read that loader and decide whether the app will still start and load with the old data present. On Janissary this already holds for configuration: `decodeConfig` in `src/config-decode.ts` reads only the keys it knows and ignores the rest.

---

## Step 5 — Settle the scope with the user

Work the scope decisions as a decision tree, using exactly the mechanism in the "Phased questioning — the decision tree" section of `plan-a-new-feature.md`: read the project's own `ai/tasks/plan-a-new-feature.md` when it has one, otherwise `$janissary/ai/tasks/plan-a-new-feature.md`. Ask in rounds of numbered questions over what is askable now, with your recommended answer for each, wait for the answers, then recompute the askable set. There is no cap on rounds or questions. Every question offers concrete options grounded in the Step 4 inventory, never an open "what should happen?". The questioning ends only when every scope decision is settled.

Before the first round, make sure you have at least one question in each of these four categories:

- **Boundary**: exactly what counts as the feature and what does not. This matters most for a partial removal.
- **Touch points**: each remaining feature that calls, renders, routes to, or documents the removed one, and how it behaves once detached.
- **Shared pieces**: each helper, type, style, or doc section used both by the feature and by something that stays, and whether it is kept or removed.
- **User-visible wording**: any text in what stays that has to change because it mentioned the feature, such as help, menus, labels, and messages.

Skip a category only when the code already answers it unambiguously, and then quote that answer back to the user as your understanding rather than assuming it silently.

The inventory adds these decisions to the tree:

- **Each deep tie.** Offer three choices: remove that feature too (it joins the removal, and its own touch points are inventoried the same way), keep the shared piece it needs (it stays, and the plan says why), or stop the removal.
- **Each backlog entry that concerns the removed feature and something else.** Entries that concern only the removed feature need no question: they are deleted.
- **Each kind of user data whose loader would break** with the old data present.

Some decisions are already made, and are not asked again:

- A removed name behaves as if it never existed. Typing a removed command or pressing a removed key binding gets whatever the app already does for any unknown command or unbound key.
- Data already on users' machines is tolerated, never migrated or cleaned up.
- An extension contract gets no deprecation window, shim, or warning. It is removed like any other code, even though `ai/guidelines/plugins.md` section 4 asks for a window before a documented contract is removed. The user who specified this task chose that exception deliberately.
- Completed plans and changelog entries are never touched.

If the user stops the run here, or chooses to stop the removal over a deep tie, stop as "Stopping" describes.

---

## Step 6 — Write the removal plan

Name the plan `remove-<feature-slug>.md`, where the slug is the kebab-case name of the feature as settled with the user, for example `remove-audio-player-tab.md`. Use the same name in every folder.

Write it to `./product/plans/draft/remove-<feature-slug>.md` in the house shape of `product/plans/complete/remove-gruvbox-dark-theme.md`: a complexity line, the goal, the approach, implementation steps in the order they will be done, tests, spec updates, verification, and out of scope. Record every scope decision from Step 5 in it. The Verification section carries the complete Step 2 dead-code baseline, so the comparison survives the run and ships with the PR, and it names each live check Step 9 will make.

Then move it to `./product/plans/ready/` with plain `mv`, not `git mv`. The file is untracked until the PR workflow stages it.

```bash
mv ./product/plans/draft/remove-<feature-slug>.md ./product/plans/ready/remove-<feature-slug>.md
```

---

## Step 7 — Remove and detach

Follow the plan's implementation steps in order. After each step, run the fast check from Step 2 and fix what it reports before going on.

- **Pages and specs.** A spec or documentation page that describes only the removed feature is deleted. One that also describes something that stays has only the feature's sections removed. A deleted page takes every link to it with it, along with its navigation entry and the assets and screenshot definitions only it used.
- **Detaching.** Change each remaining feature only as far as it needs to keep working without the removed one, as the plan says.
- **Tests of remaining features.** Edit one only to delete an assertion about the removed feature itself. Any other failure means the removal broke something. Fix it in the remaining feature's code within the plan, or ask the user when the fix falls outside the plan.
- **Backlog.** Delete every entry that concerns only the removed feature, from its `*` bullet through its last paragraph, plus the blank lines that separated it from the next entry. Leave every other entry, heading, and section byte for byte as it was.
- **Anything the plan did not cover.** An unforeseen caller, a helper the feature shares with something else, a doc page nobody listed, a deep tie found only now: put the decision to the user in another round with a recommended answer, write the answer into the plan, and continue. Never widen or narrow the scope silently.

---

## Step 8 — Remove the dead code the removal created

Run the dead-code scan again and compare it with the Step 2 baseline. Every finding that is not in the baseline was created by the removal and is removed. Every finding that is in the baseline is left alone and named in the report.

Before you remove a new finding, search the codebase for it by name. A scanner cannot see a use by string, by dynamic `import()`, or from outside the repository. A finding that turns up such a use is put to the user rather than removed.

Remove a finding the way `ai/tasks/hygiene/remove-deadcode.md` Step 4 does: the whole declaration, file, or dependency line, never just the `export` keyword, and never with an automatic fixer. Run the fast check, then scan again, and repeat until the scan reports nothing beyond the baseline. Removing one orphan can orphan another.

**No dead-code scan.** Search the codebase for remaining references to every symbol, file, and dependency the removal deleted, and for anything those were the only users of. Remove what only the removed feature used, and say in the report that no scan was available.

---

## Step 9 — Verify the remaining features

The remaining features are proven to work in three layers. The fast check after each step was the first.

**Full checks.** Run the discovered typecheck, lint, and test commands. Each must be as green as the Step 2 baseline. If the removal deleted or edited any page of a documentation site, run the docs build too; it must pass. On Janissary, `npm run docs:build` fails on a link to a deleted page because `documentation/.vitepress/config.mts` sets no `ignoreDeadLinks`. Never run `npm run check`.

**Live check of each detached feature.** Every remaining feature that touched the removed one, and so had to be detached from it, is checked in a scratch instance of the app the way `fix-a-bug.md` Step 5 does it. When nothing was detached, there is no live check.

1. Decide whether it is possible. For a web app the tab needs an attached browser: confirm `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both set, printing only whether each exists. Each detached feature must also be reachable in a running app. Where either fails, skip that check and record the reason in one line. It goes in the plan's Verification section, the PR body, and the report. Never launch a browser of your own; [`sandbox-e2e-browser.md`](../guidelines/sandbox-e2e-browser.md) explains why that fails inside a workspace.
2. Start a scratch instance by executing `start-application.md` with `./temp/remove-an-existing-feature/` as the scratch root. It builds the working tree, so it includes the uncommitted removal. Compare `git status --short` before and after the build; the build must add or change nothing tracked. A start failure with an environment cause (a sandbox denial, a held port, a missing binary) makes the live check not possible, with that reason. A start failure caused by the removal means the removal is broken: go back to Step 7.
3. Drive every detached feature in one batch. Write the driver inside the scratch root and run it once:

   ```bash
   $janissary/scripts/run.mjs e2e-driver ./temp/remove-an-existing-feature/verify.mjs \
     --log <project-dir>/.janissary/log/server.log --scratch ./temp/remove-an-existing-feature --out verify
   ```

   The **Janissary, specifically** section of `$janissary/ai/tasks/workspace/start-application.md` documents the driver's arguments and helpers. Put every observation the verdict depends on into `record`. Unlike `fix-a-bug.md`, which keeps its driver outside the scratch root to rerun it, this run drives each instance once, so the driver goes when the stop task clears the root. For a tool rather than a web app, run each detached feature's commands from the scratch working directory against this checkout's built output.
4. Judge the result. A detached feature passes only when it behaves as the plan says it should once detached. A failure the environment could plausibly explain is recorded as not possible with that reason, never as a pass.
5. Read what you need from `./temp/remove-an-existing-feature/`, then execute `stop-application.md` with the same scratch root. If it reports an incomplete teardown, carry its words into the report.

A skipped live check is never reported as a pass. Nothing under `./temp/` is ever committed.

---

## Step 10 — Promote the plan and open the pull request

Move the plan to `./product/plans/complete/` with plain `mv`:

```bash
mv ./product/plans/ready/remove-<feature-slug>.md ./product/plans/complete/remove-<feature-slug>.md
```

Then execute `open-feature-pull-request.md` in full, resolved project-first. Follow its steps as written, and satisfy these three requirements as well:

1. **Commit type.** A removal users can see (a command, a tab, a key binding, an option, documented behavior) uses `feat(<scope>)!: remove <feature>`, with a `BREAKING CHANGE:` footer at the end of the commit body naming what users lose. For example: `feat(audio)!: remove the audio player tab`. A removal users cannot see uses `refactor(<scope>): remove <feature>`. Both follow [`ai/guidelines/conventional-commits.md`](../guidelines/conventional-commits.md), and the PR title matches the commit subject.
2. **PR body.** Besides that workflow's sections, list every backlog entry the removal deleted, the pre-existing dead code left alone, each remaining feature that was detached and how, and each skipped live check with its reason.
3. **No merge.** Leave the PR open for a human.

---

## Stopping

A run can stop at any step, and it never leaves a partial removal behind.

- **A stop at Steps 0–6** leaves the tree as the run found it. Delete the draft plan if one was written; nothing else has changed.
- **A stop at Steps 7–10**, before the PR is opened, reverts everything the run did. If a scratch instance is running, execute `stop-application.md` first. Then restore every tracked file the run changed or deleted with `git checkout -- .` (after `git reset` if anything is staged), and remove the files the run created, the plan included, with `git clean -fd`. That is safe only because Step 0 confirmed the tree had no untracked files. Confirm with `git status --short` that the tree is clean again. Report what you found that led to the stop.

Typical stops are a user who chooses to stop during the scope questions, a deep tie the user chooses not to resolve, and a check that cannot be brought back to green within the settled scope. Every stop reports `Status: stopped: <reason>`.

---

## Step 11 — Report

Give the user a short report in this exact shape:

```
Feature:   <feature, as settled with the user>
Plan:      ./product/plans/complete/<file> | none
Removed:   <N files deleted, M edited> — code, tests, specs, docs
Detached:  none | <remaining feature — what changed>, one each
Dead code: <N new findings removed>; <K pre-existing left> | no scan — reference search
Backlog:   none | <entries removed, file each>
Checks:    typecheck, lint, tests green | <missing command each>
Live:      <features checked live> | none — nothing detached | skipped — <reason>
PR:        <url> (#<number>) | none
Status:    open | stopped: <reason>
```

Keep it brief. Done.
