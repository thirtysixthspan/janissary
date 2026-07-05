#!/bin/bash
# Read the GitHub remote info needed by the PR pipeline.
# Outputs: OWNER_REPO, BRANCH, GH_URL as a space-separated line.

GH_URL=$(git remote get-url origin)
OWNER_REPO=$(echo "${GH_URL%.git}" | sed -E 's#.*[:/]([^/]+/[^/]+)$#\1#')
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "$OWNER_REPO $BRANCH $GH_URL"
