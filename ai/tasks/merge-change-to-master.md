# Merge a Workspaced Change to master

Your job: take the code changes present in this workspaced tab, package them into a pull request against `master` on GitHub, and **merge it once there are no conflicts and all checks pass** — rebasing past any conflicts.

The changes may have been made manually or produced by a preceding task — either way, this runs in a workspaced agent tab. That tab is a disposable, independent `git clone` of the root repo's `origin` remote living under `.janissary/workspace/<name>/`, so **its `origin` already points at GitHub.**

Every step is a script in `scripts/pr-*.sh`, invoked through the script runner. The steps below contain **no inline shell logic** — each one invokes its script.

**Always run scripts in the foreground.** Never use `run_in_background` — each script must complete and return its exit code before the next step begins.

**Do not ask the user for input at any point.** Make all decisions autonomously — branch names, commit messages, PR titles and bodies. The only valid reason to stop is an unresolvable error.

---

## Step 0 — Confirm there are changes to ship

```bash
./scripts/run.mjs pr-check-changes
```

Prints the working-tree status and any commits ahead of `master`, and **exits non-zero** when there is nothing to ship. If it reports **"No changes to open a PR for"**, stop.

---

## Step 1 — Make the check gate pass

This is the one place where running the slow, full gate is correct: this task *is* the end-of-work step, not iterative development.

```bash
./scripts/run.mjs pr-check-gate
```

The gate runs the **hard** checks (typecheck, lint errors, tests, CSS) and the **advisory** quality checks (complexity, duplication, dead code). **Warnings do not fail the gate** — only hard errors do, so the script surfaces advisory findings without blocking on them.

The hard checks **must pass**. If they fail **because of the changes**, fix the offending code and re-run until green. If you cannot get them green, **STOP** — do not open a PR on a red gate — and report exactly what failed. Never weaken a test or lint rule to make a hard check pass.

---

## Step 2 — Create a feature branch

Pick a short, **descriptive** `kebab-case` name that reflects the actual change, ideally prefixed by the change area. Avoid generic names like `fix` or `update`. **Choose the name yourself — do not ask the user.**

Good: `quality/extract-parsespec-helper`, `style/modern-color-notation`, `dedup/buffer-writer`
Bad: `patch-1`, `changes`, `wip`

```bash
./scripts/run.mjs pr-create-branch <branch>
```

Any uncommitted changes carry over onto the new branch. (If the changes were already committed on the default branch, the new branch starts at those commits — that is fine.)

---

## Step 3 — Commit the changes (conventional commits message, **no co-authors**)

Write **one** commit. The subject line must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification (see [`ai/guidelines/conventional-commits.md`](../guidelines/conventional-commits.md)): `<type>[optional scope]: <description>`. Valid types: `refactor`, `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `perf`, `test`, `revert`. Include a body explaining *what* changed and *why*. `pr:commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
./scripts/run.mjs pr-commit "refactor: extract parseSpec() helper to cut loadConfig cognitive complexity" \
  "loadConfig exceeded the complexity limit; the spec-parsing block is now a small pure helper. No behavior change."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. This **overrides** any default convention that appends a Claude co-author — the commit must have a single author and no co-authors.

If earlier commits already exist on the branch, consolidate so the **final** state is a clean history with **no** co-author (amend as needed).

---

## Step 4 — Resolve the GitHub remote and push the branch

`origin` always points at GitHub — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote` reads it and prints the values to carry through the rest of the task:

```bash
./scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those three values from the output — each Bash command runs in its own fresh shell with no state persisted from the previous one, so substitute the actual literal values you read into each subsequent command rather than referencing shell variables — then push:

```bash
./scripts/run.mjs pr-push-branch origin my-branch-name
```

---

## Step 5 — Open the PR against `master`

Use the commit subject (which follows Conventional Commits format) as `<title>`. The PR title must match the commit subject and therefore also follows the Conventional Commits specification. Write the PR body to a file first — this avoids shell quoting issues with multi-line content. The body should have a **What** (one or two sentences on the change), a **Why** (the warning/goal it addresses), and a **Notes** line that the check gate passes.

Write the body to `./temp/pr-body.md`, then open the PR:

```bash
./scripts/run.mjs pr-create-pr "$OWNER_REPO" "$BRANCH" "<title>" ./temp/pr-body.md
```

Record the PR number/URL that the command prints.

---

## Step 6 — Check for conflicts

GitHub computes conflict status asynchronously; `pr:check-mergeable` polls until it is known:

```bash
./scripts/run.mjs pr-check-mergeable "$BRANCH" "$OWNER_REPO"
```

- `MERGEABLE` → **no conflicts with master.** Go to **Step 8 (wait for checks)**.
- `CONFLICTING` → **conflicts with master.** Go to **Step 7 (resolve conflicts)**.

---

## Step 7 — Resolve conflicts against master (repeat up to 5 times)

`pr:rebase` fetches `master`, rebases your branch onto it, re-runs the check gate, and force-pushes (with `--force-with-lease`) when the result is clean:

```bash
./scripts/run.mjs pr-rebase origin my-branch-name
```

- **Exit 0** → rebased cleanly and pushed. Re-check conflict status (Step 6); when `MERGEABLE`, go to Step 8.
- **Exit 2** → it stopped on conflicts and listed the files. Open each, resolve the markers correctly (preserve the intent of *both* sides; never blindly drop master's changes), then **re-run the same command** — it continues the in-progress rebase.

Run this loop **at most 5 times**. If the PR is **still conflicting after 5 attempts**, **STOP**: report that conflicts could not be resolved automatically and leave the PR open for a human.

---

## Step 8 — Wait for all checks to pass

The PR is `MERGEABLE` (no conflicts). Before merging, **every required check must pass**:

```bash
./scripts/run.mjs pr-wait-checks "$BRANCH" "$OWNER_REPO"
```

It blocks until every check finishes and **exits non-zero** if any check failed (a PR with no checks counts as passed).

- All checks **passed** → go to **Step 9 (merge)**.
- Any check **failed** → **STOP.** Report which checks failed and leave the PR open for a human. Never merge on a failing check.

---

## Step 9 — Merge the PR

The PR is `MERGEABLE` and all checks have passed. Squash-merge it and delete the remote branch:

```bash
./scripts/run.mjs pr-merge "$BRANCH" "$OWNER_REPO"
```

If the merge fails, report the error and leave the PR open for a human.

---

## Step 10 — Report

Give the user a short report in this exact shape:

```
Branch:         <branch>
PR:             <url> (#<number>)
Check gate:     pass (warnings allowed)
Conflicts:      none | resolved in <n> rebase attempt(s) | unresolved after 5 attempts
PR checks:      passed | failed (see error above)
Status:         merged | open (checks failed — see error above) | open (merge failed — see error above) | open (conflicts unresolved after 5 attempts)
```

Keep it brief. Done.
