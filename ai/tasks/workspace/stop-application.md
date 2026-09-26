# Stop Application

Your job: stop the app a start task left running, and clear the scratch state it used. You are the ending of that app's life, and you are also how a scratch root left behind by a run that died gets cleared. You start nothing, and you touch nothing you cannot show is yours.

**Invocation.** The scratch root a start task used, for example `./temp/find-bugs/`. With none given, look for the start task's default, `./temp/start-application/`.

**Use the project's own copy of this task when it has one.** If the project has `ai/tasks/workspace/stop-application.md`, read that and follow it instead of this file. A project that ships its own stop task knows things about stopping its app that no generic task can; the project copy wins for the same reason the task picker offers it in preference to the built-in task at the same path.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary installation's own `product/`, even when this task was launched as `execute $janissary/ai/tasks/workspace/stop-application.md`. Project commands run in this project; Janissary's workflow scripts are reached through `$janissary/scripts/run.mjs`.

**No AI attribution anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming an AI, no generated-by lines or badges, and no authorship notes in files, commit messages, or reports. The commit's configured git author is the only authorship recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback. Follow the steps in order, make judgment calls within these rules, and stop only for the conditions named here. Report what is still running if you could not finish; never report a cleanup that did not happen.

**Command hygiene for the whole run.** Run commands plainly and read their output from the tool result. No output-filtering pipes into `grep`, `tail`, or `head`, no `>`/`>>` redirects, and no `$(...)` capture. Use the file-editing tool for anything you write. Commands shown with placeholders need the literal values read from earlier output; shell variables do not persist between calls.

## What you may and may not do

### Allowed

Read any file in the project, including the start record and the project's own instructions. Run the project's own stop command. Signal a process this run can attribute to the scratch root it was given. Remove the scratch root and everything under it.

### Forbidden

1. Starting anything. This task ends processes; it never begins them. A scratch root whose app was never started is still cleared — see Step 1.
2. Stopping a process this run cannot attribute to the scratch root it was given. Never match on a process name, and never trust a recorded pid without the record that goes with it: pids get recycled, and a recycled pid is by construction not the process that was started. When ownership cannot be established, leave the process alone and report it.
3. Stopping an app whose scratch root is not the one you were given — least of all the one the human is running. One instance per directory is enforced elsewhere; never delete a lock to get around a live one.
4. Removing anything outside the scratch root: not a parent of it, not `temp/`, not the workspace, and never a path reached through a symlink that leaves the project.
5. Launching a browser, closing or killing a browser, or navigating to a `file:` URL.
6. Driving the app on its way out. Stopping is not testing: do not send it a request to confirm it is gone.
7. Editing any tracked file. This task removes a scratch tree and changes nothing the project tracks.

## Janissary, specifically

Everything in this section is what this repository's app _is_, so that no step below has to go looking for it. A line naming a file is the source of the fact, not somewhere to change anything.

**The stop command is `node bin/janus.mjs stop <project-dir>`.** It reads the pid from `<project-dir>/.janissary/lock` and sends that process `SIGTERM` (`src/stop-instance.ts:10`), which the server handles by shutting down cleanly (`src/main.ts:95`). The command runs before the lock is taken (`src/main.ts:65`), so it works even against an instance too wedged to hold the lock itself. With nothing to stop it prints `no running janus instance for <dir>` and exits 0 — a successful stop, not a failure to find something, and the wording to expect when the app quit on its own.

**The lock file is the app's own record of whether it is running.** `<project-dir>/.janissary/lock` holds a bare pid, and the server removes it as it exits (`src/main.ts:98` → `src/instance-lock.ts:80`), so a lock that is present means running and a lock that is gone means it has already stopped. Reading that file is how you know what you are dealing with; you do not need a process listing, and this task must not take one. A pid in a _record_ is weaker evidence than a lock on disk, because a record can be stale: if the record names a pid but the lock is gone, the app is gone, and signalling that pid would hit whatever has since recycled it. Report that rather than escalating — **never match on a process name or a port to find it, and never delete a lock to get around a live instance.**

**Everything the app wrote is under `<project-dir>/.janissary/`,** which is what makes teardown a directory removal: the server log at `log/server.log`, the activity log at `log/<YYYY-MM-DD>.json`, `state/`, `config.json`, `db/sqlite/`, `workspace/`, `transcripts/`, `profiles/`, `captures/`, `recordings/`, `harness-transcripts/`, `browser-logs/` and `remote-files/`. The registry in `src/state-dirs.ts` is the full list. A handful of paths also live under the user's home — `~/.janissary/history.json`, `~/.janissary/conversations/`, `~/.janissary/remote-root-locks/` and the project token file — so a start task that set a scratch `HOME` put those in the scratch root too. **Read the record and check that `<project-dir>` was inside the scratch root before you assume removing the root removes the state.** If it was not — because the start task pointed it at the repository or at the user's own directory — then the state is still there, and saying so is this task's job rather than a cleanup somebody else has to discover.

**Read what you need out of the log first.** `log/server.log` holds the server's stdout and stderr, including the `__JANUS_URL__ ` line and any startup failure, and it is inside the scratch root this task is about to delete. Take whatever the caller needs from it — and a note on why the app exited, if it exited by itself — before Step 2 removes the tree.

**The process is detached, so the obvious signals reach nothing.** `bin/janus.mjs` spawns the server `detached: true` into its own process group and `unref`s it, so a `SIGINT` or `Ctrl+C` aimed at the shell that started it, or a kill of that shell, never arrives. The only two things that do are the stop command and a direct `SIGTERM` to the lock's pid, which is the same signal by another route.

**A clean stop takes the children with it,** so nothing of this app's should survive it. `server.shutdown()` disposes every manager in turn — shells, PTYs, ACP sessions, the scheduler loop, workspace clones, file watchers (`src/controller.ts:99`, `src/managers.ts:83`) — and the process's exit handler also kills the detached Chrome process group the app window ran in (`src/main.ts:30`). If you had to stop the app by anything other than the stop command, or if a child is still answering afterwards, say that plainly instead of reporting a clean teardown.

**The app may already be gone, and that is ordinary.** Its lifetime follows its websocket clients: the last one disconnecting makes it broadcast `bye` and exit about a second later (`src/index.ts:93-99`), and closing the last remaining tab quits it outright (`src/tab/close.ts:30`). A run that lost its browser, or closed the last tab, leaves an app that stopped itself — which the stop command reports and Step 1 already calls a successful stop.

**A refusal to signal is usually the sandbox, not the app.** This repository confines the processes it starts, and a confined process can be denied the right to signal one of its own children: `kill -TERM`, `kill -9` and `pkill -f` have all answered `operation not permitted` against a helper this very run had started. Read that as an environment cause and report it as one — it is not a reason to escalate, and it is not a reason to say the cleanup failed silently either. What it leaves behind is usually a process the run can name and attribute but not stop, so say which process, what it was doing, and what it holds: a helper that polls a scratch path and nothing else can be named as harmless rather than swept up. A helper that can watch a sentinel file inside the scratch root and exit when it appears is worth starting in the first place, precisely because this task may not be able to signal it later.

## Step 0 — Read the record

Read `<scratch root>/start-record.txt`. It names the scratch home and working directory, the process identity, the stop command, the address for a web app, the commit under test, and when the app was started. Everything after this step is decided by what that file says and by nothing else.

If the file is absent, say so and continue: an app that was never started leaves a scratch root with no record in it, and clearing that is the whole of this task. Treat the absence as "nothing to stop", never as permission to stop something else.

## Step 1 — Stop what the record names

Use the project's own stop command from the record, in the project directory it was run from. Where the record names no stop command, fall back to the recorded process identity — but only after reading the record in the same breath, so that the identity is the one this scratch root started and not a number that has since been reused. For this project the command is in **Janissary, specifically** above, and the lock file on disk is the authority on whether anything is still running.

Stop the app, including any children it started. A server that exits when its last client disconnects may already be gone; the stop command reports that, and that is a successful stop, not a failure to find something.

If the app cannot be stopped — the stop command fails, or the recorded process is not there — do not escalate to killing by name or by matching a port. Report exactly what you tried, what answered, and what is still running, then go to Step 3. A caller can decide what to do about a process it cannot account for; you do not decide for it.

## Step 2 — Remove the scratch root

Once nothing this run started is still running, remove the scratch root and confirm it is gone. Keep whatever text the caller needs before deleting captures and logs — the caller reads this task's report, not the files. For this project that includes the server log, which lives inside the root; **Janissary, specifically** above says what to take from it first, and says what to check before assuming the root holds all of the state.

If a caller asked for the scratch state to be left in place, because it still has evidence to read, leave it and say so in the report. Leaving it is a decision the caller makes; removing it anyway is not one you may make for it.

## Step 3 — Report the ending

```text
App:        stopped with <stop command> | was not running | could not be stopped — <reason>
Record:     read from <path> | absent
Scratch:    removed | left in place at the caller's request
Teardown:   complete | incomplete — <what is still running>
Status:     stopped: <reason>
```

"Teardown: incomplete" is an honest ending and a common one. An app that will not stop, a scratch root that cannot be removed, a process whose ownership you could not establish — each is reported as what it is, and none of them is reported as a cleanup that happened.
