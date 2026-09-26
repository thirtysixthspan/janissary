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

## Step 0 — Check this app can be started, and stopped

1. Confirm the project directory is the one you were launched in, and read its `AGENTS.md` / `CLAUDE.md` and any guidance they require before running its commands.
2. Establish **both** halves of the recipe before starting anything: the command that builds and runs the app, and the command that stops it. A project whose instructions do not say how to stop the app cannot be started by this task, because what you start would have no defined end and the stop task would have nothing to act on. Report that and stop.
3. Confirm the app can be kept away from real user state: a home directory and every configurable data or cache directory redirectable into the scratch root. A project that insists on reading the real ones is not startable by this task; report that and stop.
4. Confirm the scratch root does not already exist. If it does, an earlier run left it — possibly still running. Do not remove it and do not stop anything: report the path and that the stop task has to clear it first. Removing a live app's state is the stop task's decision, made with the record that run left behind.

## Step 1 — Decide how this app is served

Read the project's instructions in this order: `AGENTS.md` / `CLAUDE.md`, README, then the build tool's script list. For Node projects inspect `package.json` for `build`, `start`, `dev`, `serve`, or `preview`; use equivalent metadata for other toolchains. An interpreted tool may need no build; record that deliberately. If no build-and-run command can be determined, stop with that reason.

Then decide which of two things you are starting:

- **A web app**, which serves a UI and is reached over a socket. It is served on `127.0.0.1`, using the project's own local-only option. The start command must name the loopback address explicitly — a host or bind flag, or a configuration key that defaults to one. If no such form can be determined, stop before starting anything and report the project as unable to be served locally. That is an environment limitation, not a failure to retry.
- **A tool**, with no web UI: a command-line program, a library with an executable, a terminal UI. It is invoked from the scratch working directory, by a path into this workspace's built output. Never substitute an installed release or a globally installed executable for the code in this checkout.

A tool needs no address and gets none in the report; say `tool` where a web app would name an address.

## Step 2 — Create the scratch state

Run `git check-ignore -q <scratch root>`. Exit 0 means it is already ignored. If it is not, append exactly one `temp/` line to the project's root `.gitignore`, creating the file if there is none, and confirm the scratch path is now ignored afterwards. Change no other line. If an existing exception still exposes scratch files, stop and report it; do not rewrite ignore rules. This keeps scratch output out of a later `git add -A`.

Create a home directory and a working directory inside the scratch root, both project-relative and both created new. Use absolute scratch paths when passing them to a child process, so a changed working directory cannot redirect state somewhere else. Apply the scratch home through the child process's environment `HOME` key only; never change your own shell's `HOME` or repurpose the variable. Commands that belong to the repository itself — installs, and anything that commits — keep the user's own identity and environment.

## Step 3 — Build

Build the checked-out code with the recipe from Step 1. Record the commit under test with `git rev-parse HEAD` before building, and confirm it has not moved afterwards. Inspect what the build changed: restore tracked source or configuration the build rewrote, and keep generated runtime artifacts for the app to run against. An interpreted tool that needs no build skips this step, and says so in the report.

## Step 4 — Start it and wait for it

Start the freshly built app with its state pointed at the scratch state, exactly as Step 0 established. Confirm readiness from the app's own output and one real response — a request to the address, or a command run to completion — never from a process listing.

For a web app, confirm the address from the start command and from the startup output wherever the app prints it. A start command that names no address, or names one that is not loopback, is stopped and reported; do not start it and decide afterwards. Use a bounded readiness timeout: the project's documented value where it has one, otherwise 20 seconds.

If the start fails, retry **once**, cleaning up your own failed attempt first — you know it is yours, so that is not the stop task's job. If it still fails, report what the app printed, remove the scratch root you created, and stop. A failure here belongs to the caller, which decides whether it is a defect worth recording. A port held by another process, a sandbox denial, a missing system binary, unavailable credentials, and a project directory another instance already holds are all environment causes: name the one you found rather than the app.

## Step 5 — Write the start record, and hand over

Write `<scratch root>/start-record.txt` with the file-editing tool: the scratch home and working directory, the process identity, the stop command, the address for a web app, the commit under test, and when the app was started. The stop task reads this file, and so does whoever has to clear this scratch root after a run that died. It is a text file of facts, not a script, and it never holds a bearer endpoint, a session token, or a password.

Then report, in this shape:

```text
App:        web — <serve command> on <address> | tool — <command>
Scratch:    <scratch root> — home <path>, work <path>
Tested:     <branch>@<short-sha>
Process:    <process identity> — stop with <stop command>
Record:     <path to start-record.txt>
Build:      ran | not needed
Readiness:  confirmed from <output and response> | not confirmed
```

An address and a stop command are what the caller needs; a credential is not, and never goes in this report. **The app is left running when this task ends.** Ending it is the stop task's step, and the caller's decision when to ask.
