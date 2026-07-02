# Open a Feature Pull Request

Your job: take the uncommitted work in this repository, package it into a well-described pull request against `master` on GitHub, and open it. **Do not merge the PR** — just open it with a thorough description so reviewers understand exactly what changed and why.

## The PR description

The PR body is the deliverable. It must be **thorough and self-contained** — a reviewer should understand the feature without reading the code. Write it to `./temp/pr-body.md`, then pass that file to the create-PR script.

The body must include **every section below**, in this order:

### What

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

If the PR introduces or changes **any visual surface** — a new tab type, a widget, a badge, a style change, a layout — include screenshots. Capture them from the running app and commit the image files alongside the code.

**Capture each screenshot in these exact steps:**

1. Start the app in a background process so it stays running while you capture:

   ```bash
   npm start &
   ```

   Wait a few seconds for the browser window to open and the server to settle. (If `npm start` opens the default OS browser, the window will be visible and capturable.)

2. Use the app to get into the state you want to show — run commands, open tabs, trigger the feature — so the window reflects exactly what the reviewer needs to see.

3. Capture the window with macOS `screencapture`:

   ```bash
   # Capture the full Chrome window (interactive — click the window):
   screencapture -w temp/screenshot-feature-name.png

   # Or capture just the app content area by selecting a region:
   screencapture -s temp/screenshot-feature-name.png
   ```

   - `-w` lets you click the target window (Chrome showing Janissary).
   - `-s` lets you drag a rectangle over the region you want.
   - On Linux use `import` (ImageMagick) or `gnome-screenshot -w`; on Windows use the Snipping Tool or `Win+Shift+S`.

   Save each screenshot under `temp/` with a descriptive kebab-case name (`temp/screenshot-unread-badge.png`, `temp/screenshot-tab-strip.png`).

4. Kill the background server when you have all the shots:

   ```bash
   kill %1
   ```

5. Commit the screenshot files along with the code changes. Reference them in the PR body with Markdown image syntax — use a relative path that resolves when viewing the PR on GitHub:

   ```markdown
   ![tab strip with unread badge sparkle](../blob/<branch>/temp/screenshot-unread-badge.png)
   ```

**If you cannot capture screenshots** (headless environment, no display server): note that under this section with "No display available — screenshots omitted" and describe the visual change in words, including CSS classes, colors, layout changes, and which elements appear or move.

### How to verify

A short list of manual verification steps a reviewer can follow. Keep each step concrete and testable — "open the app, run `foo`, confirm you see `bar`" rather than "make sure it works." Include edge cases: empty states, error paths, interactions with existing features.

### Files changed

A concise summary of every file touched, grouped by area (`src/`, `web/src/`, `web/src/theme.css`, tests), with a one-line description of what changed in each.

---

## Step 0 — Confirm there are changes to ship

```bash
./scripts/run.mjs pr-check-changes
```

Prints the working-tree status and any commits ahead of `master`, and **exits non-zero** when there is nothing to ship. If it reports **"No changes to open a PR for"**, stop.

---

## Step 1 — Make the check gate pass

This is the end-of-work gate. Run the full check:

```bash
./scripts/run.mjs pr-check-gate
```

The gate runs **hard** checks (typecheck, lint errors, tests, CSS) and **advisory** quality checks (complexity, duplication, dead code). **Warnings do not fail the gate** — only hard errors do.

The hard checks **must pass**. If they fail **because of the changes**, fix the offending code and re-run until green. If you cannot get them green, **STOP** — do not open a PR on a red gate — and report exactly what failed. Never weaken a test or lint rule to make a hard check pass.

---

## Step 2 — Create a feature branch

Pick a short, **descriptive** `kebab-case` name that reflects the feature, ideally prefixed by the change area. **Choose the name yourself — do not ask the user.**

Good: `feature/unread-badge`, `cli/help-version-flags`, `ui/transcript-click-prefill`
Bad: `patch-1`, `changes`, `wip`

```bash
./scripts/run.mjs pr-create-branch <branch>
```

Any uncommitted changes carry over onto the new branch.

---

## Step 3 — Commit the changes (descriptive message, **no co-authors**)

Write **one** commit with a descriptive subject and a body explaining *what* changed and *why*. `pr-commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
./scripts/run.mjs pr-commit "Add unread badge on inactive tabs" \
  "When a background tab receives new transcript content (messages, command output, shell completion), a sparkle badge appears on the tab strip. Focusing the tab clears it. Covers all content-delivery paths (append, finishRunning, shell onDone) and all activation paths (click, next, reorderTab, closeTab)."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. The commit must have a single author and no co-authors.

If earlier commits already exist on the branch, consolidate so the **final** state is a clean history with **no** co-author (amend as needed).

---

## Step 4 — Resolve the GitHub remote and push the branch

`pr-resolve-remote` exposes the real GitHub remote as `github` and prints variables:

```bash
./scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `GH_REMOTE OWNER_REPO BRANCH GH_URL`. Read those four values directly from the command's stdout output. Each Bash command runs in its own fresh shell with no state persisted from the previous one, so do not reference them as shell variables (`$GH_REMOTE`) in later commands — substitute the actual literal values you read into each subsequent command:

```bash
./scripts/run.mjs pr-push-branch origin my-branch-name
```

---

## Step 5 — Write the PR body

Write the full PR body to `./temp/pr-body.md` following the structure at the top of this document:

1. **What** — 3-5 paragraphs
2. **Behavior examples** — CLI transcripts or user flows
3. **Screenshots** — for any visual change, follow the capture steps above (start the app, set up the state, `screencapture -w`, kill the server, commit the PNGs). If headless, note "No display available — screenshots omitted" and describe the UI in words.
4. **How to verify** — concrete manual verification steps
5. **Files changed** — grouped summary

Use natural line breaks — never wrap lines at a fixed column.

---

## Step 6 — Open the PR against `master`

Use the commit subject as `<title>`. Substitute the actual `OWNER_REPO` and `BRANCH` values you read in Step 4, and pass the body file:

```bash
./scripts/run.mjs pr-create-pr owner/repo my-branch-name "<title>" ./temp/pr-body.md
```

Record the PR number and URL that the command prints.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Branch:         <branch>
PR:             <url> (#<number>)
Check gate:     pass (warnings allowed) | see errors above
Status:         open
```

Keep it brief. Done.
