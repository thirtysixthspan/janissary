# Open a Plan Pull Request

Your job: take the plan-only changes in this repository — a promoted source plan in `./product/plans/complete/` and any improved subplans — and open a pull request against `master` on GitHub carrying a short summary of the plan. No implementation code exists yet, so the pull request opens without a Behavior examples, Screenshots or How to verify section; the full description is authored later by [`update-pull-request.md`](../feature/update-pull-request.md) once the work is done. **Do not merge the PR** — just open it with the short summary.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

**Do not ask the user for input at any point.** Make all decisions autonomously — branch name, commit message, PR title and body. The only valid reason to stop is "No changes to open a PR for" (Step 0) or an unresolvable error.

## The PR body

The body is a short plan summary, not a full description. Write it to `./temp/pr-body.md`, then pass that file to the create-PR script. It is exactly this shape, with no other sections:

```
### What

<the plan's own `#` title, followed by the text of its `## Goal` section>

Plan: <repo-relative path of the source plan under product/plans/complete/>

Subplans: <repo-relative path> — <title>, <repo-relative path> — <title>, …
```

`### What` carries the plan's own `#` title and its `## Goal` text. `Plan:` names the repo-relative path of the source plan under `product/plans/complete/`. `Subplans:`, when present, lists in order each subplan added from `product/plans/ready/` as `<repo-relative path> — <title>`. Omit the `Subplans:` line entirely when there are no subplans. Write no Behavior examples, Screenshots or How to verify section — there is no code or UI to describe yet, and the full four-section body is authored later by [`update-pull-request.md`](../feature/update-pull-request.md).

Use natural line breaks — never wrap lines at a fixed column.

---

## Step 0 — Confirm there are changes to ship

```bash
$janissary/scripts/run.mjs pr-check-changes
```

Prints the working-tree status and any commits ahead of `master`, and **exits non-zero** when there is nothing to ship. If it reports **"No changes to open a PR for"**, stop.

---

## Step 1 — Make the check gate pass

Run the full check:

```bash
$janissary/scripts/run.mjs pr-check-gate
```

The hard checks **must pass**. If they fail because of the changes, fix the offending files and re-run until green. If you cannot get them green, **STOP** — do not open a PR on a red gate — and report exactly what failed. Never weaken a test or lint rule to make a hard check pass.

---

## Step 2 — Create a feature branch

Pick a short, **descriptive** `kebab-case` name that reflects the plan, ideally prefixed by the change area. **Choose the name yourself — do not ask the user.**

```bash
$janissary/scripts/run.mjs pr-create-branch <branch>
```

Any uncommitted changes carry over onto the new branch.

---

## Step 3 — Commit the plan (conventional commits message, **no co-authors**)

Write **one** commit. The subject line must follow the [Conventional Commits 1.0.0](../../guidelines/conventional-commits.md) specification: `<type>[optional scope]: <description>`. Include a body explaining *what* plan is being published and *why*. `pr-commit` stages everything (`git add -A`) and commits with a **single author**:

```bash
$janissary/scripts/run.mjs pr-commit "docs: publish the plan for <feature>" \
  "Move the source plan into product/plans/complete/ and add the improved subplans so the build pipeline can open a plan-first pull request."
```

Hard rule for the commit:

- **No co-authors.** The script adds **no** `Co-Authored-By:` trailer. The commit must have a single author and no co-authors.

---

## Step 4 — Resolve the GitHub remote and push the branch

`origin` always points at GitHub — the workspace is an independent `git clone` of the root repo's `origin` remote. `pr-resolve-remote` reads it and prints the values later steps need:

```bash
$janissary/scripts/run.mjs pr-resolve-remote
```

This prints a single space-separated line: `OWNER_REPO BRANCH GH_URL`. Read those three values from stdout. Each Bash command runs in its own fresh shell with no state persisted from the previous one, so substitute the actual literal values you read into each subsequent command:

```bash
$janissary/scripts/run.mjs pr-push-branch origin my-branch-name
```

---

## Step 5 — Write the PR body

Write the short plan summary described under "The PR body" to `./temp/pr-body.md`. It carries `### What`, a `Plan:` line and an optional `Subplans:` line, and nothing else. Do not write Behavior examples, Screenshots or How to verify.

---

## Step 6 — Open the PR against `master`

Use the commit subject (which follows Conventional Commits format) as `<title>`. The PR title must match the commit subject and therefore also follows the Conventional Commits specification. That title is provisional: once implementation lands, [`update-pull-request.md`](../feature/update-pull-request.md) replaces it with a Conventional Commit subject describing the delivered work. Substitute the actual `OWNER_REPO` and `BRANCH` values you read in Step 4, and pass the body file:

```bash
$janissary/scripts/run.mjs pr-create-pr owner/repo my-branch-name "<title>" ./temp/pr-body.md
```

Record the PR number and URL that the command prints. There is no screenshot step: the plan has no UI to capture, and the Screenshots section of the final description is authored later by `update-pull-request.md` as the one-line reason no capture was possible.

---

## Step 7 — Report

Give the user a short report in this exact shape:

```
Branch:         <branch>
PR:             <url> (#<number>)
Check gate:     pass (warnings allowed) | see errors above
Body:           short plan summary — What, Plan, optional Subplans
Status:         open
```

Keep it brief. Done.
