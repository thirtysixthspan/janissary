# AI workflow scripts should pull latest changes from master

**Complexity: 1/10** — add a `git pull` step at the top of both `ai/` workflow scripts.

## Goal

When `ai/build-a-feature.md` or `ai/fix-a-small-issue.md` is executed, the first thing they do should be to pull the latest changes from the primary branch so the agent works against the most current codebase.

## Background

Both scripts currently start with "Install dependencies" as Step 1. If the workspace clone is stale, the agent may work on outdated code, create merge conflicts, or miss upstream changes. Adding a `git pull origin master` before `npm install --ignore-scripts` ensures a fresh starting point.

## Implementation

1. **`ai/build-a-feature.md`**: Insert a "Pull latest changes" step before the existing "Install dependencies" step. Step becomes Step 1 (pull), former Step 1 renumbers to Step 2, subsequent steps renumber accordingly.

2. **`ai/fix-a-small-issue.md`**: Same change — insert pull step at the beginning.

## Tests

No code tests needed — these are procedural instructions for the AI, not source code.

## Out of scope

- Changing any other part of the workflow scripts.
- Changing any source code, tests, or specs.
