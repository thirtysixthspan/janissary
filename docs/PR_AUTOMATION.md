# PR Automation for AI Tasks

This project includes scripts to automate the PR workflow for AI-generated code changes, eliminating manual approval requirements.

## Quick Start

After an AI task (like `improve-quality` or `improve-style`) completes with code changes:

```bash
npm run pr:land-task improve-quality "Extract formatting helpers"
```

This single command:
1. ✅ Verifies there are changes
2. ✅ Runs `npm run check` (optional: use `--skip-check` to skip)
3. ✅ Commits with `AI-Task:` trailer
4. ✅ Resolves GitHub remote (handles workspace clones)
5. ✅ Pushes branch to GitHub
6. ✅ Creates PR with task info
7. ✅ Polls merge status
8. ✅ Reports final status

## Individual Scripts

If you need finer control, individual scripts are available:

### `npm run pr:check-changes`
Verify uncommitted changes or commits ahead of master exist.

```bash
npm run pr:check-changes
```

### `npm run pr:commit <task-name> <subject> [body]`
Stage all changes and commit with `AI-Task:` trailer.

```bash
npm run pr:commit improve-quality "Extract formatting helpers" "Moved flattenBuffer and helpers to new module"
```

### `npm run pr:resolve-remote`
Resolve GitHub remote and output environment variables. Handles both direct GitHub remotes and workspace clones (where `origin` points to local repo).

```bash
npm run pr:resolve-remote
# Output:
# GH_REMOTE=github
# OWNER_REPO=user/repo
# BRANCH=quality/extract-helpers
# GH_URL=https://github.com/user/repo.git
```

### `npm run pr:push [remote] [branch]`
Push branch to GitHub with upstream tracking.

```bash
npm run pr:push origin quality/extract-helpers
```

### `npm run pr:create <owner/repo> <branch> <title> [body]`
Create PR with title and optional body.

```bash
npm run pr:create user/repo quality/extract-helpers "Extract formatting helpers"
```

### `npm run pr:check-mergeable <branch> <owner/repo>`
Poll merge status (6 attempts, 2-second intervals).

```bash
npm run pr:check-mergeable quality/extract-helpers user/repo
# Output: MERGEABLE, CONFLICTING, or UNKNOWN
```

## Examples

### Full automated workflow for improve-quality task
```bash
npm run pr:land-task improve-quality "Extract tab formatting functions"
```

### Skip the check gate if pre-existing issues exist
```bash
npm run pr:land-task improve-style "Modernize color notation" --skip-check
```

### Manual step-by-step workflow
```bash
# 1. Check changes
npm run pr:check-changes

# 2. Commit
npm run pr:commit improve-quality "Extract helpers"

# 3. Get remote info
npm run pr:resolve-remote > /tmp/env.sh && source /tmp/env.sh

# 4. Push
npm run pr:push $GH_REMOTE $BRANCH

# 5. Create PR
npm run pr:create $OWNER_REPO $BRANCH "Extract helpers"

# 6. Check merge status
npm run pr:check-mergeable $BRANCH $OWNER_REPO
```

## How It Works

### Workspace Clone Handling
When running in a workspaced AI task environment:
- `origin` points to the local root repo, not GitHub
- Scripts automatically detect this and resolve the real GitHub remote
- A `github` remote is added pointing to the actual GitHub URL

### No Manual Approval
All scripts use standard git and gh commands that don't require interactive approval:
- ✅ `git` commands (commit, push, checkout)
- ✅ `gh` CLI commands (pr create, pr view)
- ✅ No confirmation prompts

### Error Handling
Scripts exit with non-zero status on failure:
- No changes to commit → exit 1
- Commit failed → exit 1
- Push failed → exit 1
- PR creation failed → exit 1

## Integration with AI Tasks

These scripts are designed to work with AI task files in `/ai/` directory. After an AI task like `improve-quality` completes with changes, run:

```bash
npm run pr:land-task improve-quality "Your PR Title"
```

The script will:
1. Commit changes with `AI-Task: improve-quality` trailer
2. Create feature branch (auto-generated from task name + PR title)
3. Push and create PR
4. Report final status

## Troubleshooting

### "gh: command not found"
Scripts check standard locations. If gh isn't found:
```bash
which gh
# Or check /usr/local/opt/gh/bin/gh
```

### PR creation fails
Verify gh authentication:
```bash
gh auth status
gh auth login  # if needed
```

### Merge conflicts
Scripts currently exit with error if conflicts are detected. Manual resolution required via git rebase.

## Future Enhancements

- [ ] Auto-resolve simple conflicts via rebase
- [ ] Support for different base branches (not just master)
- [ ] Automerge option when PR is mergeable
- [ ] Integration with GitHub Actions for CI/CD
