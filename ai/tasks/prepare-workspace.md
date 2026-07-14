# Prepare Workspace

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step.

**No subagents, no background agents.** Do every step yourself — never launch a subagent (Task/Agent tool, `fork`, or otherwise) to research, explore, or implement any part of this task on your behalf.

---

## Step 1 — Pull latest changes

1. Run `git checkout master` to switch to the primary branch.
2. Run `git pull origin master` to fetch the latest commits.

---

## Step 2 — Install dependencies

Run `npm install --ignore-scripts` to ensure dependencies are up to date before doing anything else. This links every `node_modules/.bin` binary (vitest, tsc, eslint, …) but skips all lifecycle scripts — including the project's own `postinstall`, which runs `npx playwright install chromium`. Never let that run in a workspace: it downloads a ~130MB browser per workspace, and the sandbox denies writes to playwright's browser cache anyway.

---

## Step 3 — Run the dependency install scripts that matter

`--ignore-scripts` above also skipped the install scripts of the three packages that genuinely need them. Run them now:

```bash
npm rebuild esbuild node-pty unrs-resolver
chmod +x node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true
```

This builds esbuild's platform binary, node-pty's native addon, and unrs-resolver's bindings — everything a full install provides except the playwright browser download.

---
