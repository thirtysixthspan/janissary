# Open a Feature Pull Request

Your job: take the uncommitted work in this repository, package it into a well-described pull request against `master` on GitHub, and open it. **Do not merge the PR** — just open it with a thorough description so reviewers understand exactly what changed and why.

**Do not ask the user for input at any point.** Make all decisions autonomously — branch name, commit message, PR title and body. The only valid reason to stop is "No changes to open a PR for" (Step 0) or an unresolvable error.

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

## Step 3 — Commit the changes (conventional commits message, **no co-authors**)

Write **one** commit. The subject line must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification (see [`ai/guidelines/conventional-commits.md`](../guidelines/conventional-commits.md)): `<type>[optional scope]: <description>`. Valid types: `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, `revert`. Include a body explaining *what* changed and *why*. `pr-commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
./scripts/run.mjs pr-commit "feat(ui): add unread badge on inactive tabs" \
  "When a background tab receives new transcript content (messages, command output, shell completion), a sparkle badge appears on the tab strip. Focusing the tab clears it. Covers all content-delivery paths (append, finishRunning, shell onDone) and all activation paths (click, next, reorderTab, closeTab)."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. The commit must have a single author and no co-authors.

If earlier commits already exist on the branch, consolidate so the **final** state is a clean history with **no** co-author (amend as needed).

---

## Step 4 — Resolve the GitHub remote and push the branch

`origin` always points at GitHub — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote` reads it and prints the values later steps need:

```bash
./scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those three values directly from the command's stdout output. Each Bash command runs in its own fresh shell with no state persisted from the previous one, so do not reference them as shell variables in later commands — substitute the actual literal values you read into each subsequent command:

```bash
./scripts/run.mjs pr-push-branch origin my-branch-name
```

---

## Step 5 — Write the PR body

Write the full PR body to `./temp/pr-body.md` following the structure at the top of this document:

1. **What** — 3-5 paragraphs
2. **Behavior examples** — CLI transcripts or user flows
3. **How to verify** — concrete manual verification steps
5. **Files changed** — grouped summary

Use natural line breaks — never wrap lines at a fixed column.

---

## Step 6 — Open the PR against `master`

Use the commit subject (which follows Conventional Commits format) as `<title>`. The PR title must match the commit subject and therefore also follows the Conventional Commits specification. Substitute the actual `OWNER_REPO` and `BRANCH` values you read in Step 4, and pass the body file:

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
