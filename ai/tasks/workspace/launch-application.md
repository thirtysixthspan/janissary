# Launch Application

Your job: get the project's app built, running, and reachable on this machine, isolated from real user state, and report exactly how to reach it and how to stop it. You start the app; you never drive it. A caller that needs to interact with the app — a browser, a terminal, its own test — connects to what you started and is responsible for what it does with it. You also own the app's lifetime: nothing you started outlives your teardown step.

**Invocation.** An optional scratch root, a project-relative directory the caller names and owns, for example `./temp/find-bugs/`. With none given, use `./temp/launch-application/`. You create it, you remove it, and everything you write lives inside it.

**Use the project's own copy of this task when it has one.** If the project has `ai/tasks/workspace/launch-application.md`, read that and follow it instead of this file. A project that ships its own launch task knows things about running its app that no generic task can; the project copy wins for the same reason the task picker offers it in preference to the built-in task at the same path.

**Project `./product/` directory.** Every `./product/...` path in this task refers to the product directory in the current working directory — the project being worked on — never to the Janissary installation's own `product/`, even when this task was launched as `execute $janissary/ai/tasks/workspace/launch-application.md`. Project commands run in this project; Janissary's workflow scripts are reached through `$janissary/scripts/run.mjs`.

**No AI attribution anywhere.** Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming an AI, no generated-by lines or badges, and no authorship notes in files, commit messages, or reports. The commit's configured git author is the only authorship recorded.

**Run autonomously.** Do not ask the user questions or wait for feedback. Follow the steps in order, make judgment calls within these rules, and stop only for the conditions named here. Every stop runs Step 6.

**Command hygiene for the whole run.** Run commands plainly and read their output from the tool result. No output-filtering pipes into `grep`, `tail`, or `head`, no `>`/`>>` redirects, and no `$(...)` capture. Use the file-editing tool for anything you write. Commands shown with placeholders need the literal values read from earlier output; shell variables do not persist between calls.

## What you may and may not do

### Allowed

Read any file in the project, including its own instructions. Run the project's build, launch, seed, and fixture commands. Append one missing `temp/` line to the project's root `.gitignore`, and nothing else in it. Create and delete anything under the scratch root. Keep the app running until the caller says otherwise.

### Forbidden

1. Editing tracked files other than the one missing `temp/` line in `.gitignore`. Restoring changes this run is provably responsible for is allowed; changing source, tests, specs, documentation, or configuration is not.
2. Launching a browser, closing or killing a browser, or navigating to a `file:` URL. Launching the app and reaching it are different acts; a browser is never involved in this task.
3. Driving the app — sending it a request, a keystroke, or a command to see what it does. That is the caller's work, and doing it here means the caller cannot tell what it observed from what you observed.
4. Starting an app the human is already running, or any instance other than the one you started. Never look up the address or credentials of a live session.
5. Running `npm run check`, the test suite, lint, or other quality/analysis tooling. You are starting the product, not testing it.
6. Installing anything outside the project's lockfile, including a browser or a driver library. Run the project's own install if the app needs one and it is missing, and nothing beyond it.
7. Binding a web app to any address but `127.0.0.1`, or leaving one running that is bound wider.
8. Inspecting a process or a socket to learn what an address is, what a pid is doing, or whether something is still alive. Read it from the command and the output; an unattended run cannot answer an approval prompt, so a check that needs one never runs.

## Step 0 — Check you can start it, and how you would stop it

1. Confirm the project directory is the one you were launched in, and read its `AGENTS.md` / `CLAUDE.md` and any guidance they require before running its commands.
2. Establish **both** halves of the recipe before starting anything: the command that builds and runs the app, and the command that stops it. A project whose instructions do not say how to stop the app cannot be started by this task, because nothing you start would have a defined end. Report that and stop.
3. Confirm the app can be kept away from real user state: a home directory and every configurable data or cache directory redirectable into the scratch root. A project that insists on reading the real ones is not startable by this task; report that and stop.

## Step 1 — Decide how this app is served

Read the project's instructions in this order: `AGENTS.md` / `CLAUDE.md`, README, then the build tool's script list. For Node projects inspect `package.json` for `build`, `start`, `dev`, `serve`, or `preview`; use equivalent metadata for other toolchains. An interpreted tool may need no build; record that deliberately. If no build-and-run command can be determined, stop with that reason.

Then decide which of two things you are launching:

- **A web app**, which serves a UI and is reached over a socket. It is served on `127.0.0.1`, using the project's own local-only option. The start command must name the loopback address explicitly — a host or bind flag, or a configuration key that defaults to one. If no such form can be determined, stop before starting anything and report the project as unable to be served locally. That is an environment limitation, not a failure to retry.
- **A tool**, with no web UI: a command-line program, a library with an executable, a terminal UI. It is invoked from the scratch working directory, by a path into this workspace's built output. Never substitute an installed release or a globally installed executable for the code in this checkout.

A tool needs no address and gets none in the report; say `tool` where a web app would name an address.

## Step 2 — Create the scratch state

Run `git check-ignore -q <scratch root>`. Exit 0 means it is already ignored. If it is not, append exactly one `temp/` line to the project's root `.gitignore`, creating the file if there is none, and confirm the scratch path is now ignored afterwards. Change no other line. If an existing exception still exposes scratch files, stop and report it; do not rewrite ignore rules. This keeps scratch output out of a later `git add -A`.

If the scratch root already exists, it is left over from an interrupted run. Stop only the processes that run started, using the launch details and process identities recorded inside it; never kill by a broad process-name match or trust a recycled pid. If ownership cannot be established, stop and report rather than killing something you cannot identify. Then remove the directory. Remove only the project-local scratch root you were given, never a parent of it, never the workspace, and never through a symlink that leaves the project.

Create a home directory and a working directory inside it, both under the scratch root. Put logs, fixtures, drivers, and process records there too. Use absolute scratch paths when passing them to a child process, so a changed working directory cannot redirect state somewhere else. Apply the scratch home through the child process's environment `HOME` key only; never change your own shell's `HOME` or repurpose the variable. Commands that belong to the repository itself — installs, and anything that commits — keep the user's own identity and environment.

## Step 3 — Build

Build the checked-out code with the recipe from Step 1. Record the commit under test with `git rev-parse HEAD` before building, and confirm it has not moved afterwards. Inspect what the build changed: restore tracked source or configuration the build rewrote, and keep generated runtime artifacts until teardown. An interpreted tool that needs no build skips this step, and says so in the report.

## Step 4 — Start it and wait for it

Start the freshly built app with its state pointed at the scratch state, exactly as Step 0 established. Record its process identity and the stop command from Step 0. Confirm readiness from the app's own output and one real response — a request to the address, or a command run to completion — never from a process listing.

For a web app, confirm the address from the start command and from the startup output wherever the app prints it. A start command that names no address, or names one that is not loopback, is stopped and reported; do not start it and decide afterwards. Use a bounded readiness timeout: the project's documented value where it has one, otherwise 20 seconds.

If the start fails, retry **once** after stopping your own failed attempt. If it still fails, report what the app printed and stop — a failure here belongs to the caller, which decides whether it is a defect worth recording. A port held by another process, a sandbox denial, a missing system binary, unavailable credentials, and a project directory another instance already holds are all environment causes: name the one you found rather than the app.

## Step 5 — Hand it over

Report, in this shape, and keep it while the app runs:

```text
App:        web — <serve command> on <address> | tool — <command>
Scratch:    <scratch root> — home <path>, work <path>
Tested:     <branch>@<short-sha>
Process:    <process identity> — stop with <stop command>
Build:      ran | not needed
Readiness:  confirmed from <output and response> | not confirmed
```

Never put a bearer endpoint, session token, or password in this report or anywhere else. An address and a stop command are what the caller needs; a credential is not.

## Step 6 — Stop it and clean up

Run this step on every exit from this task, including every stop above, and do not leave the app running behind you.

Stop what you started, using the process identity and the stop command you recorded, including child processes. If teardown cannot finish safely, report exactly what is still running and do not claim otherwise. Never kill an unrelated process to tidy up.

Then remove the scratch root and confirm it is gone. Keep whatever text the caller needs before deleting captures and logs. If a caller asked you to leave the scratch state in place — evidence it still has to read — leave it, and say so in the report.

## Step 7 — Report the ending

```text
App:        stopped | left running at the caller's request | failed to start — <reason>
Scratch:    removed | left in place
Teardown:   complete | incomplete — <what remains>
Status:     running | stopped: <reason>
```
