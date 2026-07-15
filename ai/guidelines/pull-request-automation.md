# PR Automation

Scripts in `scripts/pr-*.sh` automate the `ai/tasks/merge-change-to-master.md` workflow: package the current changes into a PR against `master` and **merge it once there are no conflicts and all checks pass**. They are executable and called directly (no `npm run` wrappers). They work both in a normal checkout and in a workspaced clone (an independent `git clone` of the root repo's `origin` remote, so `origin` already points at GitHub).

## Quick Start

From the repo (or a workspace clone) with changes ready to ship:

```bash
./scripts/pr-merge-to-master.sh "Extract formatting helpers"
```

This single command runs Steps 0–9 of the workflow:

1. ✅ Verifies there are changes (`pr-check-changes.sh`)
2. ✅ Runs the check gate (`pr-check-gate.sh`; warnings don't fail it; skip with `--no-check`)
3. ✅ Creates a feature branch (`pr-create-branch.sh`; from the title, or reuses the current non-`master` branch)
4. ✅ Commits with a single author — **no co-authors** (`pr-commit.sh`)
5. ✅ Resolves the GitHub remote and pushes (`pr-resolve-remote.sh`, `pr-push-branch.sh`)
6. ✅ Opens the PR (`pr-create-pr.sh`)
7. ✅ Polls conflict status (`pr-check-mergeable.sh`)
8. ✅ Waits for all checks to pass (`pr-wait-checks.sh`)
9. ✅ Merges and deletes the branch (`pr-merge.sh`)
10. ✅ Prints a final report

It stops and leaves the PR open if the check gate is red, if the PR conflicts with `master` (resolve those with `pr-rebase.sh` — see Step 7 of `ai/tasks/merge-change-to-master.md`), or if a check fails.

```bash
# explicit branch, and --no-check to skip the gate for a pre-existing red tree:
./scripts/pr-merge-to-master.sh "Modernize color notation" style/modern-colors --no-check
```

## Individual Scripts

Each step is also a standalone script for finer control or manual conflict resolution.

### `./scripts/pr-check-changes.sh`
Print uncommitted changes and commits ahead of `master`. Exits non-zero when there is nothing to ship.

### `./scripts/pr-check-gate.sh`
Run the check gate. Only the hard checks run: typecheck, lint errors, tests, CSS. Advisory quality checks (complexity, duplication, dead code) are not part of this gate — they belong to the human end-of-work gate (`npm run check:full`). Exits non-zero only on a hard-check failure.

### `./scripts/pr-create-branch.sh <branch>`
Create and switch to a feature branch (`git checkout -b`). No-op if already on it.

### `./scripts/pr-commit.sh "<subject>" "[body]"`
Stage all changes and commit with a single author. Adds **no** `Co-Authored-By:` trailer.

```bash
./scripts/pr-commit.sh "Extract formatting helpers" "Moved flattenBuffer and helpers to a new module"
```

### `./scripts/pr-resolve-remote.sh`
Read `origin`'s URL and print `OWNER_REPO`/`BRANCH`/`GH_URL` for `eval`.

```bash
eval "$(./scripts/pr-resolve-remote.sh)"
```

### `./scripts/pr-push-branch.sh <remote> <branch>`
Push the branch to GitHub with upstream tracking.

### `./scripts/pr-create-pr.sh <owner/repo> <branch> "<title>" "[body]"`
Create the PR against `master`. Prints the PR URL.

### `./scripts/pr-check-mergeable.sh <branch> <owner/repo>`
Poll merge status (6 attempts, 2-second intervals). Prints `MERGEABLE`, `CONFLICTING`, or `UNKNOWN`.

### `./scripts/pr-rebase.sh <remote> [branch]`
Fetch `master`, rebase the branch onto it, re-run the check gate, and force-push when clean. Exit 0 = done, exit 2 = conflicts to resolve (resolve the listed files' markers, then re-run to continue), exit 1 = hard error.

### `./scripts/pr-wait-checks.sh <branch> <owner/repo>`
Block on `gh pr checks --watch` until every check finishes. Exits non-zero if any check fails. A PR with no checks configured counts as passed.

### `./scripts/pr-merge.sh <branch> <owner/repo>`
Merge the PR (merge commit) and delete the remote branch. Only run once mergeable and all checks pass.

## How It Works

### Workspace clone handling
In a workspaced tab, `origin` already points at GitHub over HTTPS — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote.sh` just reads it directly; no remote detection is needed.

### Authentication inside a sandboxed workspace
`git push` and `gh` (`pr-create-pr.sh`, `pr-merge.sh`) authenticate via `GH_TOKEN`, injected into the sandboxed workspace's environment from `.janissary/github-token` (a scoped, user-provisioned fine-grained PAT — see README's "GitHub push/PR access"). The workspace clone's local `credential.helper` (`!gh auth git-credential`) picks up that same token for `git push`. Without a token configured, these scripts fail from inside a sandboxed workspace (SSH auth is unreachable there, and there's no other credential path in) but work as before outside a workspace or with sandboxing disabled.

### No interactive prompts
All scripts use non-interactive `git` and `gh` commands, so they run without approval prompts.

### Error handling
Scripts exit non-zero on failure (no changes, commit/push/PR failure, failing checks, conflicts), so the orchestrator can stop and report rather than merging a bad PR.

## Troubleshooting

### "gh: command not found"
Scripts fall back to `/usr/local/opt/gh/bin/gh`. Otherwise check `which gh` and `gh auth status`.

### Merge conflicts
`pr-merge-to-master.sh` stops on `CONFLICTING` and leaves the PR open. Run `./scripts/pr-rebase.sh <remote> <branch>`; if it stops with exit 2, resolve the listed files' markers and re-run it until it exits 0. Then re-run `./scripts/pr-wait-checks.sh` and `./scripts/pr-merge.sh`.
