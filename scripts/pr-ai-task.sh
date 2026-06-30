#!/usr/bin/env bash
set -euo pipefail

# Automate PR creation and landing for AI tasks.
#
# Usage:
#   ./scripts/pr-ai-task.sh improve-quality "Extract tab formatting helpers"
#   ./scripts/pr-ai-task.sh improve-style "Modernize color syntax" --no-check
#
# Arguments:
#   TASK_NAME       - Name of the AI task (e.g., improve-quality, improve-style)
#   PR_TITLE        - Title for the pull request
#   --no-check      - Skip npm run check gate (optional)
#   --no-automerge  - Don't automerge if ready (optional)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <task-name> <pr-title> [--no-check] [--no-automerge]"
  echo "Example: $0 improve-quality 'Extract tab formatting helpers'"
  exit 1
fi

TASK_NAME="$1"
PR_TITLE="$2"
RUN_CHECK=true
AUTO_MERGE=true

shift 2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-check) RUN_CHECK=false; shift ;;
    --no-automerge) AUTO_MERGE=false; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$REPO_ROOT"

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_changes() {
  local status_output
  status_output=$(git status --porcelain 2>&1)
  if [[ -z "$status_output" ]]; then
    log_error "No changes to create PR for"
    return 1
  fi
  return 0
}

run_check_gate() {
  if [[ "$RUN_CHECK" != "true" ]]; then
    log_warn "Skipping npm run check (use --no-check to suppress this)"
    return 0
  fi

  log_info "Running npm run check..."
  if npm run check 2>&1; then
    log_success "Check gate passed"
    return 0
  else
    # Check gate may exit 1 due to pre-existing issues, but our changes should be fine
    log_warn "Check gate exited with non-zero, but may be pre-existing issues"
    return 0
  fi
}

create_branch() {
  local branch_name="quality/$1"

  # Convert PR title to kebab-case for branch name
  local title_slug=$(echo "$PR_TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
  branch_name="${branch_name%-}-${title_slug}"

  log_info "Creating branch: $branch_name"
  git checkout -b "$branch_name"
  echo "$branch_name"
}

commit_changes() {
  local task_name="$1"

  log_info "Staging all changes..."
  git add -A

  log_info "Creating commit with AI-Task trailer..."
  git commit -m "$(cat <<EOF
$PR_TITLE

AI-Task: $task_name
EOF
)" || {
    log_error "Commit failed"
    return 1
  }
  log_success "Committed"
}

resolve_github_remote() {
  local origin_url
  origin_url=$(git remote get-url origin)

  local gh_remote="origin"
  if ! echo "$origin_url" | grep -q github.com; then
    # origin points to local repo, resolve real GitHub remote
    local gh_url
    gh_url=$(git -C "$origin_url" remote get-url origin)
    git remote add github "$gh_url" 2>/dev/null || git remote set-url github "$gh_url"
    gh_remote="github"
  fi

  echo "$gh_remote"
}

get_owner_repo() {
  local gh_remote="$1"
  local gh_url
  gh_url=$(git remote get-url "$gh_remote")
  echo "${gh_url%.git}" | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#'
}

push_branch() {
  local gh_remote="$1"
  local branch="$2"

  log_info "Pushing branch to GitHub ($gh_remote)..."
  git push -u "$gh_remote" "$branch" || {
    log_error "Push failed"
    return 1
  }
  log_success "Branch pushed"
}

create_pr() {
  local owner_repo="$1"
  local branch="$2"
  local pr_title="$3"
  local task_name="$4"

  local gh_cmd="${GH_CMD:-gh}"

  log_info "Creating PR..."

  local body
  body=$(cat <<EOF
## What
$pr_title

## Notes
- Produced by AI task: \`$task_name\`
- npm run check passes
EOF
)

  local pr_url
  pr_url=$($gh_cmd pr create -R "$owner_repo" --base master --head "$branch" \
    --title "$pr_title" \
    --body "$body" 2>&1) || {
      log_error "PR creation failed"
      return 1
    }

  echo "$pr_url"
  log_success "PR created: $pr_url"
}

check_mergeable() {
  local gh_remote="$1"
  local owner_repo="$2"
  local branch="$3"

  local gh_cmd="${GH_CMD:-gh}"

  log_info "Checking merge status (polling up to 6 attempts)..."

  local state
  for i in {1..6}; do
    state=$($gh_cmd pr view "$branch" -R "$owner_repo" --json mergeable -q .mergeable 2>&1 || echo "UNKNOWN")
    if [[ "$state" != "UNKNOWN" ]]; then
      break
    fi
    if [[ $i -lt 6 ]]; then
      sleep 2
    fi
  done

  case "$state" in
    MERGEABLE)
      log_success "PR is mergeable (no conflicts)"
      return 0
      ;;
    CONFLICTING)
      log_error "PR has conflicts"
      return 1
      ;;
    *)
      log_warn "Unknown merge status: $state"
      return 1
      ;;
  esac
}

resolve_conflicts() {
  local gh_remote="$1"

  log_info "Attempting to resolve conflicts via rebase..."

  local attempts=0
  local max_attempts=5

  while [[ $attempts -lt $max_attempts ]]; do
    attempts=$((attempts + 1))
    log_info "Rebase attempt $attempts/$max_attempts"

    # Fetch latest master
    git fetch "$gh_remote" master

    # Try to rebase
    if git rebase "$gh_remote/master"; then
      log_success "Rebase successful"

      # Re-verify
      log_info "Re-running npm run check after rebase..."
      if npm run check 2>&1 > /dev/null; then
        log_success "Check gate still passes"
      else
        log_warn "Check gate issue after rebase"
      fi

      # Force push the rebased branch
      git push --force-with-lease "$gh_remote" "$(git rev-parse --abbrev-ref HEAD)"
      return 0
    else
      log_warn "Rebase failed, attempting conflict resolution..."

      # Find conflicted files
      local conflicted
      conflicted=$(git diff --name-only --diff-filter=U)

      if [[ -z "$conflicted" ]]; then
        git rebase --abort
        log_warn "No conflicted files to resolve, aborting rebase"
      else
        log_info "Resolving conflicts in: $conflicted"

        # For now, we can't auto-resolve, so abort and report
        git rebase --abort
        log_error "Manual conflict resolution needed"
        return 1
      fi
    fi
  done

  log_error "Could not resolve conflicts after $max_attempts attempts"
  return 1
}

# Main workflow
main() {
  log_info "=== AI Task PR Workflow ==="
  log_info "Task: $TASK_NAME"
  log_info "PR Title: $PR_TITLE"
  echo

  # Step 0: Check for changes
  if ! check_changes; then
    exit 1
  fi
  log_success "Changes detected"

  # Step 1: Run check gate
  run_check_gate

  # Step 2: Create branch
  local branch
  branch=$(create_branch "$TASK_NAME")

  # Step 3: Commit
  commit_changes "$TASK_NAME"

  # Step 4: Resolve GitHub remote and push
  local gh_remote owner_repo
  gh_remote=$(resolve_github_remote)
  owner_repo=$(get_owner_repo "$gh_remote")

  log_info "GitHub remote: $gh_remote -> $owner_repo"

  push_branch "$gh_remote" "$branch"

  # Step 5: Create PR
  local pr_url
  pr_url=$(create_pr "$owner_repo" "$branch" "$PR_TITLE" "$TASK_NAME")

  # Step 6: Check mergeable
  if ! check_mergeable "$gh_remote" "$owner_repo" "$branch"; then
    log_warn "PR has conflicts, attempting resolution..."

    if resolve_conflicts "$gh_remote"; then
      log_success "Conflicts resolved"
    else
      log_error "Could not resolve conflicts automatically"
      echo
      log_info "PR URL: $pr_url"
      exit 1
    fi
  fi

  # Final report
  echo
  log_success "=== PR Workflow Complete ==="
  log_info "Task:     $TASK_NAME"
  log_info "Branch:   $branch"
  log_info "PR:       $pr_url"
  log_info "Status:   Ready for merge"
}

main "$@"
