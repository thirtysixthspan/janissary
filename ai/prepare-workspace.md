# Prepare Workspace

---

## Step 1 — Pull latest changes

1. Run `git checkout master` to switch to the primary branch.
2. Run `git pull origin master` to fetch the latest commits.

---

## Step 2 — Install dependencies

Run `npm install` (a full install, with scripts) to ensure dependencies are up to date before doing anything else. This links every `node_modules/.bin` binary (vitest, tsc, eslint, …) and runs the install scripts for the packages that need them (esbuild, node-pty, unrs-resolver).

Playwright browsers are never downloaded by `npm install` — they only download via an explicit `npx playwright install`, so do not run that in a workspace.

---
