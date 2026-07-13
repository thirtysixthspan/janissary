#!/bin/bash
# Push branch to GitHub remote
# Usage: pr-push-branch.sh [GH_REMOTE] [BRANCH]
#
# GitHub sometimes rejects the initial push with an HTTP 400 RPC error
# ("unexpected disconnect while reading sideband packet") on larger pushes.
# Raising http.postBuffer and forcing HTTP/1.1 clears it, so when the first
# attempt fails we apply those transport mitigations and retry.

GH_REMOTE="${1:-origin}"
BRANCH="${2:-$(git rev-parse --abbrev-ref HEAD)}"

git push -u "$GH_REMOTE" "$BRANCH" 2>&1 && exit 0

echo "push failed — applying HTTP transport mitigations (http.postBuffer + HTTP/1.1) and retrying"
git config http.postBuffer 524288000
git config http.version HTTP/1.1

for attempt in 1 2 3; do
  git push -u "$GH_REMOTE" "$BRANCH" 2>&1 && exit 0
  echo "push retry $attempt failed"
done

exit 1
