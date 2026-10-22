# Open a Feature Pull Request

Your job: take the uncommitted work in this repository, package it into a well-described pull request against `master` on GitHub, and open it. **Do not merge the PR** — just open it with a thorough description so reviewers understand exactly what changed and why.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Do not ask the user for input at any point.** Make all decisions autonomously — branch name, commit message, PR title and body. The only valid reason to stop is "No changes to open a PR for" (Step 0) or an unresolvable error.

## The PR description

The PR body is the deliverable. It must be **thorough and self-contained** — a reviewer should understand the feature without reading the code. Write it to `./temp/pr-body.md`, then pass that file to the create-PR script.

The body must include **every section below**, in this order:

### What

One or two sentence that describes the feature. This is the TLDR.

Three to five paragraphs explaining the feature. Cover:
- What the feature does from the user's perspective
- What problem it solves or workflow it enables
- Which parts of the system it touches (server, web, both) and at a high level how it fits into the architecture
- Any design decisions worth calling out (e.g. "we chose a ref pattern instead of lifting state because…")

### Behavior examples

Show the feature in action. Use **CLI transcripts** (for CLI/server features) or **reproducible user flows** (for UI features):

```
# Before — the old behavior, if applicable
$ some-command --flag
<output showing the old/wrong/missing behavior>

# After — the new behavior
$ some-command --flag
<output showing the new/correct behavior>
```

For UI changes, describe the flow step by step: what the user clicks, what they see, what happens next. Use ASCII diagrams when spatial relationships matter.

### Screenshots

For any feature a user can see in the web UI, screenshots of the feature in the running app, taken with the e2e browser Janissary provides (Step 7). They are committed to the feature branch under `product/screenshots/<pr-number>/<name>.png`, and the description embeds them. Each image gets a one-line caption saying what it shows and what to look at — for a before/after change, show both. Because the PR number is only known once the PR exists, Step 6 opens the PR with a placeholder for this section and Step 7 fills it in. When no screenshot was possible (no user-visible UI, no attached browser, or the app would not start), the section gives the one-line reason instead; never launch a browser of your own to get around a missing one.

### How to verify

Testing steps detailed enough that another agent, with no knowledge of this change, can drive an e2e browser against a fresh instance of the app and complete every one without asking questions. [`test-pull-request.md`](../feature/test-pull-request.md) does exactly that, and treats each step as a script to run. The section has four parts, in this order:

1. **Setup** — the state the app must be in before step 1: the launch command or the build to use, any fixture files or directories to create (with their exact names and contents), which tabs to open, and what the screen should show before the first action. Everything a step relies on is created here, in scratch state, never taken from a real project.
2. **Happy paths** — a numbered list covering every way the feature is meant to be used, including the variations a user would reach for (a single item and several, each kind of item the feature accepts, each place it can be used from).
3. **Edge cases** — a numbered list continuing the numbering, covering the known edge cases: the empty state, boundary and unexpected input, the error path and its exact message, cancelling midway, repeating the action, interaction with the neighboring features the change touches, and each case the plan or a spec calls out. Every edge case the code or the plan handles on purpose has a step; do not list cases the change does not address.
4. A closing line naming any behavior that cannot be exercised in a browser and why (for example, it needs a remote host).

Write every step in this shape:

```
N. <short title>
   Do: <the concrete actions, in order — what to click, type, or press, naming the control by its visible label, role, or tooltip, and giving the exact text typed>
   Expect: <what is visible afterwards — the exact text, element, or state, quoted where it is a message — and what must not have happened>
```

A step states its actions precisely enough to be performed without guessing ("right-click the row `notes.txt`, choose **Rename**, type `todo.txt`, press Enter") and its expected result precisely enough to be judged pass or fail without opinion ("the row now reads `todo.txt`; `notes.txt` is gone"). Never write "verify it works", "check that it looks right", or an expectation that depends on timing or an unseeded value. A step that ends the app's session (closing the last tab, quitting) says so in its title as `[session-ending]`, so it can be run on its own. Do not include secrets, tokens, or the session URL; say "the address of the instance you started."

---

## Step 0 — Confirm there are changes to ship

```bash
$janissary/scripts/run.mjs pr-check-changes
```

Prints the working-tree status and any commits ahead of `master`, and **exits non-zero** when there is nothing to ship. If it reports **"No changes to open a PR for"**, stop.

---

## Step 1 — Make the check gate pass

This is the end-of-work gate. Run the full check:

```bash
$janissary/scripts/run.mjs pr-check-gate
```

The gate runs **hard** checks only: typecheck, lint errors, tests, CSS. It does not run the advisory quality checks (complexity, duplication, dead code) — those belong to the human end-of-work gate (`npm run check:full`), not this automated step.

The hard checks **must pass**. If they fail **because of the changes**, fix the offending code and re-run until green. If you cannot get them green, **STOP** — do not open a PR on a red gate — and report exactly what failed. Never weaken a test or lint rule to make a hard check pass.

---

## Step 2 — Create a feature branch

Pick a short, **descriptive** `kebab-case` name that reflects the feature, ideally prefixed by the change area. **Choose the name yourself — do not ask the user.**

Good: `feature/unread-badge`, `cli/help-version-flags`, `ui/transcript-click-prefill`
Bad: `patch-1`, `changes`, `wip`

```bash
$janissary/scripts/run.mjs pr-create-branch <branch>
```

Any uncommitted changes carry over onto the new branch.

---

## Step 3 — Commit the changes (conventional commits message, **no co-authors**)

Write **one** commit. The subject line must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification (see [`ai/guidelines/conventional-commits.md`](../../guidelines/conventional-commits.md)): `<type>[optional scope]: <description>`. Valid types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Include a body explaining *what* changed and *why*. `pr-commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
$janissary/scripts/run.mjs pr-commit "feat(ui): add unread badge on inactive tabs" \
  "When a background tab receives new transcript content (messages, command output, shell completion), a sparkle badge appears on the tab strip. Focusing the tab clears it. Covers all content-delivery paths (append, finishRunning, shell onDone) and all activation paths (click, next, reorderTab, closeTab)."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. The commit must have a single author and no co-authors.

If earlier commits already exist on the branch, consolidate so the **final** state is a clean history with **no** co-author (amend as needed).

---

## Step 4 — Resolve the GitHub remote and push the branch

`origin` always points at GitHub — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote` reads it and prints the values later steps need:

```bash
$janissary/scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those three values directly from the command's stdout output. Each Bash command runs in its own fresh shell with no state persisted from the previous one, so do not reference them as shell variables in later commands — substitute the actual literal values you read into each subsequent command:

```bash
$janissary/scripts/run.mjs pr-push-branch origin my-branch-name
```

---

## Step 5 — Write the PR body

Write the full PR body to `./temp/pr-body.md` following the structure at the top of this document:

1. **Summary** - 1-2 sentences
2. **What** — 3-5 paragraphs
3. **Behavior examples** — CLI transcripts or user flows
4. **Screenshots** — for now only the line `_Screenshots are added in a follow-up commit once the PR number is known._`; Step 7 replaces it
5. **How to verify** — Setup, Happy paths, and Edge cases in the Do/Expect shape described above. Write them from the plan, the specs the change touches, and the diff, then check each one against the code: every control, label, command, and message a step names must exist exactly as written

Use natural line breaks — never wrap lines at a fixed column.

---

## Step 6 — Open the PR against `master`

Use the commit subject (which follows Conventional Commits format) as `<title>`. The PR title must match the commit subject and therefore also follows the Conventional Commits specification. Substitute the actual `OWNER_REPO` and `BRANCH` values you read in Step 4, and pass the body file:

```bash
$janissary/scripts/run.mjs pr-create-pr owner/repo my-branch-name "<title>" ./temp/pr-body.md
```

Record the PR number and URL that the command prints; Step 7 needs the number.

---

## Step 7 — Capture screenshots and add them to the PR

Screenshots come from the e2e browser Janissary attaches to a tab launched with `-b`. Read [`ai/guidelines/sandbox-e2e-browser.md`](../../guidelines/sandbox-e2e-browser.md) first; it explains the connection and lifecycle rules this step depends on.

**Decide whether it is possible.** It is when all three hold: the feature has an effect visible in the web UI; both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are set (print only whether each exists, never the endpoint); and the start task can build and start the app here. If any fails, skip the rest of this step, replace the placeholder line in `./temp/pr-body.md` with the one-line reason, update the PR description with it (`gh pr edit <number> -R OWNER_REPO --body-file ./temp/pr-body.md`), and go to Step 8. A skipped screenshot is never a reason to stop.

**Start a scratch instance.** Execute the start task with `./temp/pr-screenshots/` as the scratch root: the project's own `ai/tasks/workspace/start-application.md` when it has one, otherwise `$janissary/ai/tasks/workspace/start-application.md`. Never drive the human's live Janissary session.

**Drive the feature and take the shots.** Write one driver under `./temp/pr-screenshots-drivers/` (outside the scratch root, which the stop task deletes) that walks the feature the way a user would, calling `shot(name)` at each point worth showing: the state before, the interaction, the result. Use short kebab-case names. Keep it to the few shots that explain the feature — typically two to five. Run it as one batch (each `chromium.connect()` is its own session and the app exits about a second after its last client leaves, so everything happens inside this one driver):

```bash
$janissary/scripts/run.mjs e2e-driver ./temp/pr-screenshots-drivers/feature.mjs \
  --log <project-dir>/.janissary/log/server.log --scratch ./temp/pr-screenshots --out feature
```

Open every image with the Read tool and confirm it actually shows the feature — a blank page, a login screen, or an error toast is a failed shot: fix the driver and rerun, or drop that shot and say why in the PR body.

**Place the images.** Copy each accepted shot from the scratch root to `./product/screenshots/<pr-number>/<name>.png`, using the PR number from Step 6 (`mkdir -p` the directory first). The images are committed with the feature branch, so only ever capture a scratch instance whose state you created — no real project data, tokens, or secrets in frame.

**Tear down.** Execute the stop task with the same scratch root (the project's own `ai/tasks/workspace/stop-application.md` when it has one, otherwise `$janissary/ai/tasks/workspace/stop-application.md`). `no running janus instance` is the normal outcome after a driver finishes. Then remove `./temp/pr-screenshots-drivers/`. Nothing under `./temp/` is ever committed.

---

**Commit and push the images.** The images go on the feature branch as a second commit, with a Conventional Commits subject and no co-authors (the one-commit rule in Step 3 covers the feature change; this commit holds only screenshots, and the PR is squash-merged):

```bash
$janissary/scripts/run.mjs pr-commit "docs: add screenshots for #<pr-number>"
$janissary/scripts/run.mjs pr-push-branch origin my-branch-name
```

**Embed them in the description.** The branch is deleted after merge, so link by the pushed commit's SHA, which keeps the images resolvable (`git rev-parse HEAD`). Replace the placeholder line in `./temp/pr-body.md` with one captioned image per shot:

```
![<caption>](https://github.com/OWNER_REPO/blob/<sha>/product/screenshots/<pr-number>/<name>.png?raw=true)
```

then update the PR:

```bash
gh pr edit <pr-number> -R OWNER_REPO --body-file ./temp/pr-body.md
```

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Branch:         <branch>
PR:             <url> (#<number>)
Check gate:     pass (warnings allowed) | see errors above
Screenshots:    <count> in product/screenshots/<pr-number>/ and the PR body | none — <reason>
Status:         open
```

Keep it brief. Done.
