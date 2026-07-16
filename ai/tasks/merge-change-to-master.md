# Merge a Workspaced Change to master

Your job: take the code changes present in this workspaced tab, package them into a pull request against `master` on GitHub, and **merge it once there are no conflicts** — rebasing past any conflicts. Do not wait on PR checks before merging.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

The changes may have been made manually or produced by a preceding task — either way, this runs in a workspaced agent tab. That tab is a disposable, independent `git clone` of the root repo's `origin` remote living under `.janissary/workspace/<name>/`, so **its `origin` already points at GitHub.**

Every step is a script in `scripts/pr-*.sh`, invoked through the script runner. The steps below contain **no inline shell logic** — each one invokes its script.

**Always run scripts in the foreground.** Never use `run_in_background` — each script must complete and return its exit code before the next step begins.

**No subagents, no background agents.** Do every step yourself — never launch a subagent (Task/Agent tool, `fork`, or otherwise) to do any part of this task on your behalf.

**Do not ask the user for input at any point.** Make all decisions autonomously — branch names, commit messages, PR titles and bodies. The only valid reason to stop is an unresolvable error.

---

## Step 0 — Confirm there are changes to ship

```bash
./scripts/run.mjs pr-check-changes
```

Prints the working-tree status and any commits ahead of `master`, and **exits non-zero** when there is nothing to ship. If it reports **"No changes to open a PR for"**, stop.

---

## Step 1 — Create a feature branch

Pick a short, **descriptive** `kebab-case` name that reflects the actual change, ideally prefixed by the change area. Avoid generic names like `fix` or `update`. **Choose the name yourself — do not ask the user.**

Good: `quality/extract-parsespec-helper`, `style/modern-color-notation`, `dedup/buffer-writer`
Bad: `patch-1`, `changes`, `wip`

```bash
./scripts/run.mjs pr-create-branch <branch>
```

Any uncommitted changes carry over onto the new branch. (If the changes were already committed on the default branch, the new branch starts at those commits — that is fine.)

---

## Step 2 — Commit the changes (conventional commits message, **no co-authors**)

Write **one** commit. The subject line must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification (see [`ai/guidelines/conventional-commits.md`](../guidelines/conventional-commits.md)): `<type>[optional scope]: <description>`. Valid types: `refactor`, `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `perf`, `test`, `revert`. Include a body explaining *what* changed and *why*. `pr:commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
./scripts/run.mjs pr-commit "refactor: extract parseSpec() helper to cut loadConfig cognitive complexity" \
  "loadConfig exceeded the complexity limit; the spec-parsing block is now a small pure helper. No behavior change."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. This **overrides** any default convention that appends a Claude co-author — the commit must have a single author and no co-authors.

If earlier commits already exist on the branch, consolidate so the **final** state is a clean history with **no** co-author (amend as needed).

---

## Step 3 — Resolve the GitHub remote and push the branch

`origin` always points at GitHub — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote` reads it and prints the values to carry through the rest of the task:

```bash
./scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those three values from the output — each Bash command runs in its own fresh shell with no state persisted from the previous one, so substitute the actual literal values you read into each subsequent command rather than referencing shell variables — then push:

```bash
./scripts/run.mjs pr-push-branch origin my-branch-name
```

If the push fails with an HTTP 400 RPC error ("unexpected disconnect while reading sideband packet"), `pr-push-branch` handles it for you: it raises `http.postBuffer` and forces HTTP/1.1, then retries automatically. No manual intervention is needed — just let the script run.

---

## Step 4 — Open the PR against `master`

Use the commit subject (which follows Conventional Commits format) as `<title>`. The PR title must match the commit subject and therefore also follows the Conventional Commits specification. Write the PR body to a file first — this avoids shell quoting issues with multi-line content. The body should have a **What** (one or two sentences on the change) and a **Why** (the warning/goal it addresses).

Write the body to `./temp/pr-body.md`, then open the PR:

```bash
./scripts/run.mjs pr-create-pr "$OWNER_REPO" "$BRANCH" "<title>" ./temp/pr-body.md
```

Record the PR number/URL that the command prints.

---

## Step 5 — Check for conflicts

GitHub computes conflict status asynchronously; `pr:check-mergeable` polls until it is known:

```bash
./scripts/run.mjs pr-check-mergeable "$BRANCH" "$OWNER_REPO"
```

- `MERGEABLE` → **no conflicts with master.** Go to **Step 7 (merge)**.
- `CONFLICTING` → **conflicts with master.** Go to **Step 6 (resolve conflicts)**.

---

## Step 6 — Resolve conflicts against master (repeat up to 5 times)

`pr:rebase` fetches `master`, rebases your branch onto it, re-runs the check gate, and force-pushes (with `--force-with-lease`) when the result is clean:

```bash
./scripts/run.mjs pr-rebase origin my-branch-name
```

- **Exit 0** → rebased cleanly and pushed. Re-check conflict status (Step 5); when `MERGEABLE`, go to Step 7 (merge).
- **Exit 2** → it stopped on conflicts and listed the files. Open each, resolve the markers correctly (preserve the intent of *both* sides; never blindly drop master's changes), then **re-run the same command** — it continues the in-progress rebase.

Run this loop **at most 5 times**. If the PR is **still conflicting after 5 attempts**, **STOP**: report that conflicts could not be resolved automatically and leave the PR open for a human.

---

## Step 7 — Merge the PR

The PR is `MERGEABLE` (no conflicts). Squash-merge it and delete the remote branch — **do not wait on PR checks**; merge as soon as the PR is mergeable:

```bash
./scripts/run.mjs pr-merge "$BRANCH" "$OWNER_REPO"
```

If the merge fails, report the error and leave the PR open for a human.

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Branch:         <branch>
PR:             <url> (#<number>)
Conflicts:      none | resolved in <n> rebase attempt(s) | unresolved after 5 attempts
Status:         merged | open (merge failed — see error above) | open (conflicts unresolved after 5 attempts)
```

Keep it brief. Done.
