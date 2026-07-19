# Improve code base

Your job: improves this codebase in a single run: **inspect** the code, **select** the single most valuable improvement, **execute** the matching task playbook, **verify** the result, and **ship it to `master` through a full pull request**. You own the judgment around it: what to work on and whether the result is genuinely good.

The improvement work itself follows one of these existing single-purpose task playbooks — you pick the right one and execute it yourself, inline, in this same session:

| Signal you see when inspecting | Task to execute |
| --- | --- |
| A `max-lines` error, or a high FTA score on a long file | [`improve-modularity.md`](improve-modularity.md) |
| A `sonarjs/cognitive-complexity` warning on a function | [`reduce-complexity.md`](reduce-complexity.md) |
| A flat cluster of files sharing a naming prefix (`src/acp-*`, `src/agent-*`, …) | [`improve-namespacing.md`](improve-namespacing.md) |
| Knip reports unused files / exports / dependencies | [`remove-deadcode.md`](remove-deadcode.md) |
| jscpd reports a duplicated block | [`remove-duplication.md`](remove-duplication.md) |
| Coverage is below threshold on a testable file | [`improve-test-coverage.md`](improve-test-coverage.md) |
| `npm audit` / security tooling reports a patchable advisory | [`improve-security.md`](improve-security.md) |
| stylelint reports a CSS issue | [`improve-style.md`](improve-style.md) |
| `npm outdated` lists a safe-looking package update | [`update-package.md`](update-package.md) |

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. The only reasons to stop early are the ones listed in "When to stop" below.

---

## Step 0 — Prepare the workspace

Execute [`prepare-workspace.md`](prepare-workspace.md) in full before doing anything else.

Then establish a clean starting point:

```bash
git status
```

The working tree **must be clean** before you start. If it is not, STOP and report — do not start on top of uncommitted changes you did not make.

---

## Step 1 — Inspect the code

Run the diagnostics fresh:

```bash
npm run typecheck 2>&1
npm run lint 2>&1
npm run quality 2>&1
npm run duplication 2>&1
npm run knip 2>&1
npm run lint:css 2>&1
npm outdated 2>&1
```

- Read the signals into the selection table at the top of this file: FTA scores and `max-lines` from `quality`/`lint`, `cognitive-complexity` warnings from `lint`, clones from `duplication`, unused code from `knip`, coverage gaps (run `npm run coverage 2>&1` when test-coverage is a candidate), CSS issues from `lint:css`, prefix clusters from the file layout under `src/`, and outdated packages from `npm outdated` (`npm outdated` exits non-zero when it lists anything — that's expected, not a broken tree).

Record the specific number for whatever you're about to target (the FTA score, the complexity value, the clone count, etc.) — this is the **before** value you will compare against in Step 4.

## Step 2 — Select exactly one improvement

Choose the **single** highest-value improvement:

1. Rank the live signals by impact. A `max-lines` **error** (blocks the build gate) outranks a mere warning; a high-severity `npm audit` advisory outranks a cosmetic CSS nit; a large clone or a badly over-limit complexity function outranks a marginal one.
2. If **no** signal points to a worthwhile, safe improvement — every candidate is blocked or trivial — **stop** (see "When to stop").

State your pick in one sentence: the task playbook, the target file/function, and the before-number.

## Step 3 — Execute the chosen playbook yourself

Follow [`ai/tasks/<task>.md`](.) for the task you picked in Step 2, in full. 

## Final report

Print a short summary:

```
Improvement run

Task:      reduce-complexity
Target:    src/foo.ts parseConfig()
Metric:    cc 30 -> 12
Outcome:   merged
PR:        #123
```

Include the metric before→after, the outcome (`merged`, `reverted`, or `open (not merged)`), and the PR URL if one was opened. If the run stopped early (no candidate found, broken tree, or reverted change), say so plainly and note what a human should look at next. Keep the report brief. Done.
