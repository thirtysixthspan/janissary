# A task file for finding bugs by testing the specs end to end

**Complexity: 3/10** — one new prose playbook under `ai/tasks/research/`. No application code, test, or config changes, and every mechanism it drives already exists: the attached browser, `quick-commit.md`, and for Janissary the `janus` launcher and `janus stop`. The number comes from what an unattended run has to get right for any project. It must discover how to build and run an arbitrary app, keep web and tool testing apart, and order the stash, checkout, build, launch, and teardown so that it always tests the primary branch and never loses anyone's uncommitted work.

Most projects that use the `product/` convention keep functional specs in `product/specs/` that describe what the product is supposed to do. Nothing routinely checks the running product against them, so bugs reach `product/backlog/bugs.md` only when a human happens to trip over one. This adds an unattended research playbook, `ai/tasks/research/find-bugs.md`, that reads a project's specs, builds the project's app from its primary branch, and exercises it end to end. A web app is driven through the Janissary-provided browser. A tool without a web UI is run directly, under a pseudo-terminal when its behavior is interactive. The run checks what it sees against what the specs promise, researches each divergence down to a likely root cause in the code, and records it under `## development` in the project's bugs backlog. From there a human can triage it and promote it to `## ready` for `fix-a-bug.md`. The task finds and records bugs. It never fixes them.

## Design decisions

Settled by the feature request and by existing behavior:

**The specs are the oracle.** A bug is a place where the running product does something other than what a `./product/specs/*.md` file says it does. The task reads the specs to decide what to exercise and what "correct" means.

**It works on the project in the current directory.** Like `fix-a-bug.md` and `plan-a-new-feature.md`, every `./product/...` path refers to the product directory of the project being worked on, never to the Janissary installation's own `product/`, even when the task was launched as `execute $janissary/ai/tasks/research/find-bugs.md` from an absolute path inside that installation. Janissary's own scripts are reached as `$janissary/scripts/run.mjs`. The run stops before touching the tree if `./product/specs/` or `./product/backlog/bugs.md` does not exist.

**It uses only the browser Janissary attached to the tab.** The task requires `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`, which are set only when the tab was launched with `-b`. It connects with the Playwright client at `JANISSARY_PLAYWRIGHT` via `chromium.connect`, and follows `ai/guidelines/sandbox-e2e-browser.md` for connecting, keeping a session alive, and the three things that end a session (a `file:` URL, an unparseable frame, asking to close the browser). Inside a workspace `chromium.launch()` fails by design, so there is no fallback path. It runs node as `JANISSARY_NODE` when that is set, as the guideline directs.

**It never drives a live session.** It tests only an instance it built and started itself from the workspace, never the human's running app, and never the Janissary installation that launched the tab, which may be a different version.

**It changes no code.** No edits to source, tests, specs, documentation, or config. The only tracked files it edits are `./product/backlog/bugs.md` and, when needed, one added line in `.gitignore` (see below).

**It may be running inside a sandbox.** A workspace tab runs under macOS Seatbelt, so behavior that needs the sandbox's forbidden capabilities may not work as the spec describes. The environment rule below keeps such failures out of the backlog.

**Each finding is researched before it is recorded.** For every divergence the task reads the code behind the behavior and names a likely root cause, the way the existing entries in Janissary's `product/backlog/bugs.md` do (file and function names, the mechanism, a likely fix).

Settled with the user:

**It lives at `ai/tasks/research/find-bugs.md`**, beside `find-feature-gaps.md`, `find-technical-debt.md`, and the other research tasks that investigate and record backlog entries. It ships as a built-in Janissary task, so the task picker offers it on any project, and on Janissary's own workspace as a project task.

**It runs unattended.** It never asks the user a question. It makes its own judgment calls by the playbook's rules and stops only on the conditions the playbook names.

**It works on any project, not only Janissary.** The run discovers how to build and run the project's app. It reads the project's own instructions in order: `AGENTS.md` / `CLAUDE.md`, then the README, then the build tool's script list (`package.json` scripts such as `start`, `dev`, `serve`, `preview`, `build`, or the equivalent for another toolchain). From those it picks the commands that build the working tree and run it. If no build-and-run command can be determined, the run stops and reports that. Janissary itself is the playbook's worked example (see below).

**Web apps go through the browser, and tools are run directly.** From the same instructions, the run decides whether the project serves a web UI. A web app is served on `127.0.0.1` and driven through the attached browser. A project with no web UI (a CLI, a library with an executable, a TUI) is exercised by running it directly in the scratch directory. Its non-interactive behavior is tested with commands, flags, piped input, and files in and out. Its interactive behavior (a TUI, prompts, key bindings) is tested by a scratch driver that spawns the tool under a pseudo-terminal and sends keystrokes. The driver uses a pseudo-terminal mechanism already on the machine: `node-pty` from the project's or the Janissary installation's `node_modules`, or Python's standard-library `pty` module. Nothing is installed to get one. If none is available, the interactive behavior goes on the report's `Not tested` line with that reason.

**No attached browser means stop, whatever the project.** If either browser variable is unset, the task stops before building anything and reports that the tab needs relaunching with `-b` (as `take-documentation-screenshots.md` does). The gate applies to non-web projects too, even though their runs never touch the browser. There is no static-review fallback.

**The primary branch is origin's default branch.** The run resolves it from `origin/HEAD` (`git symbolic-ref refs/remotes/origin/HEAD`). When that is unset, it falls back to `master`. Every "primary branch" below means this branch. The task does not call `prepare-workspace.md`, which hardcodes `master`. It performs that task's fetch, checkout, and pull steps against the resolved branch instead.

**Dependencies come from the project's own install.** A Janissary checkout, recognized by `bin/janus.mjs` at the root, runs `prepare-workspace.md`'s Step 2 and Step 3 exactly: `npm install --ignore-scripts`, then rebuilding `esbuild`, `node-pty`, and `unrs-resolver`, which skips Playwright's per-workspace browser download. Any other project uses the install command its instructions document. Failing that, it uses its lockfile's manager in frozen mode (`npm ci`, `pnpm install --frozen-lockfile`, `yarn install --frozen-lockfile`, and so on). Nothing outside the lockfile is ever installed. If the install rewrote a lockfile without a dependency change, the rewrite is reverted with `git checkout -- <lockfile>` (as `take-documentation-screenshots.md` Step 0 does for `package-lock.json`), so the tree under test is exactly the primary branch.

**The run tests the primary branch exactly, and gets there without losing anyone's work.** Before touching the tree, the run fetches `origin` and checks whether the local primary branch has commits that are not on its `origin` counterpart. If it does, the run stops and reports them without stashing or changing anything. Otherwise, uncommitted changes, including untracked files, are stashed with the message `find-bugs: pre-run working tree`. Then the primary branch is checked out and pulled. The run stays on the primary branch to the end, even if the workspace started on another branch. After the backlog commit is pushed, the stash is popped onto the primary branch. If the pop conflicts, the stash is left in place and the report says so. Any stop after the stash (an unknown spec name, no build command found, a start failure, a lost browser, a failed push) pops the stash before stopping. A stop after Step 4 has started the app (or edited `.gitignore`) first runs teardown and the commit step, so whatever `bugs.md` or `.gitignore` change exists is shipped rather than stranded under the popped stash.

**Spec scope: named specs, otherwise up to five recently changed ones.** Spec names given at invocation, with or without the `.md` suffix (e.g. `execute $janissary/ai/tasks/research/find-bugs.md editor-tab file-navigator-tab`), are the ones tested. With none named, the run picks up to 5 specs, ranked by the date of the last primary-branch commit that touched each spec file (`git log -1 --format=%cs -- product/specs/<name>.md`), because fresh changes are where bugs are likeliest. `AGENTS.md`-style conventions require a spec update alongside a behavior change, so the spec's own history tracks its code without the run having to guess which code implements it. Ties go to the areas users spend the most time in. Specs whose behavior is entirely environment-dependent (see below) are never picked. The run never walks every spec.

**An unknown spec name stops the run before anything is built.** A name given at invocation that matches no file in `./product/specs/` stops the run. The run names the mismatch and lists the spec names that do exist, as `take-documentation-screenshots.md` does for unknown shot names.

**The app under test is isolated from real user state.** Scratch space lives under the gitignored `./temp/find-bugs/`: a scratch `HOME` at `./temp/find-bugs/home/`, a scratch working directory at `./temp/find-bugs/project/` for anything the app needs to open or write, and any data directory the project lets you redirect (by flag, env var, or config) pointed inside it. If the project's root `.gitignore` does not already ignore `temp/` (`git check-ignore -q temp/find-bugs` reports whether it does), the run appends a `temp/` line to `.gitignore`, creating the file if there is none. It changes nothing else in the file. This keeps the scratch directory out of `quick-commit.md`'s `git add -A`, and the `.gitignore` change ships in the same commit as the backlog entries. That commit happens even when no bug was filed, because the scratch directory needs ignoring on every later run too. When a spec's behavior needs existing content (files, records, a document), setup may write it directly on disk or run the project's own seed or fixture commands. The behavior under test itself always goes through the browser or the tool. If `./temp/find-bugs/` already exists at the start, left behind by a killed run, the run stops whatever that run started (for Janissary, `node bin/janus.mjs stop ./temp/find-bugs/project`) and then removes the directory.

**Janissary is the worked example.** On a Janissary checkout the recipe is fixed, and the playbook spells it out:

- Build with `npm run build` (`tsc && npm run build:web`). `bin/janus.mjs` prefers a compiled `dist/main.js` over `src/main.ts` whenever one exists, and `dist/` is gitignored, so a stale build would otherwise run code from some other commit. `src/main.ts` refuses to start without `web/dist` (`web UI bundle not found (web/dist).`), which the launcher never builds.
- Make `./temp/find-bugs/project/` a git repository with a local identity (`find-bugs` / `find-bugs@example.invalid`) and one empty commit. The scratch `HOME` has no git config, which is why `scripts/docs-screenshots/scratch.mjs` passes its `GIT_IDENTITY`. Write `{ "sandboxWorkspaces": false }` as its `.janissary/config.json`, because Seatbelt cannot apply a nested profile (`sandbox-e2e-browser.md`, "Testing Janissary from an existing sandbox"). `loadConfig` in `src/config.ts` fills every other key from the defaults. A local bare `origin` is created only when a spec's behavior under test needs a remote.
- Launch with `HOME=./temp/find-bugs/home node bin/janus.mjs --no-open ./temp/find-bugs/project`. The launcher detaches the server, writes its output to `./temp/find-bugs/project/.janissary/log/server.log`, prints the token-gated URL once the `__JANUS_URL__` line appears, and exits. If no URL arrives within 20 seconds it prints `failed to start: timed out waiting for the server`. If the server exits first, it prints the log's tail. Both are start failures.
- Hold the session with a holder process (`sandbox-e2e-browser.md`, "Keeping it alive"). Janissary exits about a second after its last websocket client disconnects, so the page must stay connected for as long as testing lasts.
- Tear down by killing the holder, then run `node bin/janus.mjs stop ./temp/find-bugs/project` as a backstop, which prints `no running janus instance for <dir>` when there is nothing left.

**A start failure is itself a bug, unless the environment caused it.** If the app will not build or start, the run retries once. Examples: the build fails, the server never prints a URL or never answers, or a tool exits on launch. If it still fails, the run researches the cause. When the cause is the environment (a port taken by another process, a sandbox denial, a missing system binary), it files nothing and reports the reason. Otherwise it files one researched entry under `## development`, ships it by quick commit, and stops, since nothing else can be tested.

**The environment is not a product bug.** Behavior that depends on the sandbox, the network, other hosts, credentials, or native host windows is not exercised. For Janissary, examples are `sandbox.md` isolation, `ssh-tab.md`, `remote-server.md`, `release.md`, `sleep-and-resume.md`, and launching a real agent in a harness tab, which needs an agent CLI plus credentials that the scratch `HOME` does not carry. A spec that is only partly environment-dependent still has its other behavior tested. Each skipped behavior goes on the report's `Not tested` line with its reason. A failure the test environment could plausibly have caused is not filed. It is listed in the report as not filed because of the environment.

**A lost browser ends testing but keeps what was verified.** If the browser is lost partway through (a connect still refused after one retry, or a close reason saying the browser will not be restarted), testing stops. The findings already reproduced and researched are filed and shipped, the specs not yet tested go on the report's `Not tested` line, and `Status` reads `stopped: <reason>`. The lost browser is not itself filed as a bug.

**At most 10 backlog changes per run.** New entries and evidence appended to existing entries share one cap of 10. If more findings turn up, the run keeps the best-evidenced and most user-visible ones and lists the rest in the report as over the cap.

**New bugs go under `## development` in `./product/backlog/bugs.md`.** `fix-a-bug.md` takes work only from `## ready`, so an automated finding reaches an unattended fix only after a human has reviewed and promoted it. New entries are appended to the end of `## development`. If the file has no `## development` heading, the run adds one directly before `## deferred`, or at the end of the file when that is missing too, using the section order `janus init` seeds (`ready`, `development`, `deferred`, `declined`).

**A duplicate gets evidence appended, not a new entry.** Before filing, each finding is checked against every existing entry in every section. When it matches an entry under `## ready`, `## development`, or `## deferred`, this run's evidence is appended to that entry rather than filing a second one. The addition goes at the end of the entry's own paragraph as a sentence beginning `re-observed on <YYYY-MM-DD>:`, and carries only what the entry lacked (reproduction, spec quote, root-cause detail). Nothing already in the entry is reworded, moved, or removed. An entry under `## declined` is never edited: a finding that matches one is left unfiled and named in the report.

**Entries are prose bullets with fixed content.** Each new entry is one lowercase prose bullet in the style of the existing entries, and always covers: the spec it violates (quoted), the reproduction steps through the browser or the tool, expected against observed behavior, the root cause with file and function names, and a likely fix.

**A reproduced divergence with no located root cause is still filed.** The entry carries the reproduction, says plainly that the root cause was not found, and names what was checked and ruled out.

**Only divergences observed at runtime are filed.** A separate defect noticed while reading code for a root cause, but never seen running, is not filed and is not folded into another entry. It goes on the report's `Noted` line.

**A problem in the spec itself is reported, not filed.** When the spec is ambiguous, contradicts itself, or disagrees with the user documentation, and the behavior is not clearly wrong, the task writes no backlog entry. It names the spec and the problem on the report's `Noted` line.

**Evidence is text only.** The run may take screenshots or capture terminal output to inspect behavior, but these live under `./temp/find-bugs/` and are deleted with it. Entries describe what was seen in words, and nothing binary is ever committed.

**Throwaway drivers live in `./temp/find-bugs/`.** The Playwright scripts, pseudo-terminal drivers, and holder process the run writes are scratch files under the ignored directory. They are not code changes and are removed with it.

**Teardown always runs, and never touches the browser.** Once testing and research are done, or on any stop after launch, the run stops everything it started: the holder and `janus stop` for Janissary, and the server or tool process it spawned for any other project. Then it removes `./temp/find-bugs/`. It closes only pages and contexts it opened, and never asks for the attached browser to be closed (`sandbox-e2e-browser.md`, "What will end your session").

**It ships by quick commit to the primary branch.** Like `find-feature-gaps.md`, the backlog change goes out as one commit pushed directly through `ai/tasks/workspace/quick-commit.md`. No PR. The subject is `chore(backlog): log bugs found by spec testing`, and the body lists the commit tested, each spec tested, and each entry added or appended to, and notes the `temp/` line if one was added to `.gitignore`.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Operating manual for the attached browser: gate variables, `chromium.connect`, holder process, session-ending actions, failure modes | `ai/guidelines/sandbox-e2e-browser.md` |
| A playbook that gates on the attached browser and stops without it | `ai/tasks/take-documentation-screenshots.md`, Step 1 |
| Reproducing a browser-visible bug against a workspace-started instance | `ai/tasks/fix-a-bug.md`, Step 1.4 |
| The `./product/` means-the-current-project paragraph | `ai/tasks/fix-a-bug.md`, `ai/tasks/plan-a-new-feature.md` (opening paragraphs) |
| A research playbook that reads `product/specs/`, writes new backlog entries under `## development`, dedupes against the file, and ships via quick commit | `ai/tasks/research/find-feature-gaps.md` |
| Janissary's install and native-rebuild steps | `ai/tasks/workspace/prepare-workspace.md`, Steps 2–3 |
| Reverting an install's lockfile rewrite | `ai/tasks/take-documentation-screenshots.md`, Step 0 |
| Scratch project plus scratch `HOME` with a local git identity (`GIT_IDENTITY`) | `scripts/docs-screenshots/scratch.mjs` (`createScratch`) |
| Detached launch that prints the URL with `--no-open`, and `janus stop <dir>` | `bin/janus.mjs`; `product/specs/cli.md`, "Stopping a running instance" |
| Partial `.janissary/config.json` filled from defaults | `src/config.ts` (`loadConfig`), `src/config-decode.ts` (`decodeConfig`) |
| The standard backlog section order | `product/specs/cli.md`, `janus init` |
| The consumer of the entries this task writes, once promoted | `ai/tasks/fix-a-bug.md` (takes the first bug under `## ready`) |
| Commit and push path | `ai/tasks/workspace/quick-commit.md` |

## Proposed changes

**`ai/tasks/research/find-bugs.md`** (new). A prose playbook in the house shape of `take-documentation-screenshots.md` and `find-feature-gaps.md`: a job statement, the `./product/` paragraph, the no-AI-attribution rule, the run-autonomously rule, the same command-hygiene note those tasks carry (run commands plainly, with no pipes into `grep`/`tail`, no `>` redirects, and no `$(...)` capture), an allowed/forbidden list, numbered steps, and a fixed report shape.

**Allowed:** read any file; stash and pop the working tree; check out and pull the primary branch; run the project's install, build, run, and seed commands against scratch state under `./temp/find-bugs/`; append a `temp/` line to `.gitignore` when it is missing; create and delete anything under `./temp/find-bugs/`; drive the attached browser; spawn the tool under test, including under a pseudo-terminal; edit `./product/backlog/bugs.md` as described above; execute `quick-commit.md`.

**Forbidden:** editing any tracked file other than `./product/backlog/bugs.md` and the one `temp/` line in `.gitignore`; editing or removing an existing entry's text (appending is the only change allowed to one) or touching `## declined`; installing anything outside the project's lockfile, including a browser or a pseudo-terminal library; launching a browser; closing or killing the attached browser; navigating to a `file:` URL; driving any app instance other than the one this run started; testing anything other than the primary branch; running `npm run check`, the test suite, lint, or other analysis tooling (the product is tested by running it, not through its suite); filing more than 10 backlog changes; filing a finding that was not observed at runtime; asking the user a question.

The steps, in order:

0. Confirm `./product/specs/` and `./product/backlog/bugs.md` exist (stop if not). Resolve the primary branch, fetch, and check for unpushed local commits (stop if any). Then stash, check out and pull the primary branch, install dependencies, and revert a lockfile rewrite.
1. Confirm both browser variables are set, or pop the stash and stop.
2. Resolve the spec list: check the invocation names against `./product/specs/` (pop the stash and stop on a mismatch), or pick up to 5.
3. Discover how to build and run the app, and whether it is a web app or a tool. Pop the stash and stop if no build-and-run command can be found.
4. Ignore `temp/` in `.gitignore` if it is not already ignored, clear any leftover `./temp/find-bugs/`, create the scratch state, build, and start the app (for a web app, also its holder or background server). On failure, retry once, then research and file or report as described above.
5. For each spec, read it, derive the behaviors to check, set up content where needed, exercise each behavior through the browser or the tool, and record every divergence with its exact reproduction. Skip environment-dependent behavior and record why.
6. Research each divergence's root cause in the code while the app is still up, so a reproduction can be re-run to confirm a hypothesis.
7. Dedupe against every section of `./product/backlog/bugs.md`. Then append new entries to the end of `## development` and add evidence to matched entries, up to the cap of 10.
8. Tear down everything the run started and remove `./temp/find-bugs/`.
9. Confirm with `git status` that `./product/backlog/bugs.md` and `.gitignore` are the only changed files (revert anything else). If either changed, execute `quick-commit.md`. Then pop the stash.
10. Report.

The report shape, verbatim:

- `App:        web — <serve command bound to <address>> | tool — <command>, on <branch>@<short-sha>`
- `Specs:      <names> (named | picked: recently changed)`
- `Not tested: none | <spec — reason>`
- `New bugs:   <count> under ## development — <one line each>`
- `Appended:   <count> — <entry each was added to>`
- `Not filed:  none | <finding — environment | over cap | matches ## declined>`
- `Noted:      none | <spec problems and unreproduced code defects>`
- `Commit:     <short-sha> pushed to <branch> | none — nothing filed | push failed`
- `Status:     complete | stopped: <reason>`

## Tests

No automated test. The change is a prose playbook with no application code, like `generate-architecture-diagram.md`, and correctness is checked by running the task end to end (see Verification).

## Out of scope

- Fixing any bug the task finds. That is `ai/tasks/fix-a-bug.md`.
- Launching a browser of its own, or installing a browser or anything else outside the project's lockfile.
- Testing any version of the code other than the primary branch.
- Driving a live session, including the Janissary instance that launched the tab.
- Exercising sandbox, network, remote-host, credential, or native-window behavior.
- Filing spec, documentation, or feature problems. Only runtime behavior bugs are filed, and only in `./product/backlog/bugs.md`.
- Any `.gitignore` change beyond adding a missing `temp/` line.
- Walking every spec in one run.
- Running the project's automated test suite.
- Restoring the branch the workspace started on. The run ends on the primary branch.

## Verification

`$janissary/scripts/run.mjs check-diff` (nothing under `src/` or `web/src/` changes, so this is a formality). Then run the new task end to end from a tab launched with `-b`:

1. On a Janissary workspace, name one small spec (`execute ./ai/tasks/research/find-bugs.md quick-open`). Confirm that it:
   - connects to the attached browser and launches no browser of its own
   - runs `npm run build` and tests an instance started at `./temp/find-bugs/project` from a workspace whose `HEAD` equals `origin/master`
   - leaves Janissary's `.gitignore` untouched (it already ignores `temp/`) and commits only `product/backlog/bugs.md`, under the subject `chore(backlog): log bugs found by spec testing`, with any new entries under `## development` quoting a spec and giving reproduction steps, expected against observed behavior, and a root cause (or what was ruled out)
   - leaves no `./temp/find-bugs/` behind, and afterwards `node bin/janus.mjs stop ./temp/find-bugs/project` prints `no running janus instance for <dir>`
   - prints the report in the fixed shape, with an `App:` line naming `node bin/janus.mjs` and the tested commit
2. Run it again with a deliberately unknown spec name. Confirm it stops before building, lists the real spec names, and leaves the working tree as it found it.
3. On a small non-Janissary project that has `product/specs/` and a CLI but no web UI, run it with no spec named. Confirm that it discovers the tool's run command, reports `App: tool — …`, appends `temp/` to that project's `.gitignore` if it was missing and commits it, and tests non-interactive behavior directly and interactive behavior under a pseudo-terminal (or lists that behavior as `Not tested` when no pseudo-terminal mechanism is available).

### Verification status

Rehearsed on 2026-09-26 from a tab with no attached browser, against branch commit `386d123e` and the primary-branch commit `ba855edf`.

**Case 2, partially.** The preparation chain was rehearsed in full inside a throwaway clone: a dirty tree of one staged edit plus one untracked file was stashed with the run's own message and its object ID recorded, the primary branch was created tracking `origin/master` and fast-forwarded, the lockfile audit returned clean, `npm install --ignore-scripts` with the two rebuild lines left the tracked tree clean, the missing browser stopped the run before any build, and `git stash pop --index` on the ref located by that object ID brought back the edit still staged and the untracked file, with no stash left behind and the clone on the primary branch. What was **not** exercised is case 2's own assertion: specification names are resolved in Step 2, after the browser gate in Step 1, so a tab without a browser reports the missing browser instead of the unknown name. Rehearsing that assertion needs a `-b` tab.

**Cases 1 and 3, not run.** Both need a tab launched with the E2E browser, and the tab this was written in has neither `JANISSARY_BROWSER_WS_ENDPOINT` nor `JANISSARY_PLAYWRIGHT`. Nothing in this repository should be read as a claim that they pass.

**The Janissary worked example was removed after this plan was completed.** The design decision above stands as the record of what was decided then; the section it called for is no longer in the task, which now takes a Janissary checkout's build and launch commands from that checkout's own instructions like any other project's. What no project document states, and what the section carried, is the scratch repository's git identity, the `sandboxWorkspaces` override, the detached launch with its token-gated URL, and the launcher's preference for a compiled `dist/main.js` over `src/main.ts` — so a run pointed at a Janissary checkout may not find a working recipe on its own. The holder-process rule the section also carried is written down in `ai/guidelines/sandbox-e2e-browser.md`.

**The workspace setup is delegated, which reverses two decisions above.** The task now executes the workspace preparation task — the project's own copy when it has one, the installation's otherwise — and takes the workspace it leaves, instead of resolving the primary branch, stopping on unpushed local commits, stashing the working tree, and installing for itself. So the decision that the task "does not call `prepare-workspace.md`, which hardcodes `master`" no longer holds: the run now takes `master` because that is the branch the preparation task checks out, and every rule built on owning the tree — locating a stash by object ID, restoring it onto the primary branch, the `Stash:` report line — is gone. The install moved with it, and so did the supply-chain gate that guarded the install, which now lives in `ai/tasks/workspace/prepare-workspace.md` where every task that prepares a workspace gets it.

What the run gives up is the baseline. With nothing stashed, a change already in the tree cannot be told apart from a change the run made, so Step 9 no longer reverts what it cannot attribute: it stops shipping and reports, leaving the work in place. A run that finds an unfamiliar change therefore produces findings it cannot commit, and the branch it tested is whatever the preparation task left checked out rather than the remote's default branch resolved by the run itself.

**Building and launching the app moved to `ai/tasks/workspace/launch-application.md`**, which the run executes the same way it executes the preparation task. The task keeps what only it can decide — that a project unable to start is an environment limitation, while a project whose spec promises it starts and does not is a finding — and keeps the browser, the holder, and the driving. The launch task owns the rest: discovery, the stop command, the loopback requirement, the scratch root, the build, the readiness check, and the teardown of what it started. What the two design decisions above gave the run in particular — the `janus` stop command and the working scratch recipe — left with it, which is consistent with the worked example's removal; the holder rule remains in `ai/guidelines/sandbox-e2e-browser.md`.

**The environment is no longer a reason to skip, only a reason not to file.** The run used to be forbidden from exercising behavior that depends on sandbox enforcement, an external network, a remote host, a credential, or a native host window, and used to exclude a spec whose behavior is entirely environment-dependent from its automatic selection. It now exercises everything a spec promises and reports what the environment prevented, under `Not tested` rather than in advance. The other half of that decision is unchanged and load-bearing: a divergence the environment could plausibly explain is still not filed as a bug. A run whose app needs a credential the scratch home does not carry now tries, fails, and says so, where it used to decline without looking.

**Two things the rehearsal turned up, recorded rather than fixed.**

- A run launched from this branch tests the primary branch's code, so the copy of the task and the code it exercises come from different commits by design. The audit command the branch's instructions give is therefore run by the primary branch's copy of the runner, which predates the lockfile-path form and falls back to auditing the lockfile beside it — the same file in that case, so the step still audits what it should.
- `git symbolic-ref refs/remotes/origin/HEAD` answers with whatever branch the remote has checked out, so a run against a remote sitting on a feature branch treats that branch as primary. Correct by the design decision above, and worth knowing before pointing the task at a fork or a mirror whose `origin/HEAD` is not the default branch.
