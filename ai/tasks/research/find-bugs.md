# Find Bugs

Your job: build and run the project's app from its primary branch, exercise selected functional specs end to end, research every observed divergence, and record bugs under `## development` in `./product/backlog/bugs.md`. Web apps are driven through the browser Janissary attached to this tab; tools without a web UI are run directly, using a pseudo-terminal for interactive behavior. This task finds and records bugs. It never fixes them. A human reviews and promotes findings to `## ready` before [`fix-a-bug.md`](../fix-a-bug.md) takes them on.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory, never to the Janissary installation's own `product/`, even when this task was launched as `execute $janissary/ai/tasks/research/find-bugs.md`. Project commands run in this project; Janissary's workflow scripts are reached through `$janissary/scripts/run.mjs`.

**No AI attribution anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming an AI, no generated-by lines or badges, and no authorship notes in files, commit messages, or reports. The commit's configured git author is the only authorship recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback. Follow the steps in order, make judgment calls within these rules, and stop only for the conditions named here. Every stop follows the recovery rules below.

**Command hygiene for the whole run.** Run commands plainly and read their output from the tool result. No output-filtering pipes into `grep`, `tail`, or `head`, no `>`/`>>` redirects, and no `$(...)` capture. Use the file-editing tool for scratch drivers and backlog changes. Supplying piped input to the tool under test is allowed when it is the behavior being tested. Commands shown with placeholders need the literal values read from earlier output; shell variables do not persist between calls. This overrides the repository's output-capture convention for this task.

## What you may and may not do

### Allowed

Read project files and the Janissary workflow references linked here. Fetch, stash and restore the working tree, check out and pull the primary branch. Run the project's locked dependency install, build, launch, and seed commands. Add one missing `temp/` line to `.gitignore`. Create fixtures, drivers, logs, and evidence under `./temp/find-bugs/`; remove this run's scratch files at teardown. Drive the attached browser and spawn the tool under test, including under a pseudo-terminal. Append findings and evidence to the bugs backlog as Step 7 permits. Execute [`quick-commit.md`](../workspace/quick-commit.md) to commit and push the result.

### Forbidden

1. Editing tracked files other than `./product/backlog/bugs.md` and the one missing `temp/` line in `.gitignore`. Restoring this run's incidental install or build changes is allowed; changing source, tests, specs, documentation, or configuration is not.
2. Rewording, moving, or removing an existing backlog entry. Only append evidence. Never edit an entry under `## declined`.
3. Installing anything outside the project's lockfile, including a browser or a pseudo-terminal library. Do not let install hooks download a browser.
4. Launching a browser, closing or killing the attached browser, or navigating to a `file:` URL. Never drive the human's live app or the Janissary installation that launched this tab.
5. Testing any code other than the primary branch. Do not reset away local commits or discard someone else's changes to reach it.
6. Running `npm run check`, the test suite, lint, `check-diff`, or other quality/analysis tooling. Exercise the product itself. The required package safety gate before installation is the sole exception; it is not product testing.
7. Exercising behavior that depends on sandbox enforcement, external networks, remote hosts, credentials, or native host windows.
8. Filing a finding never observed at runtime, making more than 10 backlog changes, or fixing a bug.

## Recovery on every stop

Record whether this run created a stash, its object ID and message, the tested commit, any `.gitignore` edit, and every process/page/context this run owns. Keep this information available until the final report; never print bearer browser endpoints or session tokens into the backlog or commit.

- Before a stash exists, a stop makes no working-tree changes.
- After stashing but before Step 4, restore any incidental changes made by this run, then pop only this run's stash and report. Never pop a pre-existing stash.
- Once Step 4 begins, every stop, including a build/start failure or a lost browser, finishes Steps 6–9 for any verified findings: research, file, tear down, commit permitted changes, and then pop the stash. A `.gitignore` edit alone is still committed. Do not restart testing after a stop.
- A failed push still restores the stash after teardown and leaves the local commit in place. If a rebase cannot be resolved within the allowed files, abort that rebase before restoring the stash and report the push failure.
- Restore on the primary branch; do not return to the starting branch. Locate the saved stash by its recorded object ID in `git stash list --format='%gd %H %s'`, then use `git stash pop --index <matching-stash-ref>` to recover its staged state too. If restoration conflicts, leave the stash and conflict state in place and report it. Do not drop the stash, reset, or overwrite files to force restoration. If checkout of the primary branch itself failed, restore on the unchanged starting branch and report that exception.

## Step 0 — Prepare the primary branch

1. Confirm `./product/specs/` is a directory and `./product/backlog/bugs.md` is a file. If either is missing, stop before changing the tree and name what is missing. Read the project's `AGENTS.md` / `CLAUDE.md` and their required guidance before running install commands.
2. Run `git status` and confirm this is a git repository with an `origin` remote and no unfinished merge, rebase, or conflicted index. Stop on those conditions; this task cannot safely stash them.
3. Resolve the primary branch with `git symbolic-ref refs/remotes/origin/HEAD`. Strip `refs/remotes/origin/` from the result. If the symbolic ref is unset, use `master`. Fetch with `git fetch origin`; stop if the fetch fails or `origin/<primary>` does not exist.
4. If a local primary branch exists, run `git log --oneline origin/<primary>..<primary>`. Any output means local commits are not on the remote: report those commits and stop without stashing or checking out. If the local branch does not exist, create it tracking `origin/<primary>` only after stashing below.
5. Inspect `git status --short --untracked-files=all`. When there are changes, run `git stash push --include-untracked -m 'find-bugs: pre-run working tree'` and record `git rev-parse refs/stash`. Confirm the tracked and untracked working tree is clean before continuing. Otherwise record `Stash: none` and leave all existing stashes alone.
6. Check out the resolved primary branch and run `git pull --ff-only origin <primary>`. Compare `git rev-parse HEAD` with `git rev-parse origin/<primary>`; they must match. Record the full tested commit and its short form. Do not call `prepare-workspace.md` in full: it hardcodes `master`.
7. Install dependencies from this project's lockfile, following its documented install command or, if absent, its lockfile manager's frozen command (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --frozen-lockfile`, or the equivalent). A project requiring dependencies without a lockfile stops here. Never add a package or run an installer that downloads a browser; use the project's supported way to skip that download, or stop if there is none. Run any package safety gate required by project instructions before installing; only success permits installation. Audit the tree this run is about to install, never the installation the task was launched from: a project that ships its own gate runs that one, and in a Janissary checkout — recognized by `bin/janus.mjs` at its root, and carrying the gate, the blocklist, and the lockfile itself — run it from the project directory:

   ```bash
   ./scripts/run.mjs check-malicious-package --audit ./package-lock.json
   ```

   A project with no runner of its own reaches for the installation's instead, and then names this project's lockfile explicitly, because the gate reads the file it is given rather than the one beside the script:

   ```bash
   $janissary/scripts/run.mjs check-malicious-package --audit <path to this project's lockfile>
   ```

   Read the exit code as the verdict. `0` is clean and permits the install. `2` (a known-malicious version) and `3` (a package or scope belonging to a compromised account) stop the run and report what was refused. `1` means the check could not read its input and is a failed check, never permission to install. Then perform Steps 2–3 of [`prepare-workspace.md`](../workspace/prepare-workspace.md):

   ```bash
   npm install --ignore-scripts
   npm rebuild esbuild node-pty unrs-resolver
   chmod +x node_modules/node-pty/prebuilds/*/spawn-helper
   ```

   Recognize a Janissary checkout by `bin/janus.mjs` at its root. Never install a browser or a driver dependency separately.
8. Inspect `git status` and the install's diff. If installation rewrote a lockfile without a dependency change, restore that exact file with `git checkout -- <lockfile>`. Restore only incidental changes attributable to this run, never pre-existing work. Confirm the tracked tree is the primary branch again. An install failure or unexpected dependency change stops the run with stash recovery; do not fix dependencies.

## Step 1 — Require an attached browser

Confirm both `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are set, printing only whether each exists. If either is unset, restore the stash and stop before building anything. Report that this tab needs relaunching with `-b` (`harness <name> -b`, or **E2E browser** in the New harness dialog). This gate also applies to tools with no web UI. There is no static-review fallback.

Read [`sandbox-e2e-browser.md`](../../guidelines/sandbox-e2e-browser.md) for the connection and lifecycle rules. Use `JANISSARY_NODE` for Node drivers when set. Otherwise check `node --version` before using a current bare `node`. Import Playwright from `JANISSARY_PLAYWRIGHT`, not the project's package, and connect with `chromium.connect(process.env.JANISSARY_BROWSER_WS_ENDPOINT)`, never `connectOverCDP` or `chromium.launch()`. The CommonJS package is available through `createRequire` or a dynamic import's `.default`.

## Step 2 — Select the specs

List the `.md` files directly under `./product/specs/`. Invocation arguments are spec names with or without `.md`, for example:

```text
execute $janissary/ai/tasks/research/find-bugs.md editor-tab file-navigator-tab
```

With names given, match each against this directory and test those specs only. If any name is unknown, report the mismatched names and every available spec name, restore the stash, and stop before building. Deduplicate repeated names.

With no names, pick up to **five** specs by the date of the last primary-branch commit touching each file, newest first. Read `git log -1 --format=%cs -- product/specs/<name>.md` for each candidate. Break ties in favor of the areas users spend the most time in. Exclude specs whose behavior is entirely environment-dependent. Do not exercise every spec or expand the selection as the run proceeds. If there are no eligible specs, restore the stash and report why nothing could be tested.

Named specs may include skipped behavior; keep them in the report. For a partly environment-dependent spec, test its remaining behaviors and list each omitted behavior with a reason under `Not tested`.

## Step 3 — Discover how this project runs

Read the project's instructions in this order: `AGENTS.md` / `CLAUDE.md`, README, then the build tool's script list. For Node projects inspect `package.json` for `build`, `start`, `dev`, `serve`, or `preview`; use equivalent metadata for other toolchains. Determine how to build the checked-out code, which built entry to run, and how to point its state at scratch paths. An interpreted tool may need no build; record that deliberately. If no build-and-run recipe can be determined, restore the stash and stop with that reason.

Decide whether the app serves a web UI or is a tool with no web UI. Serve web apps on `127.0.0.1`, using the project's own local-only option. Tools are invoked directly from the scratch working directory, by a path to this workspace's built executable. Never substitute an installed release or a globally installed executable for the code under test.

Work out how to stop the process before starting it. Redirect its home and every configurable data/cache directory into `./temp/find-bugs/`; fixtures and seed commands must target that scratch state. If the app cannot be isolated from real user state, stop and report that environment limitation. For Janissary use the fixed recipe in Step 4.

## Step 4 — Create scratch state, build, and start

Run `git check-ignore -q temp/find-bugs`. Exit 0 means it is already ignored. If it is not ignored, append exactly one `temp/` line to the project's root `.gitignore`, creating the file if needed, and confirm the scratch path is now ignored. Change no other line. If an existing exception still exposes scratch files, stop through teardown and commit; do not rewrite ignore rules. This check keeps scratch output out of quick-commit's `git add -A`.

If `./temp/find-bugs/` exists from an interrupted run, inspect it before reusing it. Stop only the processes that run started, using its recorded launch details and process identities; never kill by a broad process-name match or trust a recycled PID. For Janissary use `node bin/janus.mjs stop ./temp/find-bugs/project` before removing the old directory. If ownership cannot be established, stop and report rather than killing an unrelated process. Remove only the resolved project-local `./temp/find-bugs/` directory, never `temp/` or the workspace itself, and never follow a symlink outside the project.

Create `./temp/find-bugs/home/` and `./temp/find-bugs/project/`. Put throwaway Playwright scripts, pseudo-terminal drivers, holder scripts, process records, logs, and evidence under `./temp/find-bugs/` too. Use absolute scratch paths when passing them to child processes so a changed working directory cannot redirect state elsewhere. Apply the scratch home through the child process's environment `HOME` key only; do not change the agent shell's `HOME` or use `HOME` as a scratch variable. Repository install and commit commands retain the user's normal identity and environment.

Build the primary-branch working tree using the recipe from Step 3. Check that `HEAD` still equals the tested commit and `origin/<primary>` before testing. Inspect the build's diff: restore incidental changes to tracked source or configuration before testing, but keep freshly generated runtime artifacts until teardown, restoring any tracked copies in Step 9. Start the freshly built app with scratch state, record its process identity and stop command, and confirm readiness from its output and an actual response. Set a bounded readiness timeout using the project's documented value, or 20 seconds if none is documented.

### Janissary worked example

1. Build with `npm run build` (`tsc && npm run build:web`). The launcher prefers `dist/main.js` whenever it exists, so an old ignored build would test the wrong commit; the server also requires `web/dist` and does not build it itself.
2. Initialize `./temp/find-bugs/project/` as a git repository. Set its repository-local identity to `find-bugs` / `find-bugs@example.invalid`, then make one empty commit. The scratch home has no global git identity. Create a local bare `origin` under `./temp/find-bugs/` only if a selected behavior needs a remote; never connect it to a real remote.
3. Use the file-editing tool to write `{ "sandboxWorkspaces": false }` to `./temp/find-bugs/project/.janissary/config.json`. The existing outer sandbox cannot apply a nested Seatbelt profile. Other configuration keys come from Janissary's defaults.
4. Launch this checkout's `node bin/janus.mjs --no-open ./temp/find-bugs/project` with the scratch home in the child's environment, using `JANISSARY_NODE` when available. The launcher detaches the server, writes `./temp/find-bugs/project/.janissary/log/server.log`, prints the token-gated URL after `__JANUS_URL__` appears, and exits. No URL within 20 seconds produces `failed to start: timed out waiting for the server`; an earlier server exit relays the log's tail. Both are start failures. Never look up the URL or token of the human's running session.
5. For a web app, connect through the attached browser, create only this run's context/page, and navigate to the URL from this run's launch. Keep that connection and page alive throughout testing and root-cause research. For Janissary, use a persistent holder process as described in the browser guideline: disconnecting the last WebSocket client shuts the app down about a second later. Record the holder so teardown can stop it.

For another web app, use its discovered server command and a persistent browser driver or holder. For a tool, run its fresh executable from the scratch project; do not connect to the browser just because Step 1 required its availability.

### Build or start failures

Retry a failed build or start **once**, stopping this run's failed process before retrying. If it still fails, research the cause. A port held by another process, sandbox denial, missing system binary, unavailable credentials, or another plausible environment cause is not a backlog bug: report it under `Not filed` and stop testing. Otherwise record one researched startup finding through Steps 6–7, quoting the spec's promised behavior that cannot be reached, then finish Steps 8–10. Do not invent a spec guarantee when none is clear; record that ambiguity under `Noted` instead. An inability to start means the remaining behaviors are `Not tested`.

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

Stop every server, tool, driver, and holder this run started, including children, using the recorded ownership information. Close only the pages and contexts this run opened, then disconnect; never close or kill the attached browser. For Janissary, stop the holder first and run `node bin/janus.mjs stop ./temp/find-bugs/project` as a backstop. When already stopped it prints `no running janus instance for <dir>`.

After processes have stopped, remove only the validated project-local `./temp/find-bugs/` directory and confirm it is gone. Keep the text needed for the report and commit before deleting captures and logs. If teardown cannot safely finish, report what remains and mark the run stopped; never claim successful cleanup or kill an unrelated process. Continue to ship permitted tracked changes and restore the stash.

## Step 9 — Commit, push, and restore the stash

Run `git status --short --untracked-files=all` and `git diff HEAD`. The only changes allowed to ship are the permitted backlog additions and the optional `temp/` line in `.gitignore`. Restore any other tracked changes provably made by this run with `git checkout -- <exact-file>`; remove only untracked output provably created by this run. If unexpected work cannot be attributed, do not discard or stage it. Stop shipping and preserve it and the stash, reporting the obstruction. Never let quick-commit stage unrelated work.

If either allowed file changed, execute [`quick-commit.md`](../workspace/quick-commit.md) on the primary branch with this subject:

```text
chore(backlog): log bugs found by spec testing
```

The body lists the tested commit, each spec tested, each entry added or appended to, and the `temp/` line if added. Commit an ignore-only change even when no bug was filed. Use the workflow's commit/push and bounded rebase steps; do not open a PR, run check tooling, or force-push. If no allowed file changed, skip the commit.

After the push, or after a failed push leaves the commit local, restore this run's stash by the recovery rules. Keep the primary branch checked out. Report a conflicting pop with the stash left in place; never describe that as restored.

## Step 10 — Report

Give a short report in this exact shape. For an early stop, use `not reached` where a command or tested commit was never established; do not imply a spec ran merely because it was selected.

```text
App:        web — <serve command> | tool — <command>, on <branch>@<short-sha>
Specs:      <names> (named | picked: recently changed)
Not tested: none | <spec — reason>
New bugs:   <count> under ## development — <one line each>
Appended:   <count> — <entry each was added to>
Not filed:  none | <finding — environment | over cap | matches ## declined>
Noted:      none | <spec problems and unreproduced code defects>
Commit:     <short-sha> pushed to <branch> | none — nothing filed | push failed
Stash:      none | restored | left in place: find-bugs: pre-run working tree — <reason>
Status:     complete | stopped: <reason>
```
