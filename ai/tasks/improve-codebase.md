# Improve code base

Your job: act as a **supervisor** that continuously improves this codebase by running a loop. Each cycle you **inspect** the code, **select** the single most valuable improvement, **launch a subagent** to carry it out, **monitor** that subagent, **independently verify** its result, **ship it to `master` through a full pull request**, and then **start the next cycle**. You do not write the improvement yourself — you delegate it to a subagent that executes one of the existing single-purpose task playbooks, and you own the judgment around it: what to work on, whether the result is genuinely good, and when to stop.

The improvement work itself is done by one of these executable task playbooks — you pick the right one each cycle:

| Signal you see when inspecting | Task to delegate |
| --- | --- |
| A `max-lines` error, or a high FTA score on a long file | [`improve-modularity.md`](improve-modularity.md) |
| A `sonarjs/cognitive-complexity` warning on a function | [`reduce-complexity.md`](reduce-complexity.md) |
| A flat cluster of files sharing a naming prefix (`src/acp-*`, `src/agent-*`, …) | [`improve-namespacing.md`](improve-namespacing.md) |
| Knip reports unused files / exports / dependencies | [`remove-deadcode.md`](remove-deadcode.md) |
| jscpd reports a duplicated block | [`remove-duplication.md`](remove-duplication.md) |
| Coverage is below threshold on a testable file | [`improve-test-coverage.md`](improve-test-coverage.md) |
| `npm audit` / security tooling reports a patchable advisory | [`improve-security.md`](improve-security.md) |
| stylelint reports a CSS issue | [`improve-style.md`](improve-style.md) |

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task (or any subagent you launch) produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded. When you launch a subagent, include this rule in its prompt.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step, and instruct every subagent you launch to do the same. Make the best judgment call yourself, using the rules in this document, and keep going. The only reasons to stop are the ones listed in "When to stop the loop" below.

**Shell hygiene:** run every command on its own line — no `&&` chaining, no `; echo "Exit code: $?"` suffixes, no subshell captures. The exit code and output are visible in the tool result. To run a project script, always use `./scripts/run.mjs <name>` — never call `node scripts/<name>.mjs` directly.

**Run everything synchronously, in the foreground.** Never use `run_in_background`, `&`, or otherwise start a background process (dev servers, watchers, long-lived processes) — every command must finish and return its exit code before you move to the next step. This applies to your own commands, not the subagent you launch each cycle — launching and monitoring that subagent (Step 3) is the delegation model this task is built on.

**Ship every verified change to `master`.** After you verify a cycle's improvement (Step 4), you do not stop at a local commit — you hand the change off to [`merge-change-to-master.md`](merge-change-to-master.md), which commits it as a single-author Conventional Commits commit, opens a pull request against `master`, resolves any conflicts, waits for required checks, and squash-merges it into `master` on GitHub. Each cycle therefore lands as its own isolated, reviewed PR. If that task cannot land the change — conflicts it can't resolve after its retries, or a failing required check — it leaves the PR **open** for a human; treat that cycle as **not merged**, record it, and move on. Never force the merge or hand-edit `master` yourself.

---

## Step 0 — Prepare the workspace (once, before the loop)

Execute [`prepare-workspace.md`](prepare-workspace.md) in full before doing anything else. Do this **once** to set up the workspace; the loop then reuses it. Because each cycle merges its change to `master` on GitHub (Step 5) and resyncs the workspace to the updated `master` (Step 6), re-pulling between cycles is safe and expected — there are no unmerged local commits to clobber.

Then establish a clean starting point:

```bash
git status
```

The working tree **must be clean** before you start. If it is not, STOP and report — do not start a supervised loop on top of uncommitted changes you did not make.

Decide how many cycles to run. If the user gave a number, use it. Otherwise default to **5 cycles**, and always honor the stopping conditions below — a smaller effective number is fine.

---

## The loop

Repeat Steps 1–6 until a stopping condition is met. Keep a running **ledger** (a short table you maintain in your head and print in the final report): cycle number, task delegated, target, before→after metric, PR number/URL, outcome.

### Step 1 — Inspect the code (take a fresh snapshot)

Run the diagnostics fresh every cycle — never trust numbers from an earlier cycle, since the previous commit changed the tree:

```bash
npm run typecheck 2>&1
npm run lint 2>&1
npm run quality 2>&1
npm run duplication 2>&1
npm run knip 2>&1
npm run lint:css 2>&1
```

- **TypeScript / tests must be green to begin a cycle.** If `npm run typecheck` errors, STOP the loop and report — the tree is broken and no improvement should be layered on top. (Tests are validated per-task by the subagent and re-checked by you in Step 4.)
- Read the signals into the selection table at the top of this file: FTA scores and `max-lines` from `quality`/`lint`, `cognitive-complexity` warnings from `lint`, clones from `duplication`, unused code from `knip`, coverage gaps (run `npm run coverage 2>&1` when test-coverage is a candidate), CSS issues from `lint:css`, and prefix clusters from the file layout under `src/`.

Record the specific number for whatever you're about to target (the FTA score, the complexity value, the clone count, etc.) — this is the **before** value you will compare against in Step 4.

### Step 2 — Select exactly one improvement

Choose the **single** highest-value improvement for this cycle:

1. Rank the live signals by impact. A `max-lines` **error** (blocks the build gate) outranks a mere warning; a high-severity `npm audit` advisory outranks a cosmetic CSS nit; a large clone or a badly over-limit complexity function outranks a marginal one.
2. **Skip anything a prior cycle already failed on.** If cycle N tried task T on target X and you had to revert it (Step 4), do not pick the same (task, target) again — pick the next-best signal.
3. **Rotate to avoid starvation.** All else roughly equal, prefer a task type you have not run recently this session, so the codebase improves broadly rather than grinding one dimension.
4. If **no** signal points to a worthwhile, safe improvement — every candidate is blocked, trivial, or already-failed — **stop the loop** (see "When to stop").

State your pick in one sentence: the task playbook, the target file/function, and the before-number. Add a new row to your ledger.

### Step 3 — Delegate to a subagent and monitor it

Launch a **subagent** (via the Task/Agent tool, `general-purpose` type) to execute the chosen playbook. Give it a prompt that:

1. Names the exact playbook to follow: *"Execute `ai/tasks/<task>.md` in full, following every step in order."*
2. **Tells it to skip that playbook's "Step 0 — Prepare the workspace"** — the workspace is already prepared and synced to `master`, and it must not run `git checkout`/`git pull` (that would discard the working-tree change it is making this cycle). It starts at the playbook's Step 1.
3. **Tells it to stop after verifying — do not commit, push, or open a PR.** It must leave the single change in the working tree and report, exactly in the playbook's report shape. Committing is your job (Step 5).
4. Restates the **No AI attribution** rule and **Run autonomously** rule (it must never pause to ask a question). For the playbooks that would otherwise ask a human or defer findings — [`improve-style.md`](improve-style.md) and [`improve-security.md`](improve-security.md) — instruct it to apply **only** the safe, mechanical change and surface anything requiring human judgment in its report instead of blocking.
5. Optionally narrows the target to the one you selected in Step 2, so the subagent doesn't re-derive a different pick.

**Monitor** the subagent to completion. When it returns, read its full report — you need its claimed before→after numbers, which file(s) it touched, and whether it says it succeeded, was blocked, or reverted its own change. Do not take the report at face value; you verify it next.

### Step 4 — Verify the result independently

Never trust the subagent's self-report alone. Confirm the change is real, correct, and scoped:

```bash
git status
git diff --stat
npm run typecheck:diff 2>&1
npm run test:diff 2>&1
npm run lint:diff 2>&1
npm run quality 2>&1
```

Check, in order — **any** failure means the change is rejected:

1. **Scope is legal.** `git diff --stat` touches only files the chosen playbook permits. Reject if it touched a forbidden file (`src/controller.ts`, `src/main.ts`, PTY/shell/network/crypto files, `*.test.ts` where the task forbids it), a config file (`fta.json`, `eslint.config.mjs`, `package.json`, `tsconfig.json`) it shouldn't, or far more files than the task's cap allows.
2. **No AI attribution** slipped into any changed file, comment, or (later) commit message.
3. **TypeScript is clean** (`typecheck:diff` — no errors).
4. **Tests pass** (`test:diff`).
5. **Lint is no worse** — the `✖ … problems (errors, warnings)` line has **0 errors** and warnings **≤** your Step 1 snapshot.
6. **The target metric actually improved** versus the before-number you recorded: the FTA score dropped, the complexity warning cleared, the clone is gone, the coverage rose, the knip finding disappeared, etc. A change that is green but did not move the metric is not worth keeping.

**If all checks pass →** go to Step 5.

**If any check fails →** revert this cycle's change so the tree returns to the last good commit, and record the cycle as **reverted** in the ledger:

```bash
git checkout -- .
git clean -fd
```

(Use `git clean -fd` to also drop any new files the subagent created.) Then continue to Step 6 — the loop goes on, but Step 2 will not re-pick this (task, target).

### Step 5 — Ship this cycle to master

The change is verified and sitting uncommitted in the working tree. **Ship it by executing [`merge-change-to-master.md`](merge-change-to-master.md) in full**, following every step of that playbook in order. It commits the change as a single-author Conventional Commits commit — pick the type that fits the task (`refactor` for modularity/complexity/namespacing/duplication, `test` for coverage, `chore`/`fix` for deadcode, `fix`/`build` for security, `style` for CSS) — opens a PR against `master`, resolves any conflicts, waits for required checks, and squash-merges it. Do **not** hand-commit first: the merge task's Step 0 picks up the working-tree change itself.

Restate the **No AI attribution** rule to the merge task — the commit, PR title, and PR body must carry no AI authorship — and the **Run autonomously** rule (it must never pause to ask a question).

Read the merge task's final report and record the outcome in the ledger:

- **Merged** → mark the cycle **merged** and capture the PR number/URL into the ledger row. Write a two-line summary of what this cycle achieved.
- **Left open** (conflicts unresolved after its retries, or a required check failed) → the change did not land on `master`. Mark the cycle **open (not merged)** with the PR URL and the reason. Do not retry the merge. This counts the same as a non-successful cycle for the "two in a row" stopping condition in Step 6.

### Step 6 — Resync master and decide whether to continue

First return the workspace to a clean, up-to-date `master` so the next cycle inspects the true merged state rather than a leftover feature branch:

```bash
git checkout master
git pull origin master
```

If this cycle was **reverted** in Step 4 you never left `master`, and if its PR was **left open** the change is not on `master` — in both cases the working tree is (or becomes) clean here, which is correct; an open PR lives on for a human. A **merged** cycle's change arrives on `master` via this pull.

Then decide:

- If you have completed the planned number of cycles → stop and go to the final report.
- If a stopping condition below is met → stop and go to the final report.
- Otherwise → return to **Step 1** for the next cycle. The tree is clean and `master` is current, so the next inspection sees an accurate picture.

---

## When to stop the loop

Stop the loop (and write the final report) as soon as **any** of these is true:

- You've run the planned number of cycles (default 5).
- **No worthwhile, safe improvement remains** — Step 2 finds every candidate blocked, trivial, or already-failed this session.
- The tree is **broken and you can't recover it** — a cycle left typecheck or tests red and reverting did not restore green. Report loudly; do not keep layering cycles on a broken tree.
- **Two cycles in a row did not land** — reverted in Step 4, or their PR was left open (unresolved conflicts / failing check) in Step 5. The signals aren't yielding shippable wins right now; stop rather than spin.

---

## Final report

Print the ledger and a short summary:

```
Supervised improvement run — <N> cycles

Cycle  Task                  Target                         Metric (before -> after)   Outcome    PR
1      reduce-complexity     src/foo.ts parseConfig()       cc 30 -> 12                merged     #123
2      remove-duplication    src/bar.ts / src/baz.ts        1 clone -> 0               merged     #124
3      improve-modularity    src/qux.ts                     score 78 -> 61, 243->150   reverted   —
4      improve-security      npm advisory GHSA-xxxx         high -> patched            open       #125
...

Merged this run: <count>   Reverted: <count>   Open (not merged): <count>
Net effect: <one or two sentences on what got better overall>
Next: <anything a human should look at — PRs left open on a failing check or unresolved conflicts, deferred security/style findings, a target that keeps failing, or "all cycles merged, master is clean">
```

Merged cycles are already on `master`. Note in "Next" any PR that was **left open** (failing required check or unresolved conflicts) so a human can finish it. Keep the report brief. Done.
