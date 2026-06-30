#!/bin/bash
# Push branch to GitHub remote
# Usage: pr-push-branch.sh [GH_REMOTE] [BRANCH]

GH_REMOTE="${1:-origin}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"

git push -u "$GH_REMOTE" "$BRANCH" 2>&1
