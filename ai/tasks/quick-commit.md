# Quick Commit

Your job: package the current working-tree changes into **one** commit on the **current branch**, then push it to the remote — rebasing onto the upstream branch first if the remote has moved ahead. This is the fast, no-PR path for shipping small changes directly (often to `master`); use [`merge-change-to-master`](merge-change-to-master.md) or [`open-feature-pull-request`](open-feature-pull-request.md) when a reviewed PR is warranted.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” lines, no AI authorship notes in commit messages or code. This overrides any default convention that appends such attribution — including your own general commit-message habits from outside this task. Never run `git commit` (or `git commit --amend`) directly for this task; always go through `pr-commit` (Step 2), which is the sole mechanism enforcing a single author with no co-author. If you already have a subject/body composed, route it through `pr-commit` rather than falling back to a raw `git commit -m`.

**Run scripts in the foreground** (never `run_in_background`) — each must finish and return its exit code before the next step. **Make all decisions autonomously** (commit type, scope, message); the only reason to stop is an unresolvable error.

---

## Step 1 — Compose a Conventional Commits message

Review what changed so the message is meaningful, not generic:

```bash
git status
git diff HEAD
```

Write a single subject line following [Conventional Commits 1.0.0](../guidelines/conventional-commits.md): `<type>[optional scope]: <description>`. Valid types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Guidance:

- Choose the type that best represents the change as a whole (one commit ships here). If the changes are genuinely unrelated concerns, prefer the dominant one for the subject and describe the rest in the body.
- Keep the subject short, imperative, and specific — describe the actual change, not "update files" or "changes".
- Add a body (one blank line after the subject) covering **what** changed and **why**. Omit the body only for a truly trivial one-liner.

---

## Step 2 — Stage everything and commit

`pr-commit` runs `git add -A` and commits with a **single author and no co-author**:

```bash
./scripts/run.mjs pr-commit "<subject>" "<body>"
```

Pass the body as the second argument (quote both). For a bodyless commit, pass the subject alone.

Verify no attribution slipped in:

```bash
git log -1 --format="%B"
```

If a `Co-Authored-By:` trailer or any AI authorship note appears, strip it with `git commit --amend -m "<subject>" -m "<body>"` (subject/body only, no trailer) before continuing to Step 3.

---

## Step 3 — Push, rebasing if the remote has moved

Push the current branch to `origin`:

```bash
./scripts/run.mjs pr-push-branch
```

- **Push succeeds** → go to Step 4.
- **Push is rejected** (`! [rejected]`, `non-fast-forward`, or `fetch first`) → the remote advanced. Rebase your commit on top of it, then push again. Determine the branch with `git rev-parse --abbrev-ref HEAD` and substitute the literal name (each Bash call is a fresh shell — no variables persist):

  ```bash
  git pull --rebase origin <branch>
  ```

  - **Rebase clean** → re-run `./scripts/run.mjs pr-push-branch`.
  - **Rebase stops on conflicts** → open each conflicted file, resolve the markers preserving the intent of **both** sides (never blindly drop the remote's changes), then `git add <files>` and `git rebase --continue`, and re-run the push.

  Repeat this push→rebase loop **at most 3 times**. If the push still fails after 3 attempts, **STOP** — leave the commit in place locally and report that the push could not be completed.

---

## Step 4 — Report

Give a short report in this shape:

```
Branch:   <branch>
Commit:   <short-sha> <subject>
Push:     pushed | rebased onto origin then pushed | failed after 3 attempts (see error above)
```

Keep it brief. Done.
