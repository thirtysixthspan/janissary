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

## Step 0 — Read the record

Read `<scratch root>/start-record.txt`. It names the scratch home and working directory, the process identity, the stop command, the address for a web app, the commit under test, and when the app was started. Everything after this step is decided by what that file says and by nothing else.

If the file is absent, say so and continue: an app that was never started leaves a scratch root with no record in it, and clearing that is the whole of this task. Treat the absence as "nothing to stop", never as permission to stop something else.

## Step 1 — Stop what the record names

Use the project's own stop command from the record, in the project directory it was run from. Where the record names no stop command, fall back to the recorded process identity — but only after reading the record in the same breath, so that the identity is the one this scratch root started and not a number that has since been reused.

Stop the app, including any children it started. A server that exits when its last client disconnects may already be gone; the stop command reports that, and that is a successful stop, not a failure to find something.

If the app cannot be stopped — the stop command fails, or the recorded process is not there — do not escalate to killing by name or by matching a port. Report exactly what you tried, what answered, and what is still running, then go to Step 3. A caller can decide what to do about a process it cannot account for; you do not decide for it.

## Step 2 — Remove the scratch root

Once nothing this run started is still running, remove the scratch root and confirm it is gone. Keep whatever text the caller needs before deleting captures and logs — the caller reads this task's report, not the files.

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
