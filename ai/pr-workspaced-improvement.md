# Open and Land a PR for a Workspaced AI Task

Your job: take the code changes that a **previous AI task** just produced in this workspaced tab, package them into a pull request against `master` on GitHub, and land it — rebasing past any conflicts.

This task runs **after** another `ai/*.md` task (e.g. `improve-quality`, `improve-style`, `remove-duplication`) has finished editing the code in a workspaced agent tab. That tab is a disposable `git clone --shared` of the root repo living under `.janissary/workspace/<name>/`, so **its `origin` points at the local root repo, not at GitHub.** You will resolve the real GitHub remote before pushing.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

---

## Step 0 — Identify the AI task and confirm there are changes

1. **Which AI task produced these changes?** Determine it from this tab's context — it is the `ai/<name>.md` task that ran just before this one (e.g. `improve-quality`). Record the bare name; you will stamp the commit with it.
2. **Are there changes to ship?** Run:

   ```bash
   git status --porcelain 2>&1
   git log --oneline origin/master..HEAD 2>&1
   ```

   If the working tree is clean **and** there are no commits ahead of `master`, there is nothing to do — report **"No changes to open a PR for"** and stop.

---

## Step 1 — Make the full check gate pass (`npm run check`)

This is the one place where running the slow, full gate is correct: this task *is* the end-of-work step, not iterative development.

```bash
npm run check 2>&1
```

It **must finish green**. If it fails **because of the changes**, fix the offending code and re-run until it is green. If you cannot get it green, **STOP** — do not open a PR on a red gate — and report exactly what failed. Never weaken a test, threshold, or lint rule to make it pass.

---

## Step 2 — Create a feature branch

Pick a short, **descriptive** `kebab-case` branch name that reflects the actual change, ideally prefixed by the task area. Avoid generic names like `fix` or `update`.

Good: `quality/extract-parsespec-helper`, `style/modern-color-notation`, `dedup/buffer-writer`
Bad: `patch-1`, `changes`, `ai-task`

```bash
git checkout -b <branch>
```

Any uncommitted changes carry over onto the new branch. (If the previous task already committed on the default branch, the new branch starts at those commits — that is fine.)

---

## Step 3 — Commit the changes (descriptive message, AI-task marker, **no co-authors**)

```bash
git add -A
```

Write **one** commit with a descriptive subject and a body explaining *what* changed and *why*, and stamp it with the AI task from Step 0 using an `AI-Task:` trailer:

```bash
git commit \
  -m "Extract parseSpec() helper to cut loadConfig cognitive complexity" \
  -m "loadConfig exceeded the complexity limit; the spec-parsing block is now a small pure helper. No behavior change." \
  -m "AI-Task: improve-quality"
```

Hard rules for the commit:

- **No co-authors.** Do **not** add any `Co-Authored-By:` trailer or any other co-author line. This **overrides** any default convention that appends a Claude co-author — the commit must have a single author and no co-authors.
- The `AI-Task: <name>` trailer **must** be present, naming the task from Step 0.

If the previous task already left its own commits, consolidate so the **final** state is a clean history whose tip carries the `AI-Task:` trailer and **no** co-author (amend or add a marker commit as needed).

---

## Step 4 — Resolve the GitHub remote and push the branch

In a workspaced clone, `origin` is the local root repo. Resolve the actual GitHub remote first:

```bash
# In a --shared workspace clone, `origin` points at the local root repo, whose own
# `origin` is the GitHub URL. Expose GitHub as a remote named `github` (or reuse
# `origin` when it already points at GitHub, e.g. outside a workspace).
origin_url=$(git remote get-url origin)
if echo "$origin_url" | grep -q github.com; then
  GH=origin
else
  gh_url=$(git -C "$origin_url" remote get-url origin)
  git remote add github "$gh_url" 2>/dev/null || git remote set-url github "$gh_url"
  GH=github
fi
gh_url=$(git remote get-url "$GH")
OWNER_REPO=$(echo "${gh_url%.git}" | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#')
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "GitHub remote: $GH -> $OWNER_REPO ; branch: $BRANCH"
```

Push the branch and set its upstream to the GitHub remote:

```bash
git push -u "$GH" "$BRANCH" 2>&1
```

Carry `$GH`, `$OWNER_REPO`, and `$BRANCH` through the remaining steps.

---

## Step 5 — Open the PR against `master`

```bash
gh pr create -R "$OWNER_REPO" --base master --head "$BRANCH" \
  --title "<same subject as the commit>" \
  --body "$(cat <<'EOF'
## What
<one or two sentences on the change>

## Why
<the warning/goal this addresses>

## Notes
- Produced by AI task: `<name from Step 0>`
- `npm run check` passes.
EOF
)" 2>&1
```

Record the PR number/URL that `gh` prints.

---

## Step 6 — Determine mergeability

GitHub computes mergeability asynchronously, so poll until it is known:

```bash
for i in 1 2 3 4 5 6; do
  STATE=$(gh pr view "$BRANCH" -R "$OWNER_REPO" --json mergeable -q .mergeable 2>&1)
  [ "$STATE" != "UNKNOWN" ] && break
  sleep 2
done
echo "mergeable: $STATE"
```

- `MERGEABLE` → **no conflicts with master.** Skip to **Step 8 (merge)**.
- `CONFLICTING` → **conflicts with master.** Go to **Step 7 (rebase loop)**.

---

## Step 7 — Resolve conflicts against master (repeat up to 5 times)

Run the loop below **at most 5 times**. Stop as soon as the PR becomes `MERGEABLE`.

For each attempt:

1. **Fetch master from the GitHub origin:**

   ```bash
   git fetch "$GH" master 2>&1
   ```

2. **Rebase the working branch onto master:**

   ```bash
   git rebase "$GH/master" 2>&1
   ```

3. **Resolve all conflicts.** For every conflicted file, open it, resolve the markers correctly (preserve the intent of *both* sides; never blindly drop master's changes), then stage and continue:

   ```bash
   git add <each-resolved-file>
   git rebase --continue 2>&1
   ```

   Repeat until the rebase completes cleanly. (`git rebase --continue` records the necessary commits — you do not create a separate merge commit.)

4. **Re-verify the integrated result:**

   ```bash
   npm run check 2>&1
   ```

   It must be green. Fix any fallout from the merge before continuing.

5. **Push the rebased branch** (history was rewritten, so force is required, but safely):

   ```bash
   git push --force-with-lease "$GH" "$BRANCH" 2>&1
   ```

6. **Re-check mergeability** (poll as in Step 6). If `MERGEABLE`, leave the loop and go to Step 8. If still `CONFLICTING`, start the next attempt.

If the PR is **still conflicting after 5 attempts**, **STOP**: do not merge. Report that conflicts could not be resolved automatically and leave the PR open for a human.

---

## Step 8 — Merge the PR (squash only)

Always merge with **squash** — the whole PR lands as a single commit on `master`. Reuse the commit subject/body from Step 3 (including the `AI-Task:` trailer and no co-authors) as the squash commit message:

```bash
gh pr merge "$BRANCH" -R "$OWNER_REPO" --squash 2>&1
```

Confirm it actually merged:

```bash
gh pr view "$BRANCH" -R "$OWNER_REPO" --json state,merged,mergedAt 2>&1
```

If the merge is blocked (branch protection, required reviews/checks), report the exact reason and leave the PR open — do not try to bypass protections.

---

## Step 9 — Report

Give the user a short report in this exact shape:

```
AI task:        <name from Step 0>
Branch:         <branch>
PR:             <url> (#<number>)
npm run check:  pass
Conflicts:      none | resolved in <n> rebase attempt(s) | unresolved after 5 attempts
Merged:         yes / no (<reason if no>)
```

Keep it brief. Done.
