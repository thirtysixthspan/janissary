# Start Application

Your job: get the project's app built, started, and reachable on this machine, isolated from real user state, and report exactly how to reach it and how to stop it. You start the app; you never drive it, and you never stop it. A caller that needs to interact with the app — a browser, a terminal, its own test — connects to what you started and is responsible for what it does with it. Ending the app is [`stop-application.md`](stop-application.md)'s work, and it reads what you write here.

**Invocation.** An optional scratch root, a project-relative directory the caller names and owns, for example `./temp/find-bugs/`. With none given, use `./temp/start-application/`. You create it, you record what you started in it, and the stop task clears it.

**Use the project's own copy of this task when it has one.** If the project has `ai/tasks/workspace/start-application.md`, read that and follow it instead of this file. A project that ships its own start task knows things about running its app that no generic task can; the project copy wins for the same reason the task picker offers it in preference to the built-in task at the same path.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary installation's own `product/`, even when this task was launched as `execute $janissary/ai/tasks/workspace/start-application.md`. Project commands run in this project; Janissary's workflow scripts are reached through `$janissary/scripts/run.mjs`.

**No AI attribution anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming an AI, no generated-by lines or badges, and no authorship notes in files, commit messages, or reports. The commit's configured git author is the only authorship recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback. Follow the steps in order, make judgment calls within these rules, and stop only for the conditions named here. A stop leaves the scratch root as it found it — nothing was started, so there is nothing to stop — and says so.

**Command hygiene for the whole run.** Run commands plainly and read their output from the tool result. No output-filtering pipes into `grep`, `tail`, or `head`, no `>`/`>>` redirects, and no `$(...)` capture. Use the file-editing tool for anything you write. Commands shown with placeholders need the literal values read from earlier output; shell variables do not persist between calls.

## What you may and may not do

### Allowed

Read any file in the project, including its own instructions. Run the project's build, start, seed, and fixture commands. Append one missing `temp/` line to the project's root `.gitignore`, and nothing else in it. Create and delete anything under the scratch root. Write the start record the stop task reads. Leave the app running when this task ends.

### Forbidden

1. Editing tracked files other than the one missing `temp/` line in `.gitignore`. Restoring changes this run is provably responsible for is allowed; changing source, tests, specs, documentation, or configuration is not.
2. Stopping the app, or removing the scratch root, once it is running. That is [`stop-application.md`](stop-application.md)'s work. The one exception is a start attempt of your own that failed and has to be cleaned up before the single retry.
3. Removing a scratch root that was already there when you began. It belongs to an earlier run; report it and let the stop task clear it, because only that task is built to establish what started it.
4. Launching a browser, closing or killing a browser, or navigating to a `file:` URL. Starting the app and reaching it are different acts; a browser is never involved in this task.
5. Driving the app — sending it a request, a keystroke, or a command to see what it does. That is the caller's work, and doing it here means the caller cannot tell what it observed from what you observed.
6. Starting an app the human is already running, or any instance other than the one you started. Never look up the address or credentials of a live session.
7. Running `npm run check`, the test suite, lint, or other quality/analysis tooling. You are starting the product, not testing it.
8. Installing anything outside the project's lockfile, including a browser or a driver library. Run the project's own install if the app needs one and it is missing, and nothing beyond it.
9. Binding a web app to any address but `127.0.0.1`, or leaving one running that is bound wider.
10. Inspecting a process or a socket to learn what an address is, what a pid is doing, or whether something is still alive. Read it from the command and the output; an unattended run cannot answer an approval prompt, so a check that needs one never runs.

## Janissary, specifically

Everything in this section is what this repository's app _is_, so that no step below has to go looking for it. A line naming a file is the source of the fact, not somewhere to change anything.

**It is a web app, and it is loopback-only by construction.** The server binds `127.0.0.1` and nothing can widen it: `src/index.ts:22` defaults `host` to `127.0.0.1` and `src/main.ts:87` never passes one, so there is no `--host` flag to find and no way to bind wider by accident. A second guard refuses any request whose `Host` — or `Origin`, when present — is not loopback, with a 403 (`src/security.ts:14`), and the websocket upgrade sits behind the same check. Name the loopback address explicitly only when you want a known port, as `--port=<n>`; otherwise the OS assigns one and the start command tells you which.

**The command is `node bin/janus.mjs --no-open <project-dir>`.** `bin/janus.mjs` is a detaching launcher, not the server. It redirects the server's stdout and stderr into `<project-dir>/.janissary/log/server.log`, polls that file for the `__JANUS_URL__ ` marker that `src/main.ts:90` writes, and then — because of `--no-open` — prints the token-gated URL to its own stdout and exits 0 (`bin/janus.mjs:90-96`). So run it in the foreground, read the address and the token off its output, and the server outlives the command: it is spawned `detached: true` into its own process group and `unref`'d. Without `--no-open` the launcher prints nothing and opens an app window on the host, which this task must not do. If the child dies first, the launcher tails the last 200 log lines to stderr and exits with the child's code; if no marker arrives within 20 seconds it kills the process group and prints `failed to start: timed out waiting for the server`.

**`<project-dir>` is the content project, not the checkout.** It is the directory the shell, the file navigator, the tabs and every `open` path resolve against — not where the code lives, and not where the state goes by default. Point it at a directory inside the scratch root and the app's whole state lands there instead of in the repository. It is also how you stay clear of a live human session: one instance runs per directory, enforced by `<project-dir>/.janissary/lock` (`src/instance-lock.ts:66`), so a scratch directory cannot collide with one.

**All project-scoped state is under `<project-dir>/.janissary/`, and no environment variable moves it.** There is no `JANUS_STATE_DIR`, `JANUS_LOG_DIR`, `JANUS_HOST` or `JANUS_PORT`; the positional argument is the only lever, which is what makes that argument the whole isolation story. `boot()` builds and sweeps the tree through the registry in `src/state-dirs.ts`, which is where to read what lands where: `lock`, `log/server.log`, `log/<YYYY-MM-DD>.json` (the activity log), `state/`, `config.json`, `db/sqlite/`, `workspace/` (agent clones), `transcripts/`, `profiles/`, `captures/`, `recordings/`, `harness-transcripts/`, `browser-logs/`, `remote-files/`, and the per-project override and token files.

**A scratch `HOME` is the other half of isolation, and it is a real boundary rather than a formality.** Some state goes through `os.homedir()` — `~/.janissary/history.json`, `~/.janissary/conversations/`, `~/.janissary/remote-root-locks/` and the project token file (`src/global-history.ts:69`, `src/conversations/store.ts:65`, `src/remote/serve-root-lock.ts:26`, `src/project/tokens.ts:83`) — and Node honors `HOME` on POSIX, so `HOME=<scratch home>` in the child environment moves all of it. It moves the sandbox profile's home as well (`src/sandbox/index.ts:191`), so agents the app spawns are confined to the scratch home too. Pass it as the child's environment key only; never repurpose your own shell's `HOME`.

**The build is `npm run build` — `tsc`, then `vite build` — and its output is already ignored.** `dist/` and `web/dist/` are both in `.gitignore`, so a build rewrites no tracked file and leaves the tree as it found it. Two things in its output look alarming and are not: vite lists every bundled pdfjs CMap and standard font, and it warns that the main chunk and the pdf worker exceed 500 kB. Compiling the server is optional — `bin/janus.mjs:12-27` runs `dist/main.js` when it exists, else `src/main.ts` through the workspace's own `tsx`, else `npx tsx` — but **`web/dist/index.html` is not optional**: `src/main.ts:84` refuses to boot without it and names `npm run build:web` in the error. Build, then confirm `git status --short` is still empty.

**Readiness has a known shape.** The address comes from the start command's own stdout, and one real request to it answers `200` with the 396-byte `web/dist/index.html`. The token travels in the query string, so a request without it — or with a non-loopback `Host` — is refused; `curl` against `127.0.0.1` is the check, and a `403` means the header was wrong rather than the app being down. Read a start failure literally: `another janus instance is already running in this directory (pid N)` is the lock, and the answer is a different `<project-dir>`, never deleting the lock.

**What the app does on its own, which the caller has to be told.** The server's lifetime follows its websocket clients: when the last one disconnects it broadcasts `bye` — every browser window closes itself on that frame (`web/src/ws.ts:143`) — and exits about a second later (`src/index.ts:93-99`). Closing the last remaining tab quits it (`src/tab/close.ts:30`), as do `quit` and `exit`. A start that only builds and starts therefore leaves a healthy app behind, and a caller that connects to it must hold a client open for as long as it wants the app to stay. That belongs in the report: it is the one property of what you started that the caller cannot read off an address.

**How to stop it: `node bin/janus.mjs stop <project-dir>`.** It reads the pid from `<project-dir>/.janissary/lock` and sends it `SIGTERM` (`src/stop-instance.ts:10`), and it runs before the lock is taken (`src/main.ts:65`), so it works even against a wedged instance. With nothing to stop it prints `no running janus instance for <dir>` and exits 0, which is a successful stop rather than a failure to find something. `stop-application.md` is the task that acts on any of this.

**The attached e2e browser, when the tab has one.** `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are the whole surface, and `ai/guidelines/sandbox-e2e-browser.md` is the manual. Three things about it are worth having before you need them. The guard dials the browser afresh per client connection (`src/browser/e2e-guard.ts:78`), so **every `chromium.connect()` is its own session and `browser.contexts()` comes back empty on the second one** — a holder process cannot lend its page to a later script, and each driver has to open its own context and page. The tab counts a browser found dead at the next connect as a failed start unless it ran for 30 seconds, and after three it is out of browsers permanently and answers `e2e browser will not be restarted` (`src/browser/e2e-server.ts:153`, `src/browser/e2e-refusal.ts:9`) — so a holder that reconnects on a short loop spends the tab's entire budget and ends the run. Back off, and treat that message as final rather than retrying it. And `ERR_CONNECTION_REFUSED` from a `page.goto` at the app's address means **the app has exited**, usually through the last-client shutdown above because the holder's page went first, rather than that the browser is gone.

## Step 0 — Check this app can be started, and stopped

1. Confirm the project directory is the one you were launched in, and read its `AGENTS.md` / `CLAUDE.md` and any guidance they require before running its commands.
2. Establish **both** halves of the recipe before starting anything: the command that builds and runs the app, and the command that stops it. A project whose instructions do not say how to stop the app cannot be started by this task, because what you start would have no defined end and the stop task would have nothing to act on. Report that and stop. For this project both halves are named in **Janissary, specifically** above.
3. Confirm the app can be kept away from real user state: a home directory and every configurable data or cache directory redirectable into the scratch root. A project that insists on reading the real ones is not startable by this task; report that and stop. For this project the two levers are the positional `<project-dir>` and the child's `HOME`, and **Janissary, specifically** above says which state each one moves.
4. Confirm the scratch root does not already exist. If it does, an earlier run left it — possibly still running. Do not remove it and do not stop anything: report the path and that the stop task has to clear it first. Removing a live app's state is the stop task's decision, made with the record that run left behind.

## Step 1 — Decide how this app is served

Read the project's instructions in this order: `AGENTS.md` / `CLAUDE.md`, README, then the build tool's script list. For Node projects inspect `package.json` for `build`, `start`, `dev`, `serve`, or `preview`; use equivalent metadata for other toolchains. An interpreted tool may need no build; record that deliberately. If no build-and-run command can be determined, stop with that reason.

Then decide which of two things you are starting:

- **A web app**, which serves a UI and is reached over a socket. It is served on `127.0.0.1`, using the project's own local-only option. The start command must name the loopback address explicitly — a host or bind flag, or a configuration key that defaults to one. If no such form can be determined, stop before starting anything and report the project as unable to be served locally. That is an environment limitation, not a failure to retry. A loopback address hard-coded in the server's own source counts as the third form, not as an absence of one: it is strictly stronger than a flag, because nothing at the command line can widen it. This project is that case, and **Janissary, specifically** above says so — so the start command names no address at all, and reporting this project as unable to be served locally would be wrong.
- **A tool**, with no web UI: a command-line program, a library with an executable, a terminal UI. It is invoked from the scratch working directory, by a path into this workspace's built output. Never substitute an installed release or a globally installed executable for the code in this checkout.

A tool needs no address and gets none in the report; say `tool` where a web app would name an address.

## Step 2 — Create the scratch state

Run `git check-ignore -q <scratch root>`. Exit 0 means it is already ignored. If it is not, append exactly one `temp/` line to the project's root `.gitignore`, creating the file if there is none, and confirm the scratch path is now ignored afterwards. Change no other line. If an existing exception still exposes scratch files, stop and report it; do not rewrite ignore rules. This keeps scratch output out of a later `git add -A`.

Create a home directory and a working directory inside the scratch root, both project-relative and both created new. Use absolute scratch paths when passing them to a child process, so a changed working directory cannot redirect state somewhere else. Apply the scratch home through the child process's environment `HOME` key only; never change your own shell's `HOME` or repurpose the variable. Commands that belong to the repository itself — installs, and anything that commits — keep the user's own identity and environment.

**For this project the working directory is also the `<project-dir>` the start command takes.** That single argument is where all of the app's state goes, so passing the scratch working directory is what keeps `.janissary/` out of the repository and away from a live session on the checkout. Pass the absolute scratch path, never a relative one: the launcher resolves the argument against its own working directory when it computes the log path (`bin/janus.mjs:84`), and it creates that log directory before the server has started.

## Step 3 — Build

Build the checked-out code with the recipe from Step 1. Record the commit under test with `git rev-parse HEAD` before building, and confirm it has not moved afterwards. Inspect what the build changed: restore tracked source or configuration the build rewrote, and keep generated runtime artifacts for the app to run against. An interpreted tool that needs no build skips this step, and says so in the report. For this project that is `npm run build`, and **Janissary, specifically** above says which of its outputs are required and why the tree stays clean.

## Step 4 — Start it and wait for it

Start the freshly built app with its state pointed at the scratch state, exactly as Step 0 established. Confirm readiness from the app's own output and one real response — a request to the address, or a command run to completion — never from a process listing.

For a web app, confirm the address from the start command and from the startup output wherever the app prints it. A start command that names no address, or names one that is not loopback, is stopped and reported; do not start it and decide afterwards. Use a bounded readiness timeout: the project's documented value where it has one, otherwise 20 seconds.

If the start fails, retry **once**, cleaning up your own failed attempt first — you know it is yours, so that is not the stop task's job. If it still fails, report what the app printed, remove the scratch root you created, and stop. A failure here belongs to the caller, which decides whether it is a defect worth recording. A port held by another process, a sandbox denial, a missing system binary, unavailable credentials, and a project directory another instance already holds are all environment causes: name the one you found rather than the app.

## Step 5 — Write the start record, and hand over

Write `<scratch root>/start-record.txt` with the file-editing tool: the scratch home and working directory, the process identity, the stop command, the address for a web app, the commit under test, and when the app was started. The stop task reads this file, and so does whoever has to clear this scratch root after a run that died. It is a text file of facts, not a script, and it never holds a bearer endpoint, a session token, or a password.

**For this project the process identity is the lock file, and that is worth spelling out.** Record the pid in `<project-dir>/.janissary/lock` together with the path of the lock file itself, because that is what the stop command reads and what tells a later run whether the app is still up: the app removes the lock as it exits (`src/main.ts:98` → `src/instance-lock.ts:80`), so a lock that is present means running and a lock that is gone means it already stopped on its own. Say which of those two the record describes. If the app has exited, write `none running` rather than a pid — a stale pid in a record is one the stop task must not signal, and it will be reported as unclearable. Do not record the session token; it can be read back off the `__JANUS_URL__` line in `<project-dir>/.janissary/log/server.log`, and nothing about stopping the app needs it. If the run starts the app more than once, rewrite the record at hand-over so it describes the instance that is actually running.

Then report, in this shape:

```text
App:        web — <serve command> on <address> | tool — <command>
Scratch:    <scratch root> — home <path>, work <path>
Tested:     <branch>@<short-sha>
Process:    <process identity> — stop with <stop command>
Record:     <path to start-record.txt>
Build:      ran | not needed
Readiness:  confirmed from <output and response> | not confirmed
Lifetime:   <what ends the app on its own, and what the caller must hold open to keep it>
```

An address and a stop command are what the caller needs; a credential is not, and never goes in this report. **The app is left running when this task ends.** Ending it is the stop task's step, and the caller's decision when to ask.
