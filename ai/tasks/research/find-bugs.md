# Find Bugs

Your job: take the workspace the project's own preparation task leaves ready, build and run the project's app from it, exercise selected functional specs end to end, research every observed divergence, and record bugs under `## development` in `./product/backlog/bugs.md`. Web apps are driven through the browser Janissary attached to this tab; tools without a web UI are run directly, using a pseudo-terminal for interactive behavior. This task finds and records bugs. It never fixes them. A human reviews and promotes findings to `## ready` before [`fix-a-bug.md`](../fix-a-bug.md) takes them on.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory, never to the Janissary installation's own `product/`, even when this task was launched as `execute $janissary/ai/tasks/research/find-bugs.md`. Project commands run in this project; Janissary's workflow scripts are reached through `$janissary/scripts/run.mjs`.

**No AI attribution anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming an AI, no generated-by lines or badges, and no authorship notes in files, commit messages, or reports. The commit's configured git author is the only authorship recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback. Follow the steps in order, make judgment calls within these rules, and stop only for the conditions named here. Every stop follows the recovery rules below.

**Command hygiene for the whole run.** Run commands plainly and read their output from the tool result. No output-filtering pipes into `grep`, `tail`, or `head`, no `>`/`>>` redirects, and no `$(...)` capture. Use the file-editing tool for scratch drivers and backlog changes. Supplying piped input to the tool under test is allowed when it is the behavior being tested. Commands shown with placeholders need the literal values read from earlier output; shell variables do not persist between calls. This overrides the repository's output-capture convention for this task.

## What you may and may not do

### Allowed

Read project files and the Janissary workflow references linked here. Execute the project's workspace preparation task and take the workspace it leaves, then execute the project's launch task and take the app it starts. Create fixtures, drivers, logs, and evidence under the `./temp/find-bugs/` scratch root that task created. Drive the attached browser and run the tool under test, including under a pseudo-terminal. Append findings and evidence to the bugs backlog as Step 7 permits. Execute [`quick-commit.md`](../workspace/quick-commit.md) to commit and push the result.

### Forbidden

1. Editing tracked files other than `./product/backlog/bugs.md`. The one missing `temp/` line in `.gitignore` belongs to the launch task, and this run may ship it without editing it.
2. Rewording, moving, or removing an existing backlog entry. Only append evidence. Never edit an entry under `## declined`.
3. Installing anything outside the project's lockfile, including a browser or a pseudo-terminal library. Do not let install hooks download a browser.
4. Launching a browser, closing or killing the attached browser, or navigating to a `file:` URL. Never drive the human's live app or the Janissary installation that launched this tab.
5. Testing any code other than the branch the workspace preparation left checked out, or changing which branch that is. Do not reset away local commits or discard someone else's changes.
6. Running `npm run check`, the test suite, lint, `check-diff`, or other quality/analysis tooling, other than what the preparation and launch tasks themselves run. Exercise the product itself.
7. Exercising behavior that depends on sandbox enforcement, external networks, remote hosts, credentials, or native host windows.
8. Starting a second app, on any address but `127.0.0.1`, or leaving one running that is bound wider. The app under test is the one Step 3 started.
9. Filing a finding never observed at runtime, making more than 10 backlog changes, or fixing a bug.
10. Proceeding while another run holds this project's lock, or removing a lock this run did not take.

## Recovery on every stop

Record the branch and tested commit this run was handed, the address, process identity, and stop command the launch task reported, any `.gitignore` edit it made, the path of this run's lock, and every page and context this run owns. Keep this information available until the final report; never print bearer browser endpoints or session tokens into the backlog or commit.

- Release this run's lock on every stop, so no exit path leaves the project locked against the next run.
- Leave the working tree as it is found. This run did not stash what was there, so it does not restore, switch, reset, or clean it; whatever the preparation task left is what the next run and the human inherit.
- Once the launch task has started something, every stop — a start failure, a lost browser, anything later — hands teardown back to it before this run reports, so nothing it started outlives the run. Before that, there is nothing to tear down.
- After Step 4 begins, every stop finishes Steps 6–9 for any verified findings: research, file, tear down, and commit the permitted changes. Do not restart testing after a stop.
- A failed push leaves the local commit in place and the tree as it stands. If a rebase cannot be resolved within the allowed files, abort that rebase and report the push failure.
- Uncommitted work that was already in the tree is not this run's to remove, and Step 9 is where that is enforced. When a change cannot be attributed to this run, preserve it and report the obstruction; never resolve the uncertainty by discarding.

## Step 0 — Take the prepared workspace

1. Confirm `./product/specs/` is a directory and `./product/backlog/bugs.md` is a file. If either is missing, stop before changing anything and name what is missing. Read the project's `AGENTS.md` / `CLAUDE.md` and their required guidance before running any of its commands.
2. Take this run's lock, so that two runs cannot share one working tree. Resolve `git rev-parse --git-common-dir` to an absolute path and create the directory `<common git dir>/find-bugs.lock`; creating a directory is the test, so there is no window in which two runs both believe they hold it. Write this run's record inside it with the file-editing tool — the run's start time, and the branch and tested commit once they are known — and add to that record as those are established. The command queue that serializes task execution belongs to a tab, not to a project, so a second tab on this project would otherwise drive the same scratch directory and the same working tree, and the run that finished first would delete the scratch state out from under the run still testing in it. If the directory already exists, stop before changing anything and report the holder from the record inside it as `Status: stopped: another find-bugs run holds <path>`. A lock that outlives its run means that run was killed: read the record, confirm no run is in flight, and delete the directory, exactly as `janus` clears its own per-directory instance lock.
3. Prepare the workspace by executing the workspace preparation task. Read the project's own `ai/tasks/workspace/prepare-workspace.md` and follow it in full when the project has one; otherwise read `$janissary/ai/tasks/workspace/prepare-workspace.md` and follow that. The project's copy wins for the same reason the task picker offers it in preference to the built-in task at the same path. Execute whichever you picked end to end, and re-implement none of it. Do not second-guess the branch or the tree state it leaves behind, and do not add a preflight of your own: that workspace is what this run was given, and the run's job is to test it. If the task cannot be read, or stops partway, stop and report what it left.
4. Record what you were handed: the branch from `git branch --show-current` and the tested commit from `git rev-parse HEAD`, with its short form. Those name the code under test in the report, and Step 4 confirms the commit has not moved since. This run changes nothing else about the tree.

## Step 1 — Require an attached browser

Confirm both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are set, printing only whether each exists. If either is unset, release the lock and stop before building anything. Report that this tab needs relaunching with `-b` (`harness <name> -b`, or **E2E browser** in the New harness dialog). This gate also applies to tools with no web UI. There is no static-review fallback.

Read [`sandbox-e2e-browser.md`](../../guidelines/sandbox-e2e-browser.md) for the connection and lifecycle rules. Use `JANISSARY_NODE` for Node drivers when set. Otherwise check `node --version` before using a current bare `node`. Import Playwright from `JANISSARY_PLAYWRIGHT`, not the project's package, and connect with `chromium.connect(process.env.JANISSARY_BROWSER_WS_ENDPOINT)`, never `connectOverCDP` or `chromium.launch()`. The CommonJS package is available through `createRequire` or a dynamic import's `.default`.

## Step 2 — Select the specs

List the `.md` files directly under `./product/specs/`. Invocation arguments are spec names with or without `.md`, for example:

```text
execute $janissary/ai/tasks/research/find-bugs.md editor-tab file-navigator-tab
```

With names given, match each against this directory and test those specs only. If any name is unknown, report the mismatched names and every available spec name, release the lock, and stop before building. Deduplicate repeated names.

With no names, pick up to **five** specs by the date of the last commit touching each file, newest first. Read `git log -1 --format=%cs -- product/specs/<name>.md` for each candidate. Break ties in favor of the areas users spend the most time in. Exclude specs whose behavior is entirely environment-dependent. Do not exercise every spec or expand the selection as the run proceeds. If there are no eligible specs, release the lock and report why nothing could be tested.

Named specs may include skipped behavior; keep them in the report. For a partly environment-dependent spec, test its remaining behaviors and list each omitted behavior with a reason under `Not tested`.

## Step 3 — Launch the app

Get the app up by executing the launch task, with `./temp/find-bugs/` as the scratch root. Read the project's own `ai/tasks/workspace/launch-application.md` and follow it when the project has one; otherwise read `$janissary/ai/tasks/workspace/launch-application.md` and follow that. The project's copy wins for the same reason the task picker offers it in preference to the built-in task at the same path. It discovers how this project builds and runs, insists the app can be kept off real user state and on `127.0.0.1`, creates the scratch state, builds, starts the app, and reports the command, the address, the process identity, and the stop command.

Keep everything it reports: the address is what Step 4 navigates to, the stop command is what Step 8 uses, and the scratch root is where this run's fixtures, drivers, and evidence go.

Do not substitute an installed release or a globally installed executable for the code in this checkout, and never look up the address or credentials of an app the human is already running.

### When the app will not start

The launch task retries a failed build or start once and then reports why. What that failure *means* is this task's call, because only this task knows what the specs promise. A port held by another process, a project directory another `janus` instance holds — the error reads `another janus instance is already running in this directory`, which is this task's own collision with a run holding the same directory and not a defect in the app — a sandbox denial, a missing system binary, unavailable credentials, a project that cannot be kept on loopback, or any other plausible environment cause is not a backlog bug: report it under `Not filed` and stop testing. Otherwise the app failing to start is itself a divergence from what its spec says it does: research the cause and record one finding through Steps 6–7, quoting the promise that cannot be reached, then finish Steps 8–10. Do not invent a spec guarantee where none is clear; record that ambiguity under `Noted` instead. An inability to start means the remaining behaviors are `Not tested`.

## Step 4 — Connect and keep it alive

For a web app, connect through the attached browser, create only this run's context and page, and navigate to the address Step 3 reported. Keep that connection and page alive throughout testing and root-cause research. A server that shuts down when its last client disconnects needs a persistent holder process, spawned and recorded the way [`sandbox-e2e-browser.md`](../../guidelines/sandbox-e2e-browser.md) describes, so the app is still there when the next behavior is exercised.

For a tool, there is nothing to connect: Step 5 runs its commands from the scratch working directory. Do not connect to the browser just because Step 1 required its availability.

## Step 5 — Exercise the selected behavior

Read each selected spec in full. Derive a bounded checklist of its user-visible normal behavior, edge cases, and errors, noting the exact spec sentences that define expected results. Prepare existing content through scratch files or the project's seed/fixture commands when needed. Setup can use files directly; the behavior under test must go through the browser or tool.

For a web app, use the attached browser to perform actual interactions and inspect visible results. For a non-web tool, run commands and flags, supply stdin, and inspect stdout, stderr, exit status, and scratch output files. Test interactive prompts, TUI behavior, and key bindings with a scratch driver that spawns the executable under a pseudo-terminal and sends keystrokes. Use an existing `node-pty` from the project or Janissary installation, or Python's standard-library `pty`; install nothing. If none is available, list the interactive behaviors under `Not tested` with that reason and continue with non-interactive behavior.

Skip sandbox, network, remote-host, credential, and native-window behavior. Local loopback access to this run's app and a scratch local remote are allowed. Janissary examples to skip include sandbox isolation, SSH, remote-server sessions, releases, sleep/resume integration, and launching a real harness agent that needs a CLI and credentials absent from the scratch home. Test the local portions of mixed specs. Record every skipped behavior and its reason.

For each divergence, keep the exact inputs or clicks, scratch fixture content, relevant output, expected result, actual result, and spec quote. Reproduce it before filing. Screenshots and terminal captures may help inspection, but remain scratch evidence: backlog entries are text only and all captures are deleted at teardown.

If the browser is lost, retry connecting once unless its close reason says it will not be restarted. A second refusal or that terminal close reason ends testing. Keep findings already reproduced and researched, put unfinished behaviors under `Not tested`, and continue through filing, teardown, and commit with `Status: stopped: <reason>`. Browser loss itself is not filed. Do not close or restart the attached browser, send raw malformed protocol frames, or navigate to `file:` as a recovery attempt.

## Step 6 — Research each divergence

While the app remains up, follow the observed behavior into the code and identify the likely cause. Name the file, function, and mechanism, and a likely fix; rerun the reproduction to check a hypothesis when useful. Read relevant user documentation to catch an ambiguous or contradictory spec. Do not change code or run its test suite.

File only clearly reproduced runtime divergences. If the environment could plausibly explain one, leave it unfiled and name the reason under `Not filed`. If a spec contradicts itself or the user documentation and the correct behavior is unclear, report the spec problem under `Noted` without a backlog change. Separate code defects noticed during research but never reproduced also belong under `Noted`, not inside another finding.

A reproduced divergence remains eligible when no root cause can be located. Say plainly that the root cause was not found, name what was checked and ruled out, and describe the likely fix only to the extent the evidence supports it.

## Step 7 — Dedupe and write the backlog

Read every entry in every section of `./product/backlog/bugs.md` before filing. Match underlying behavior and cause, not just wording. Select at most **10 backlog changes total**, shared between new entries and existing entries receiving evidence. If more qualify, keep the best-evidenced, most user-visible findings and list the rest under `Not filed` as over the cap. Zero findings is valid.

For a new bug, append one lowercase prose bullet at the end of `## development`. Each bullet is a single paragraph containing the quoted spec promise, reproduction steps through the browser or tool, expected versus observed behavior, the likely root cause with file/function names, and a likely fix. Preserve exact case inside quotes, paths, commands, and identifiers. If the root cause remains unknown, include the Step 6 account instead of inventing one.

If `## development` is missing, insert it directly before `## deferred`, or at the end when `## deferred` is absent too. The standard section order is `ready`, `development`, `deferred`, `declined`; do not reorder existing sections to enforce it.

A match under `## ready`, `## development`, or `## deferred` receives only missing evidence, appended at the end of its existing paragraph as a sentence beginning `re-observed on <YYYY-MM-DD>:`. Include only reproduction, spec quote, or root-cause detail it lacked. Do not reword, move, or remove any existing text, and make no edit if the entry already contains all the evidence. A match under `## declined` is never edited or duplicated elsewhere; name it under `Not filed` as matching `## declined`.

## Step 8 — Tear down

Close only the pages and contexts this run opened, then disconnect; never close or kill the attached browser. Stop the holder from Step 4 first, so the app survives until nothing is still driving it.

Then hand teardown back to the launch task, with the process identity and stop command it reported. It stops what it started and removes the scratch root. If it cannot finish safely, report exactly what remains and mark the run stopped; never claim successful cleanup. Afterwards, release this run's lock. Keep the text needed for the report and commit before the scratch root goes, and continue to ship the permitted tracked changes.

## Step 9 — Commit and push

Run `git status --short --untracked-files=all` and `git diff HEAD`. The only changes allowed to ship are the permitted backlog additions and the `temp/` line the launch step may have added to `.gitignore`. Restore any other tracked change this run can account for with `git checkout -- <exact-file>`; remove only untracked output this run can account for. Nothing here was stashed at the start, so an unfamiliar change is someone's work rather than this run's litter: do not discard it and do not stage it. Stop shipping, preserve it, and report the obstruction. Never let quick-commit stage unrelated work.

If either allowed file changed, execute [`quick-commit.md`](../workspace/quick-commit.md) on the prepared branch with this subject:

```text
chore(backlog): log bugs found by spec testing
```

The body lists the tested commit, each spec tested, each entry added or appended to, and the `temp/` line if added. Commit an ignore-only change even when no bug was filed. Use the workflow's commit/push and bounded rebase steps; do not open a PR, run check tooling, or force-push. If no allowed file changed, skip the commit.

After the push, or after a failed push leaves the commit local, stop. Keep the branch the workspace preparation left checked out — switching back is not this run's to do — and leave the working tree as it stands.

## Step 10 — Report

Give a short report in this exact shape. For an early stop, use `not reached` where a command or tested commit was never established; do not imply a spec ran merely because it was selected.

```text
App:        web — <serve command bound to <address>> | tool — <command>, on <branch>@<short-sha>
Specs:      <names> (named | picked: recently changed)
Not tested: none | <spec — reason>
New bugs:   <count> under ## development — <one line each>
Appended:   <count> — <entry each was added to>
Not filed:  none | <finding — environment | over cap | matches ## declined>
Noted:      none | <spec problems and unreproduced code defects>
Commit:     <short-sha> pushed to <branch> | none — nothing filed | push failed
Status:     complete | stopped: <reason>
```
