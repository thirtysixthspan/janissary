# Resolve Conflicts on an Open Pull Request

Your job: take a pull request that is **already open**, bring its head branch back into a mergeable state against `master`, confirm the implementation on that branch still delivers what the pull request's plan promised, get the build green, and push the result — **leaving the pull request open**. You never merge it. You change source code, tests, CSS, spec files, and the plan file carried by the pull request — nothing else.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Check out the pull request's head branch and rebase it onto `master`. Edit source, tests, CSS, and spec files as conflict resolution and the plan's goal require. Append an adaptation note to the plan file the pull request carries. Run `./scripts/run.mjs check-diff` while iterating and `./scripts/run.mjs pr-check-gate` as the build gate. Commit to and push the pull request's own head branch. Force-push — but only through `./scripts/run.mjs pr-rebase`, which uses `--force-with-lease`.

### Forbidden — no exceptions

1. **Merging or closing the pull request.** Never run `gh pr merge`, never execute `ai/tasks/workspace/merge-change-to-master.md`, never open a replacement pull request, and never push the work to a different branch. The pull request must still be open when you finish.
2. **Working a pull request that is not `OPEN`.** If the target does not exist or its state is not `OPEN`, report that and stop. Do not substitute another pull request or branch.
3. **Proceeding on an ambiguous target.** If no value was passed and the context does not resolve to exactly one open pull request, report the candidates and stop.
4. **Running `npm run check`.** That is the human's end-of-work gate. Use `./scripts/run.mjs check-diff` while iterating and `./scripts/run.mjs pr-check-gate` to prove the build.
5. **A bare `git push --force`.** The only rewrite permitted is `pr-rebase`'s `--force-with-lease`, which aborts rather than discarding commits someone else pushed.
6. **Resolving a conflict by discarding one side wholesale.** Preserve the intent of *both* sides — never blindly drop `master`'s changes, never drop the pull request's feature.
7. **Expanding beyond the pull request's plan.** Fix what the rebase broke and what the plan requires. Unrelated cleanups, refactors, and drive-by improvements are out of scope.
8. **Pushing on a red gate.** `pr-check-gate` must be green before the branch is pushed, and never weaken a test or a lint rule to get it there.

---

## Step 0 — Identify the pull request

1. **If a value is passed in the task invocation** (e.g. `execute ai/tasks/workspace/resolve-conflicts.md 232`), that value is the target. A pull request number, `#232`, a full pull request URL, and a head branch name are all accepted directly by `gh pr view`.
2. **Otherwise, recognize the pull request from context.** Run `gh pr view --json state,number,headRefName,url` with no argument — it resolves the pull request for the branch currently checked out. If that finds nothing, run `gh pr list --state open --json number,title,headRefName,url` and take the pull request only when **exactly one** is open. With zero or more than one, report the candidates and stop.
3. Run `gh pr view <target> --json state,number,headRefName,url` and record the number, head branch, and URL for the rest of the task. If the lookup fails or the state is not `OPEN`, stop as required above.

State the pull request you are working and how you identified it, in one sentence.

---

## Step 1 — Get onto the pull request's branch

1. Run `gh pr checkout <number>`. Do not create a new branch.
2. Run `git pull --rebase` to bring the checked-out branch up to date through the upstream `gh pr checkout` configured.
3. Confirm `git branch --show-current` is the head branch recorded in Step 0. If the checkout or pull cannot complete, report the error and stop rather than working on another branch.
4. Execute only Steps 2 and 3 of `ai/tasks/workspace/prepare-workspace.md` so dependencies match this branch. Do not execute its Step 1 — that would switch back to `master`.

---

## Step 2 — Read the plan the pull request is delivering

The plan is what you will check the implementation against in Step 5, so read it before touching a single conflict marker.

1. Run `gh pr diff <number> --name-only` and look for a `./product/plans/**/*.md` entry. A feature pull request carries its plan there — moved into `./product/plans/complete/` by `ai/tasks/build-a-feature.md`, or written straight into it by `ai/tasks/work-an-issue.md`.
2. Read that plan **in full**: its goal, design decisions, file-by-file changes, tests, and out-of-scope list.
3. Run `gh pr view <number> --json title,body` and read the description for intent the plan does not state.
4. **If the diff carries no plan file** — a hygiene or documentation pull request, say — do not stop. Use the pull request body and the commit subjects from `git log origin/master..HEAD` as the statement of intent instead, and say so in the report.

---

## Step 3 — Determine the conflict status

```bash
./scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those values from the output — each Bash command runs in its own fresh shell with no state persisted from the previous one, so substitute the actual literal values into every later command rather than referencing shell variables. Then poll GitHub, which computes conflict status asynchronously:

```bash
./scripts/run.mjs pr-check-mergeable <branch> <owner/repo>
```

- `MERGEABLE` → no conflicts with `master`. Skip to **Step 5** — the plan check and the build gate still run.
- `CONFLICTING` → go to **Step 4**.
- `UNKNOWN` → re-run the command once. If it is still unknown, treat it as conflicting and let Step 4's rebase settle the question.

---

## Step 4 — Rebase onto `master` and resolve the conflicts (repeat up to 5 times)

`pr-rebase` fetches `master`, rebases the branch onto it, re-runs the check gate, and force-pushes with `--force-with-lease` when the result is clean:

```bash
./scripts/run.mjs pr-rebase origin <branch>
```

- **Exit 0** → rebased cleanly, gate green, branch pushed. Re-check the conflict status (Step 3); when it reports `MERGEABLE`, go to Step 5.
- **Exit 2** → it stopped on conflicts and listed the files. Open each one, resolve the markers, then **re-run the same command** — it continues the in-progress rebase.
- **Exit 1** → a hard error (fetch failed, or the gate is red after the rebase). Fix the fallout, then re-run.

Resolve every marker with the plan from Step 2 in hand:

- **Keep both sides.** `master`'s change and the pull request's change are both wanted. Take `master`'s new shape and re-express the plan's intent on top of it.
- **When `master` has moved the code the plan targeted**, do not force the plan's original wording into a file that no longer looks like that. Deliver the plan's *goal* against the code as `master` now shapes it; Step 5 records the adaptation.
- **Never resolve by deleting.** Dropping a hunk to clear a marker is how a pull request quietly loses its feature — or how `master` quietly loses someone else's.

Run this loop **at most 5 times**. If the pull request is still conflicting after 5 attempts, **STOP**: report that the conflicts could not be resolved automatically and leave the pull request open for a human.

---

## Step 5 — Verify the implementation still meets the plan's goal

A resolved conflict silently loses hunks. This step is the reason the task exists — do not skip it, and run it even when Step 3 reported `MERGEABLE`.

1. Read the post-rebase diff the pull request now proposes:

   ```bash
   git diff origin/master...HEAD
   ```

2. Walk the plan **item by item** — its goal, then each entry in its file-by-file changes, then its tests section — and confirm each one is present and intact in that diff. Check the spec and documentation edits the plan called for as well; they conflict and vanish as easily as code.
3. **Restore anything the rebase dropped.** Re-apply it against the current code.
4. **Adapt anything `master` invalidated.** If the plan's stated approach is no longer possible, implement the plan's goal the way `master` now shapes the code, and append a short paragraph to the plan file in the pull request recording what changed and why. Do not rewrite the rest of the plan.
5. **Stay inside the plan's scope.** If meeting the goal genuinely requires a change the plan never named, note it in the report — do not silently expand into unrelated work.
6. If the pull request carried no plan file, verify against the pull request body and commit subjects instead, to the same standard.

---

## Step 6 — Make the build pass

Iterate on uncommitted repairs with the fast gate:

```bash
./scripts/run.mjs check-diff
```

Then prove the branch with the hard gate — typecheck, lint errors, tests, CSS:

```bash
./scripts/run.mjs pr-check-gate
```

`check-diff` is scoped to the **uncommitted** working tree, so straight after a clean rebase it finds nothing and reports success over a branch it never examined. It is a fast loop while you are editing, never the proof. `pr-check-gate` must be green before Step 7 pushes. If you cannot get it green, **STOP** and report exactly what failed — never weaken a test or a lint rule to pass it.

---

## Step 7 — Commit and push the adjustments

```bash
./scripts/run.mjs pr-check-changes
```

If it reports **"No changes to open a PR for"**, Steps 5 and 6 produced nothing to ship: `pr-rebase` already pushed the branch, so skip to Step 8.

Otherwise write **one** commit. The subject follows [Conventional Commits 1.0.0](../../guidelines/conventional-commits.md): `<type>[optional scope]: <description>`. `pr-commit` stages everything and commits with a **single author and no `Co-Authored-By:` trailer**:

```bash
./scripts/run.mjs pr-commit "fix(rebase): restore the queue-drain guard lost resolving conflicts" \
  "The rebase onto master dropped the drain guard the plan calls for. Reapplied it against master's new scheduler shape and re-pointed its test at the renamed helper."
```

Then push through the upstream `gh pr checkout` configured:

```bash
./scripts/run.mjs pr-push-branch origin <branch>
```

If the push is rejected because the remote branch advanced, run `git pull --rebase`, resolve any conflicts preserving both sides, re-run `./scripts/run.mjs pr-check-gate`, and retry the push. Repeat at most **3 times**. Never resolve a rejection with a bare force-push. If the third attempt fails, leave the local commit intact and report the failure.

---

## Step 8 — Confirm the pull request is updated and still open

```bash
gh pr view <number> --json state,headRefName,headRefOid,url
```

Confirm the state is `OPEN` and `headRefOid` matches `git rev-parse HEAD`. Re-run `./scripts/run.mjs pr-check-mergeable <branch> <owner/repo>` and confirm `MERGEABLE`. **Do not merge it** — merging is the human's decision.

---

## Step 9 — Report

Give the user a short report in this exact shape:

```
PR:             <url> (#<number>)
Branch:         <head branch>
Plan:           <./product/plans/... file from the PR, or "none in the PR — used the PR body">
Conflicts:      none | resolved in <n> rebase attempt(s) | unresolved after 5 attempts
Plan goal:      met as written | met after adjustment — <one line> | not met — see above
Adjustments:    <one-line summary of what was restored or adapted, or "none needed">
Build:          pass | red — see errors above
Status:         open (not merged)
```

Keep it brief. Done.
