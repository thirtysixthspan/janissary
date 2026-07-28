# Find Namespaces

Your job: read the layout of `src/` and find flat clusters of files that share a naming prefix and belong in a namespace directory of their own, then log each cluster as a new entry under the `## development` section of `product/backlog/technical-debt.md`. This task **researches and records** namespacing opportunities. It never moves a file, never renames one, and never touches an import. Resolving what lands here belongs to [`improve-namespacing.md`](../hygiene/improve-namespacing.md), and every entry you write says so explicitly.

The goal is the same as `improve-namespacing.md`: a group like `src/acp-loop.ts`, `src/acp-manager.ts`, `src/acp-runner.ts` reads better as `src/acp/loop.ts`, `manager.ts`, `runner.ts`, because the directory carries the namespace and each filename drops the redundant prefix. The difference is the output. That task performs one move per run and verifies it. This task performs no moves at all. It writes down the candidates it found, with enough detail that whoever picks one up can go straight to the move without re-surveying the tree.

**Never run repository tools.** Do not run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run quality`, `./scripts/run.mjs check-diff`, FTA, or any other build/lint/test/analysis machinery. A namespace opportunity is visible in a directory listing, so a listing is all you need. Plain read-only shell commands used to navigate (`ls`, `find`, `grep`, `wc -l`, `git log`) are fine.

This task edits **one file only**: `product/backlog/technical-debt.md`, and only its `## development` section. You will never touch application source code, tests, specs, documentation, or config, and you will never modify the `## ready` or `## deferred` sections.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no "Generated with Claude Code" lines or badges, no AI authorship notes anywhere in the files you write. The commit's configured git author is the only authorship ever recorded.

Do the steps below **in order**. Do not skip steps. Do not invent your own process.

**Run autonomously.** Do not ask the user questions or wait for feedback at any step.

---

## Background — what makes a namespace worth logging

A prefix cluster is a naming workaround. The files already form one concern, and the shared `acp-` or `harness-` prefix is the author saying so in the only place a flat directory allows. The debt is that the grouping lives in the filenames instead of the tree, so `ls src/` grows past the point where anyone can see the structure, and every new file in the concern has to remember the prefix convention to stay with its siblings.

Two things follow from that:

- **A cluster is only debt if the files really are one concern.** Three files that start with the same word by coincidence are not a namespace. `src/git-status.ts` and `src/github-api.ts` share four letters and nothing else. Read enough of each file to be sure the group holds together before you log it.
- **Only log what `improve-namespacing.md` can actually move.** That task has a fixed set of blockers, listed in Step 3 below. A candidate that trips one of them is not a backlog item, it is a dead end that will be re-discovered and re-skipped by whoever picks it up. Filter first, log second.

Scope is `src/` only. `improve-namespacing.md` moves files in `src/` and edits import paths in `web/src/` as a consequence. It does not create namespaces under `web/src/`, so a flat cluster there is out of scope for this task.

---

## Step 0 — Prepare the workspace

This task only reads files and runs git — it never builds, tests, lints, or runs the app — so it does not need the full [`prepare-workspace.md`](../workspace/prepare-workspace.md) install. Do this instead:

1. `git checkout master` and `git pull origin master`.
2. Skip `npm install` entirely.
3. Confirm a clean starting point with `git status`.

The working tree **must be clean** — no modified *and no untracked* files. This matters more than usual here: the quick-commit step at the end stages everything with `git add -A`, so any stray file would be silently swept into this task's commit. If the tree is not clean, STOP and report what is there — do not start on top of changes you did not make.

**Command hygiene for the whole run:** run each command plainly and read its output from the result — no piping into `tail`/`head`, no `>` redirects, no `$(...)` capture. These trigger permission prompts or hook rejections in this repo (see CLAUDE.md) and cost a wasted call each time.

---

## Step 1 — Load the existing backlog

Read `product/backlog/technical-debt.md`. It has three flat sections — `## ready`, `## development`, `## deferred` — each a plain `*` bullet list with no IDs or scores.

Collect every existing bullet from all three sections into one list. This is your dedupe set. If a prefix is already logged as a namespacing candidate anywhere in the file, even worded differently, skip it this run. Also skip a prefix whose cluster is named in a bullet about something else, if moving the files would collide with that bullet's own proposal.

---

## Step 2 — Survey the tree

Count the flat source files by leading prefix, and list the namespace directories that already exist:

```bash
ls src/*.ts | grep -vE '\.test\.ts$' | sed -E 's#src/##; s#-.*##' | sort | uniq -c | sort -rn
find src -mindepth 1 -maxdepth 1 -type d -print | sort
```

Each row of the first command is a candidate: the count is how many flat source files share that prefix, and the name is the prefix. Two shapes qualify:

- **New namespace.** A prefix with **3 or more** flat source files and no `src/<prefix>/` directory yet.
- **Existing namespace.** A prefix with **any number** of flat source files where `src/<prefix>/` already exists and holds clearly related code. One stray flat file that belongs in a directory that is already there is a real, if small, opportunity.

For every candidate, list the exact files and look inside the target directory when there is one:

```bash
ls src/<prefix>-*.ts
ls src/<prefix>.ts
ls src/<prefix>/
```

The first glob matches colocated `*.test.ts` files too, and that is correct — tests move with their source, so they belong in the count you record. A bare `src/<prefix>.ts` entry file, if it exists, becomes `src/<prefix>/index.ts` in the move; note whether one exists. If the `ls` errors, there is no bare entry, and none is ever invented.

Read enough of each file to confirm the group is one concern rather than a prefix coincidence. This is a judgment call and it is the main thing this task is for.

---

## Step 3 — Filter out what cannot be moved

Cross out any candidate that trips one of `improve-namespacing.md`'s blockers. These are the same five rules that task applies, checked here so a doomed candidate never reaches the backlog:

1. **Too small for a new namespace.** Fewer than 3 flat source files and no existing `src/<prefix>/` directory. Two files do not justify creating a directory.
2. **A name collision.** Dropping the prefix would land two files on the same path, or would collide with a file already in `src/<prefix>/`. Compare your move list against `ls src/<prefix>/` before clearing this one.
3. **The move would need a logic edit.** A namespace move only relocates files and rewrites import path strings. If the group cannot move without changing behavior, exports, or signatures, drop it.
4. **`src/controller.ts` is one of the files that would move.** It is the biggest and riskiest file in the tree. A group that would relocate it is blocked. A group that controller merely *imports* is fine.
5. **A config or build file hard-codes an exact old path.** Glob patterns like `src/**/*.ts` already cover subdirectories and need no change. A literal filename does not. Check the ones that could carry a path:

   ```bash
   grep -rn "<prefix>-" package.json tsconfig.json vitest.config.ts eslint.config.mjs knip.json fta.json scripts
   ```

   A hit that names a specific file blocks the group. A hit inside a glob, a script name, or an unrelated string does not.

Also drop any candidate where the prefix is only coincidental (see Background), and any already covered by your Step 1 dedupe set.

What survives is your candidate list. Record, for each: the prefix, the flat source and test file counts, whether `src/<prefix>/` already exists, whether a bare entry file exists, and roughly how many files elsewhere import the group. That last number is the best available proxy for how disruptive the move is, and one grep gives it to you:

```bash
grep -rln "<prefix>-" src web --include=*.ts --include=*.tsx
```

---

## Step 4 — Bound the run

Cap this run at **5 new entries**. `improve-namespacing.md` resolves one group per run, so a backlog of five is already several sessions of work, and a longer list mostly goes stale as the tree shifts underneath it.

If more than five candidates survive Step 3, keep the five with the strongest case: the largest cohesive clusters, the ones in areas that `git log` shows are churning, and the ones whose target directory already exists. Do not pad the list to hit the cap.

Finding zero candidates is a valid outcome. It means the tree is already namespaced, which is the point of the exercise. Do not invent a cluster that is not there.

---

## Step 5 — Write each entry

Match the existing style in `product/backlog/technical-debt.md`: one `*` bullet, one paragraph, imperative and concrete, no IDs and no scores beyond the severity rating. Each bullet must:

- Name the prefix and the exact target directory (`src/<prefix>/`).
- Give the file counts: flat source files, colocated test files, and whether a bare `src/<prefix>.ts` entry exists.
- Say whether `src/<prefix>/` already exists, and if so, what is in it and why the flat files belong beside it.
- Say what the cluster is, in one clause, so the reader can tell it is a real concern and not a prefix coincidence.
- Note the blast radius: roughly how many files import the group and would need an import path rewrite.
- **State the resolution explicitly**: resolved by running the [`improve-namespacing.md`](../hygiene/improve-namespacing.md) task against this prefix. Every entry needs this sentence. It is what tells whoever picks the item up that the work is a scripted, mechanical move rather than a judgment call they have to design.
- Carry a severity rating.

Severity for namespacing debt sits lower than for most other technical debt, because nothing here is a bug risk. The cost is navigability and the drag on every future file added to the concern. Rate it this way:

| Severity | Meaning |
|----------|---------|
| **medium** | A large flat cluster (roughly 5 or more source files) in an area that is actively changing, so the prefix convention keeps being re-applied to new files and the flat directory keeps growing. |
| **low** | A small cluster, a quiet area, or a single stray file that belongs in a namespace directory that already exists. Worth doing, nothing is on fire. |

**high** is not available here. A namespace move never fixes a correctness problem, so it does not compete with the compounding debt that rating is for.

An entry in the right shape reads roughly like this:

```
* Move the four flat `src/widget-*.ts` files into `src/widget/`: `widget-loop.ts`, `widget-manager.ts`, `widget-runner.ts`, and `widget-tools.ts` sit in the flat `src/` root with four colocated tests and no bare `src/widget.ts` entry, carrying their grouping in a filename prefix instead of a directory. They are one concern — the widget session lifecycle — and eleven files across `src/` and `web/src/` import them, so the move is a rename plus eleven import path rewrites. `src/widget/` does not exist yet and no config file names any of the four paths literally. Resolve by running the `ai/tasks/hygiene/improve-namespacing.md` task against the `widget` prefix. Severity: **medium**.
```

---

## Step 6 — Integrate into the `## development` section

Open `product/backlog/technical-debt.md` and add your new bullets to the end of the `## development` section only. Leave `## ready` and `## deferred` exactly as they are — do not reorder, reword, or remove anything in any section, including `## development`'s existing entries.

Before moving on, verify:

1. `git status` shows `product/backlog/technical-debt.md` as the **only** changed file. No file under `src/` may appear. If one does, you moved something, which this task never does — revert it.
2. `git diff` shows the only changes are new lines appended inside `## development` — nothing removed, nothing changed elsewhere in the file.
3. Every new bullet names its target directory and says it is resolved by `improve-namespacing.md`.
4. None of the new bullets duplicate an item from Step 1's dedupe set.

If anything else changed on disk, revert it (`git checkout -- <file>`) before committing.

---

## Step 7 — Commit and push

Execute [`quick-commit.md`](../workspace/quick-commit.md) in full to commit the result on `master` and push it to the remote. Use a `chore` type subject, e.g.:

```
chore(backlog): log namespacing opportunities
```

(The workspace was checked out on `master` in Step 0, so the quick-commit push lands the change directly on `master` remote — no separate merge step is needed.)

---

## Step 8 — Report

Give the user a short report in this exact shape:

```
Prefix clusters seen:  <count from Step 2>
Blocked or skipped:    <count> (<prefix>: <one-line reason>, …)
New entries added:     <count> (to product/backlog/technical-debt.md, ## development)
Entries:               <one line per new entry: prefix, target dir, file counts, severity — or "none found">
Commit:                <short-sha> pushed to master | push failed (see above)
```

Keep it brief. Done.
