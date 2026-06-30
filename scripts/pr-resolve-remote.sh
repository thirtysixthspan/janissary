#!/bin/bash
# Resolve GitHub remote (handle both direct GitHub and local workspace clones)
# Outputs: GH_REMOTE, OWNER_REPO, BRANCH as environment variables

origin_url=$(git remote get-url origin)
if echo "$origin_url" | grep -q github.com; then
  GH_REMOTE=origin
else
  gh_url=$(git -C "$origin_url" remote get-url origin)
  git remote add github "$gh_url" 2>/dev/null || git remote set-url github "$gh_url"
  GH_REMOTE=github
fi

GH_URL=$(git remote get-url "$GH_REMOTE")
OWNER_REPO=$(echo "${GH_URL%.git}" | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#')
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "GH_REMOTE=$GH_REMOTE"
echo "OWNER_REPO=$OWNER_REPO"
echo "BRANCH=$BRANCH"
echo "GH_URL=$GH_URL"
