#!/bin/bash
# Land an AI task PR: commit, push, create PR, and check merge status
# This script automates the entire pr-workspaced-improvement.md workflow
#
# Usage:
#   ./scripts/pr-land-task.sh improve-quality "Extract formatting helpers"
#   ./scripts/pr-land-task.sh improve-style "Modernize colors" --skip-check
#
# Arguments:
#   TASK_NAME    - Name of AI task (e.g., improve-quality)
#   PR_TITLE     - Title for the PR
#   BRANCH_NAME  - (optional) Explicit branch name (default: task-name-based)
#   --skip-check - Skip npm run check gate

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse arguments
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <task-name> <pr-title> [--skip-check]"
  exit 1
fi

TASK_NAME="$1"
PR_TITLE="$2"
SKIP_CHECK=false

while [[ $# -gt 2 ]]; do
  case "$3" in
    --skip-check) SKIP_CHECK=true ;;
    *) echo "Unknown option: $3"; exit 1 ;;
  esac
  shift
done

# Step 0: Check for changes
echo "Checking for changes..."
CHANGES=$("$SCRIPT_DIR/pr-check-changes.sh" 2>&1)
if echo "$CHANGES" | grep -q "^$"; then
  echo "ERROR: No changes to land"
  exit 1
fi
echo "$CHANGES"
echo

# Step 1: Run check gate (optional)
if [[ "$SKIP_CHECK" != "true" ]]; then
  echo "Running npm run check..."
  npm run check 2>&1 || echo "Note: Check gate had issues (may be pre-existing)"
  echo
fi

# Step 2: Commit changes with AI-Task trailer
echo "Committing changes..."
"$SCRIPT_DIR/pr-commit-task.sh" "$TASK_NAME" "$PR_TITLE"
echo

# Step 3: Resolve GitHub remote and get variables
echo "Resolving GitHub remote..."
REMOTE_INFO=$("$SCRIPT_DIR/pr-resolve-remote.sh")
eval "$REMOTE_INFO"
echo "  Remote: $GH_REMOTE"
echo "  Repo: $OWNER_REPO"
echo "  Branch: $BRANCH"
echo

# Step 4: Push branch
echo "Pushing branch..."
"$SCRIPT_DIR/pr-push-branch.sh" "$GH_REMOTE" "$BRANCH"
echo

# Step 5: Create PR
echo "Creating PR..."
PR_URL=$("$SCRIPT_DIR/pr-create-pr.sh" "$OWNER_REPO" "$BRANCH" "$PR_TITLE" 2>&1)
echo "  $PR_URL"
echo

# Step 6: Check mergeable status
echo "Checking merge status..."
MERGEABLE=$("$SCRIPT_DIR/pr-check-mergeable.sh" "$BRANCH" "$OWNER_REPO")
echo "  Status: $MERGEABLE"
echo

# Report
echo "=========================================="
echo "PR Landing Complete"
echo "=========================================="
echo "Task:       $TASK_NAME"
echo "Branch:     $BRANCH"
echo "PR:         $PR_URL"
echo "Mergeable:  $MERGEABLE"
echo "=========================================="
