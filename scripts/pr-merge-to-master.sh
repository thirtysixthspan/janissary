#!/bin/bash
# Package the current changes into a PR against master and merge it once there
# are no conflicts and all checks pass. Automates ai/merge-change-to-master.md.
#
# Usage:
#   ./scripts/pr-merge-to-master.sh "Extract formatting helpers"
#   ./scripts/pr-merge-to-master.sh "Modernize colors" style/modern-colors
#   ./scripts/pr-merge-to-master.sh "Quick fix" --no-check
#
# Arguments:
#   PR_TITLE    - Title for the PR (also the commit subject)
#   BRANCH      - (optional) explicit branch name; default derived from the title
#   --no-check  - skip the npm run check gate (use only for pre-existing red)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <pr-title> [branch] [--no-check]"
  exit 1
fi

PR_TITLE="$1"
shift
RUN_CHECK=true
EXPLICIT_BRANCH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-check) RUN_CHECK=false ;;
    -*) echo "Unknown option: $1"; exit 1 ;;
    *) EXPLICIT_BRANCH="$1" ;;
  esac
  shift
done

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//'
}

# Step 0 — confirm there are changes to ship
echo "==> Checking for changes..."
if ! "$SCRIPT_DIR/pr-check-changes.sh"; then
  echo "Nothing to do."
  exit 0
fi

# Step 1 — full check gate
if [[ "$RUN_CHECK" == "true" ]]; then
  echo "==> Running the check gate..."
  if ! "$SCRIPT_DIR/pr-check-gate.sh"; then
    echo "ERROR: the check gate is red — not opening a PR. Fix it or pass --no-check." >&2
    exit 1
  fi
fi

# Step 2 — feature branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ -n "$EXPLICIT_BRANCH" ]]; then
  BRANCH="$EXPLICIT_BRANCH"
elif [[ "$CURRENT_BRANCH" != "master" ]]; then
  BRANCH="$CURRENT_BRANCH"
else
  BRANCH="$(slugify "$PR_TITLE")"
fi
if [[ "$BRANCH" != "$CURRENT_BRANCH" ]]; then
  echo "==> Creating branch $BRANCH..."
  "$SCRIPT_DIR/pr-create-branch.sh" "$BRANCH"
fi

# Step 3 — commit (no co-authors), only if there is something uncommitted
if [[ -n "$(git status --porcelain)" ]]; then
  echo "==> Committing changes..."
  "$SCRIPT_DIR/pr-commit.sh" "$PR_TITLE"
fi

# Step 4 — resolve GitHub remote and push
echo "==> Resolving GitHub remote..."
eval "$("$SCRIPT_DIR/pr-resolve-remote.sh")"
echo "    remote: $GH_REMOTE -> $OWNER_REPO ; branch: $BRANCH"
echo "==> Pushing branch..."
"$SCRIPT_DIR/pr-push-branch.sh" "$GH_REMOTE" "$BRANCH"

# Step 5 — open the PR
echo "==> Creating PR..."
PR_BODY=$(cat <<EOF
## What
$PR_TITLE

## Notes
- \`npm run check\` passes.
EOF
)
PR_URL=$("$SCRIPT_DIR/pr-create-pr.sh" "$OWNER_REPO" "$BRANCH" "$PR_TITLE" "$PR_BODY")
echo "    $PR_URL"

# Step 6 — conflict status
echo "==> Checking merge status..."
MERGEABLE=$("$SCRIPT_DIR/pr-check-mergeable.sh" "$BRANCH" "$OWNER_REPO")
echo "    mergeable: $MERGEABLE"

report() {
  echo "=========================================="
  echo "Branch:     $BRANCH"
  echo "PR:         $PR_URL"
  echo "Conflicts:  $1"
  echo "PR checks:  $2"
  echo "Status:     $3"
  echo "=========================================="
}

if [[ "$MERGEABLE" != "MERGEABLE" ]]; then
  report "conflicts ($MERGEABLE)" "not run" "open (resolve conflicts: ./scripts/pr-rebase.sh \"$GH_REMOTE\" \"$BRANCH\")"
  exit 1
fi

# Step 8 — wait for all checks to pass
echo "==> Waiting for checks..."
if ! "$SCRIPT_DIR/pr-wait-checks.sh" "$BRANCH" "$OWNER_REPO"; then
  report "none" "failed" "open (checks failed — see output above)"
  exit 1
fi

# Step 9 — merge
echo "==> Merging PR..."
if ! "$SCRIPT_DIR/pr-merge.sh" "$BRANCH" "$OWNER_REPO"; then
  report "none" "passed" "open (merge failed — see output above)"
  exit 1
fi

report "none" "passed" "merged"
