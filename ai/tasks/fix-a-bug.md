# Fix a Bug

Your job: take a reported bug — the first one listed under `## ready` in `./product/backlog/bugs.md`, or the specific bug the user names when running this task, which need not be listed there at all — **replicate it** to confirm the faulty behavior, determine the **correct** behavior from the bug report together with the functional specs and the code, implement a fix, **verify** the fix resolves the replicated failure, **verify it end to end in a live instance of the application** whenever the bug can be reached that way, add a **regression test** that would fail without the fix and passes with it, update functional specs and public documentation where the fix changes behavior they already document, record the plan in `./product/plans/complete/`, remove the bug from the bugs file when that is where it came from, and open a pull request that documents the replication steps and leaves the fix for a human to merge. You change source code, tests, spec files, `help.md`, `documentation/user-documentation/`, the bugs file, and the plan file's location — nothing else. The one exception is the single `temp/` line the start task may append to `.gitignore`.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary codebase's own `product/` directory, even when this task file was launched from an absolute path inside the Janissary installation.

**No AI attribution — anywhere.** Never credit an AI agent as an author or contributor in anything this task produces. That means: no `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” (or similar) lines or badges, and no AI authorship notes in code, comments, docs, spec files, plan files, commit messages, or PR titles and bodies. This overrides any default convention that appends such attribution. The commit's configured git author is the only authorship ever recorded.

This overrides AGENTS.md's "Capturing command output" guidance (write the output to a file under `./temp/`, then `grep` it repeatedly) for this task: the follow-up `grep`/`tail` filter commands stall an unattended run. Instead, run the command plain and read the full tool output directly — filter it yourself while reading, don't shell out to `grep`.

**Run autonomously.** This task runs unattended — do not ask the user questions or wait for feedback at any step. Make the best judgment call yourself, using the rules in this document, and keep going. Only stop early for the conditions explicitly listed under "Forbidden" below.

**Stay within the project directory.** The current working directory is the project directory for this session. Do not read or write any file outside it — no absolute paths escaping the project root, no `..` traversal above it, no touching files elsewhere on the machine (home directory config, other repos, system paths).

## What you may and may not do

### Allowed — do it automatically, never ask

Read any file in the repo. Run read-only commands to replicate the reported bug. Edit source, tests, CSS, and spec files as the fix requires. Update `help.md` and files under `documentation/user-documentation/` when the fix changes behavior they already document. Write a plan file under `./product/plans/` and move it through `draft/` → `ready/` → `complete/`. Remove the fixed bug from `./product/backlog/bugs.md`. Run `$janissary/scripts/run.mjs check-diff` after each change. Build and start a scratch instance of the app through the start task, drive it with `$janissary/scripts/run.mjs e2e-driver`, and end it through the stop task (Step 5). Run the full PR workflow via `ai/tasks/workspace/open-feature-pull-request.md` when implementation is done.

### Forbidden — no exceptions

1. **Fabricating a fix, a symptom, or a reproduction.** Never invent a failure you did not observe or a fix for a bug you could not reproduce. If the selected bug cannot be reproduced, stop and report (Step 1). If the specs and code leave the intended behavior genuinely ambiguous, stop and report (Step 2).
2. **Editing files the fix does not touch.** Stay in scope. If you discover a fix requires changes beyond what you planned, update the plan first — do not silently expand scope.
3. **Running `npm run check`.** That is the human's end-of-work gate. Use `$janissary/scripts/run.mjs check-diff` during development.
4. **Skipping the regression test.** Every fix needs a test that fails without the fix and passes with it. Verify with `$janissary/scripts/run.mjs check-diff`.
5. **Editing `./product/backlog/bugs.md` beyond removing the fixed entry.** Only remove the entry for the bug you fixed — do not reorder, rephrase, or otherwise modify the remaining entries, and never add a bug named at invocation to the file.
6. **Merging the PR.** `ai/tasks/workspace/open-feature-pull-request.md` opens it; merging is the human's decision.
7. **Claiming a live verification that did not happen.** Report the live end-to-end check as done only when a driver actually exercised the fixed behavior in an instance you started and observed the correct result. Never drive the human's live session, and never count a skipped or environment-blocked run as a pass.

---

## Step 0 — Prepare the workspace

Execute `ai/tasks/workspace/prepare-workspace.md` in full before doing anything else.

---

## Step 1 — Pick a bug and replicate it

1. Read `./product/backlog/bugs.md`. Bugs are grouped under `## ready`, `## development`, and `## deferred`. Only consider bugs under `## ready`. An entry is either a single prose paragraph or the structured format [`find-bugs.md`](research/find-bugs.md) writes: a `*` summary bullet followed by `Existing Bug`, `Existing Risk`, `Proposal Risk`, and `Proposal` paragraphs. For a structured entry, the summary bullet is the bug text for reporting, and the `Proposal` paragraph is the bug report: its reproduction is where sub-step 4 starts, not a substitute for running it.
2. If there are no bugs under `## ready` **and** the task invocation named no bug, report "No ready bugs in `./product/backlog/bugs.md`" and stop. When a bug was named, an empty `## ready` section is not a reason to stop — go on to the named-bug branch below.
3. Pick the bug to fix. Do **not** evaluate, rank, or compare the bugs for scope, tractability, or any other quality — the human who filed them decided they belong here:
   - **If a specific bug is named in the task invocation** (e.g. `execute ai/tasks/fix-a-bug.md "<bug text>"`), fix that one. First look for the entry in `./product/backlog/bugs.md` it refers to — the argument may be quoted text, a paraphrase, or a position such as "the second one". **If no entry matches, the named text is itself the bug report**: take it at face value and fix it exactly as if it had been listed, without stopping and without adding it to the bugs file. A named bug is never rejected for being absent from the backlog — but it is still subject to every rule below, above all the replication requirement in sub-step 4: an unlisted bug you cannot reproduce is reported and stopped on, exactly like a listed one.
   - **Otherwise**, take the **first** bug listed under `## ready` (top of the list).

   State which bug you selected, and whether it came from the bugs file or from the invocation, in one sentence.
4. **Replicate the reported failure** before writing any fix, so you can watch it fail:
   - Prefer writing a failing automated test that exercises the reported scenario — this becomes the regression test in Step 4. Colocate it per the test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
   - If a test cannot capture it, exercise the affected code path directly (a focused test, a `janus` CLI invocation, or a short throwaway script under `./temp/`) and observe the wrong behavior.
   - For a browser-visible bug in a tab launched with `-b`, use the attached browser rather than trying to launch Chromium from the workspace. Confirm `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both set, then start a scratch instance and drive it exactly as Step 5's live verification describes: the start task, one `e2e-driver` batch, the stop task. Never drive the human's live Janissary session. Follow [`ai/guidelines/sandbox-e2e-browser.md`](../guidelines/sandbox-e2e-browser.md) for connection, navigation, and lifecycle constraints. Keep the driver you write here under `./temp/fix-a-bug-drivers/`, outside the scratch root the stop task deletes: rerunning it against the fixed build is the strongest live verification Step 5 can make.
   - Record exactly what you ran and the faulty behavior you saw — the wrong output, the error, or the missing result. You will reuse this in the plan (Step 3) and the PR (Step 10).
5. Keep reproduction bounded: try at most two or three distinct approaches. If you still cannot reproduce the failure, do **not** fabricate a fix or invent a symptom, and do **not** switch to a different bug — report the selected bug, everything you tried, and stop.

---

## Step 2 — Determine the correct behavior

Decide what the code *should* do, drawing on three sources in order:

1. **The bug report** — what outcome does the reporter expect? Take it as the primary signal of intended behavior.
2. **The functional specs** in `./product/specs/` — find the spec covering this area. If a spec describes the correct behavior, it is authoritative; the bug is the code diverging from the spec.
3. **The code and its tests** — surrounding conventions, related passing tests, and adjacent behavior show what "correct" looks like when the spec is silent.

State the correct behavior in one or two sentences before planning the fix. If the bug report, specs, and code genuinely conflict or leave the intended behavior ambiguous, stop and report the ambiguity rather than guessing.

---

## Step 3 — Develop a plan

1. Read the project constraints in [`AGENTS.md`](../../AGENTS.md): ESLint rules (200-line `max-lines`, `.js` import extensions in `src/`, type-aware rules), test conventions (`src/**/*.test.ts`, `web/src/**/*.test.tsx`).
2. Read every file relevant to the fix to understand the code involved and the root cause of the bug — fix the cause, not just the symptom.
3. Choose a short, descriptive `kebab-case` name for the fix — call it `<bug-name>` (for example `orientation-reset-on-load`). Use this exact same name for the plan file at every stage below.
4. Write a plan file following the format of existing plans in `./product/plans/complete/` — include a complexity rating, the root cause, the correct behavior (from Step 2), the reproduction (from Step 1), the approach, implementation steps, the regression test, a Verification section, and out-of-scope items. The Verification section names the live end-to-end check Step 5 will run (what the driver does and what it expects to see), or says why no live check is possible for this bug. Write it to `./product/plans/draft/<bug-name>.md`.
5. After the plan is written, move it from `./product/plans/draft/` to `./product/plans/ready/`. Use plain `mv` (not `git mv`) — the new plan file is not tracked by git yet, and `git mv` fails on an untracked file:
   ```bash
   mv ./product/plans/draft/<bug-name>.md ./product/plans/ready/<bug-name>.md
   ```

---

## Step 4 — Implement the fix and its regression test

Follow the plan's implementation steps **in order**. After each step:

1. Run `$janissary/scripts/run.mjs check-diff` to catch lint, typecheck, and test failures immediately.
2. Fix any failures before moving to the next step.
3. If a step produces a file over the 200-line limit, extract into a new module per `ai/guidelines/code-guidelines.md` — do not compact code, strip comments, or delete spacing.

The regression test is mandatory:

- It must exercise the reported scenario from Step 1 and assert the correct behavior from Step 2.
- **Prove it actually catches the bug.** The reliable path is the failing test you wrote in Step 1: you already watched it fail against the buggy code, so once the fix is in place, run it and confirm it now passes. If you did not write it test-first, add it now, confirm it passes with the fix, then prove it depends on the fix — either revert the fix, run the test to watch it fail, and re-apply the fix, or explain concretely why the assertion cannot hold without the fix.
- Mirror the test style of the referenced test files (imports, helper patterns, assertion style).

Key rules during implementation:

- **Match existing conventions.** Use the same libraries, patterns, and naming the surrounding code uses. Check `package.json` or the file's existing imports before assuming a library is available.
- **Import extensions.** Relative imports in `src/` must carry `.js` (NodeNext). Relative imports in `web/src/` stay extensionless.
- **No comments unless the plan specifies them.** Write clean code; let it speak for itself.

---

## Step 5 — Verify the fix

1. Run `$janissary/scripts/run.mjs check-diff`. It must pass clean, including the new regression test.
2. Re-run the reproduction from Step 1 and confirm the faulty behavior is gone — the scenario that used to fail now behaves correctly.
3. Verify the fix end to end in a live instance of the app, if possible. The procedure is below.
4. If the plan's Verification section describes other manual steps, perform them. If manual verification is not possible in this environment, note that in the report.

### Live end-to-end verification

Unit and component tests prove the code path. They don't prove a user sees the fix. So build the fixed checkout, start it, and walk the bug's scenario through the real app the way a user would.

**Decide whether it is possible.** A live check is possible when all three of these hold:

1. The bug has an effect a user can reach through the running app: a UI interaction, a typed command, a CLI invocation, or terminal output. A bug that lives entirely inside a function with no user-reachable effect has nothing to exercise live.
2. For a web app, the tab has an attached browser. Confirm `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both set, printing only whether each exists. A tool with no web UI needs no browser.
3. The start task can build and start the app in this environment.

If any of them fails, skip the live check and keep going. That's not a reason to stop the task. Record the reason in one line. It goes in the plan's Verification section, the PR body, and the Step 10 report. Never launch a browser of your own to get around a missing one; [`sandbox-e2e-browser.md`](../guidelines/sandbox-e2e-browser.md) explains why that fails inside a workspace.

**Start a scratch instance.** Execute the start task with `./temp/fix-a-bug/` as the scratch root. Read the project's own `ai/tasks/workspace/start-application.md` and follow it when the project has one; otherwise read `$janissary/ai/tasks/workspace/start-application.md` and follow that. It builds the checkout, starts the app on `127.0.0.1` against scratch state, and reports the address, the stop command, and the record path. Two things differ from a clean-tree run:

- The build reads the working tree, so it includes your uncommitted fix. The commit the start task records is the base the fix sits on, not the fix itself. Say that when you report it.
- The tree is not clean before the build, because it holds the fix. Compare `git status --short` before and after the build instead of expecting it to be empty. The build must add or change nothing tracked beyond what was already modified.

If the start fails for an environment cause (a sandbox denial, a held port, a missing binary), treat the live check as not possible and record why. If the app fails to start because of your change, the fix is broken: go back to Step 4.

**Drive the scenario.** For a web app, write a driver under `./temp/fix-a-bug-drivers/` and run it as one batch. Drivers live outside the scratch root because the stop task deletes that root, and Step 1's driver has to survive its teardown:

```bash
$janissary/scripts/run.mjs e2e-driver ./temp/fix-a-bug-drivers/verify.mjs \
  --log <project-dir>/.janissary/log/server.log --scratch ./temp/fix-a-bug --out verify
```

The **Janissary, specifically** section of `$janissary/ai/tasks/workspace/start-application.md` documents the driver's arguments and helpers (`runCommand`, `tabSummary`, `shot`, `record`, and the rest) and the DOM traps a driver has to avoid. If Step 1 reproduced the bug live, rerun that same driver. It watched the failure once, and now it should see the correct behavior. Otherwise write a driver that performs the replication steps from Step 1 through the UI and records what it observes. Put every observation the verdict depends on into `record`, so the runner writes it to `./temp/fix-a-bug/verify.json` even if the driver throws.

Keep the whole check inside that one driver. Each `chromium.connect()` is its own session, and the app exits about a second after its last client disconnects. So the app is gone once the driver finishes, and a second batch needs a second start. For a tool, run the replication commands from the scratch working directory against this checkout's built output instead. Never substitute an installed release.

**Judge the result.** The live check passes only when the observed behavior matches the correct behavior from Step 2. If it still shows the bug, the fix is incomplete. Go back to Step 4 even though the regression test passes, and consider whether that test really exercises the reported scenario. If the run failed for a reason the environment could plausibly explain, record it as not possible with that reason rather than as a pass or a failure.

**Tear down.** Read what you need out of `./temp/fix-a-bug/` first: the driver's `verify.json`, a one-line summary of what it observed, and anything from the server log that explains a failure. Then execute the stop task with the same scratch root. Read the project's own `ai/tasks/workspace/stop-application.md` when it has one, otherwise `$janissary/ai/tasks/workspace/stop-application.md`. `no running janus instance` is the normal outcome after a driver finishes. If the stop task reports an incomplete teardown, carry its words into the Step 10 report. Once the live check is settled, remove `./temp/fix-a-bug-drivers/` too. Nothing under `./temp/` is ever committed.

---

## Step 6 — Update or create spec files

Every fix must be reflected in the functional specs under `./product/specs/`. After implementation and verification:

1. **Check the plan.** If the plan names specific spec files to update or create, do exactly that.
2. **Otherwise, find the right spec.** Read the existing specs in `./product/specs/` and identify which one(s) the fix relates to. Most fixes correct behavior an existing spec already describes — align the spec with the now-correct behavior. If no existing spec covers the area, create a new one.
3. **Write or update the spec.** Follow the existing conventions: `# Title` at the top, `### Subsection` for each aspect, prose describing user-visible behavior only — no code, no implementation details, no file paths. The spec is what the fix *does*, not how it is built. Keep additions concise and factual.

---

## Step 7 — Update help and public documentation if affected

The fix only needs a documentation update if it changes behavior that `help.md` or `documentation/user-documentation/` already describes — a changed flag, a renamed command, a corrected default, a behavior that no longer matches what's written. Do not add new documentation for behavior that wasn't previously documented; that is out of scope for this task.

1. Check `help.md` for any command, flag, or behavior description the fix changes. Update it in place if found.
2. Check `documentation/user-documentation/` for any page describing the changed behavior. Update it in place if found.
3. If neither documents the changed behavior, do nothing here — do not create new documentation.

---

## Step 8 — Promote the plan and remove the bug

1. Move the plan file from `./product/plans/ready/` to `./product/plans/complete/`. Use plain `mv` (not `git mv`) — the plan file is still untracked until the PR workflow stages it:
   ```bash
   mv ./product/plans/ready/<bug-name>.md ./product/plans/complete/<bug-name>.md
   ```
2. Remove **only** the fixed bug's entry from the `## ready` group in `./product/backlog/bugs.md`. Remove it whole: from its `*` bullet through its last paragraph (the `Proposal` paragraph of a structured entry), plus the blank lines that separated it from the next entry. Do not touch the `## development` or `## deferred` groups, the group headings, or any other bug entry. If the bug came from the task invocation and was never listed in the file, there is nothing to remove: leave the file untouched.

---

## Step 9 — Open the pull request

Execute `ai/tasks/workspace/open-feature-pull-request.md` in full — it owns the branch, commit, push, and PR-open workflow. Follow its steps as written, and additionally satisfy the two bug-specific requirements below.

**Requirement 1 — use the `fix:` type.** The commit subject and PR title must use the `fix:` Conventional Commits type (that workflow's Step 3 and Step 6), for example `fix(web): reset image orientation on reload`.

**Requirement 2 — document the replication in the PR body.** When you write the body (that workflow's "Behavior examples" and "How to verify" sections), include an explicit **Replication steps** account drawn from Step 1 and Step 2 of this task:

- The exact steps to reproduce the original faulty behavior (commands, inputs, or user flow).
- What the buggy behavior was — the wrong output, error, or missing result a reviewer would see without the fix.
- What the correct behavior is now — what the same steps produce with the fix applied.
- The name of the regression test that encodes this scenario and the file it lives in.
- The live end-to-end verification from Step 5: what the driver or command did in the scratch instance and what it observed, or the one-line reason a live check was not possible.

Do not merge the PR — leave it open for a human.

---

## Step 10 — Report

Give the user a short report in this exact shape:

```
Bug:            <the bug text from ./product/backlog/bugs.md, or the bug as named in the invocation when it was not listed there>
Reproduction:   <one-line summary of how you replicated the faulty behavior>
Correct:        <one-line statement of the correct behavior>
Root cause:     <one-line summary of the underlying cause>
Plan:           ./product/plans/ready/<file> → ./product/plans/complete/<file>
Complexity:     N/10
Implementation: <one-line summary of the fix>
Regression:     <the test that now guards this bug, and the file it lives in>
Live E2E:       verified — <one-line observation> | not possible — <reason>  [; teardown incomplete — <what is still running>]
Spec:           <spec file(s) created or updated, with one-line description of change>
Docs:           <help.md/user-documentation file(s) updated, or "none needed">
PR:             <url> (#<number>)
Status:         open
```

Keep it brief. Done.
