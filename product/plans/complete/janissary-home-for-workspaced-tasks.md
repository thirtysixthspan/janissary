# Give a workspaced agent the janissary install root, and the sandbox read access to its `ai/` directory

**Complexity: 5/10** — one new two-function module, one read carve-in and one environment variable in the sandbox (both following patterns already there), one changed string in the task picker, and the removal of the now-unused protocol field that string used to need. No new architecture.

The task picker lists two sources: the project's own `ai/tasks/` and the tasks that ship with the running janissary. Picking a project task inserts `execute ./ai/tasks/<path>`, which resolves against the agent's working directory. Picking a janissary task inserts `execute <janissaryTasksDir>/<path>` — an absolute path the server computes from its own installation and sends to the client on every state event.

That absolute path fails a workspaced tab twice over.

It is unreadable. A workspaced tab's processes run under a Seatbelt profile that denies reads of `$HOME`'s contents outside a fixed carve-in list, and a janissary installation is very often under `$HOME` — a global npm install (`~/.npm-global/lib/node_modules/janissary`, or an nvm-managed prefix), or a development checkout in `~/dev`. The agent is handed a path to a task file it cannot open, and the task never runs.

It is also the wrong machine's path. `janissaryTasksDir` is the *local* server's installation directory, computed once and broadcast to the browser. A tab whose processes run on a remote host (see [[remote-server]]) gets that local path even though the agent executing the command lives on the far side, where janissary is installed somewhere else entirely.

Both problems have the same shape: the install root is a fact about whichever janissary actually spawns the process, and only that process's own environment can say what it is. So the picker stops naming a path at all and inserts `execute $janissary/ai/tasks/<path>`, every spawned process is handed `janissary` set to its own install root, and the sandbox carves that installation's `ai/` directory into the read allow-list so the task file the command names can be opened.

## Approach

**`$janissary`, not an absolute path.** The picker inserts the variable reference verbatim, exactly as it inserts everything else (the spec's "the path is inserted verbatim, with no quoting or escaping" already covers this). An agent that receives `execute $janissary/ai/tasks/work-an-issue.md` expands it the way it expands any other variable in a shell command, and gets the installation on the machine it is itself running on. Project tasks keep their relative `./ai/tasks/<path>` form — the working directory has always been the right anchor for those, and a workspace clone carries the project's `ai/` inside it.

**The variable is set for every spawn, not only a workspaced one.** The picker inserts one command shape and does not know — and should not need to know — whether the tab it is populating is workspaced. A plain agent tab that received `$janissary` with nothing to expand would be worse off than it is today. So `sandboxSpawn` adds it on both of its paths: the confined one, next to `JANISSARY_NODE`, and the pass-through one it returns for an unconfined or non-workspaced spawn. That widens the pass-through's contract from "returns the input unchanged" to "returns the command and args unchanged" — the same widening `withWorkspaceCredentials` already made for the credentials, and for the same reason: what a process needs to be handed is not a question about whether the kernel is confining it. The e2e browser child is the one deliberate exception; it takes an environment allowlist rather than the scrub, launches no agent, and runs no task.

**Lowercase `janissary`.** The variable's whole purpose is to be spelled `$janissary` in a command a human reads in the command line and an agent expands. A shell is case-sensitive, so the name has to be what the command says; a `JANISSARY_HOME` spelling would need the command to say `$JANISSARY_HOME`, which is the same fact in a louder voice. `JANISSARY_NODE` and `JANISSARY_PLAYWRIGHT` stay as they are — those are read by scripts, never typed.

**One narrow read carve-in: `<install root>/ai`.** Added to the profile beside `SELF_DIR`/`SERVER_NODE_DIR`/`PLAYWRIGHT_DIR`, which are already there for the same class of reason — a directory of janissary's own that a sandboxed process legitimately needs to read. It is carved in as a `subpath` in both literal and realpath-resolved form (`dualPath`), since an npm-global install is commonly reached through a symlinked prefix. Deliberately `ai/` alone rather than the whole install root: `ai/` is the guidelines, personas, and task prompts an agent is meant to read, and nothing under it is a secret. The rest of the installation — `node_modules`, any working tree state — stays denied, and the secret denies still win last regardless, since they are applied after every carve-in.

**Unconditional, like the Playwright carve-in.** Every workspaced spawn gets it, not just one launched from the task picker. The picker cannot be known about at spawn time, the directory holds no user data, and gating it would mean threading a flag through `SandboxOptions`, `spawnPty`, and the remote spawn path to withhold read access to janissary's own prompts.

**`janissaryRoot()` moves to its own module.** It lives in `src/tasks.ts` today and is computed from `import.meta.dirname/..`, which only gives the install root from a module that compiles to the top level of `dist/`. `src/sandbox/index.ts` compiles to `dist/sandbox/`, so it cannot compute the same answer and must import it. A new `src/janissary-root.ts` holds `janissaryRoot()`, `janissaryAiDir()`, and the `JANISSARY_HOME_ENV` name; `tasks.ts` imports it rather than defining its own.

**`janissaryTasksDir` leaves the protocol.** It exists for exactly one consumer — the string the picker builds — and that string no longer needs it. Left in place it would be a state field describing the wrong machine, refreshed on every state event, read by nothing. The server-side `janissaryTasksDir()` helper goes with it; `janissaryRoot()` stays, since the sandbox and `listTasks` both use it.

## Implementation steps

1. `src/janissary-root.ts` — new module: `janissaryRoot()` (moved from `tasks.ts`, comment included), `janissaryAiDir()`, and `JANISSARY_HOME_ENV`, with a comment saying what `$janissary` is for and why the name is lowercase.
2. `src/tasks.ts` — import `janissaryRoot` from the new module; delete the local definition and `janissaryTasksDir()`.
3. `src/protocol/events.ts` — drop `janissaryTasksDir` from `StateEvent`.
4. `src/state-event.ts` — drop the field and its import.
5. `src/sandbox/index.ts` — carve `janissaryAiDir()` in as `JANISSARY_AI_L`/`JANISSARY_AI_R` via `dualPath`; set the `janissary` variable on the confined path beside `JANISSARY_NODE` and on the pass-through path beside the workspace credentials; update the function's contract comment.
6. `src/sandbox/profile.ts` — add the two params to the read allow-list, with a comment covering what the directory is and why it is narrower than the install root.
7. `web/src/pickers/useTaskPicker.ts` — insert `execute $janissary/ai/tasks/<path>` for a janissary-source task; drop the `janissaryTasksDir` parameter and update the header comment.
8. `web/src/pickers/usePopulatePickers.ts`, `web/src/pickers/usePickerOverlays.ts`, `web/src/App.tsx`, `web/src/useServerState.ts` — remove the plumbing that carried the field from the state event to the picker.
9. `product/specs/task-picker.md` — record that a Janissary task inserts `execute $janissary/ai/tasks/<path>` and what `$janissary` is.
10. `product/specs/sandbox.md` — add the `ai/` read carve-in to the filesystem policy and the `janissary` variable to environment scrubbing, including that it reaches an unconfined and non-workspaced spawn too.
11. `documentation/developer-documentation/workspace-sandbox.md` — correct the reads bullet and the environment-variables bullet, which both describe behavior this changes.

## Tests

- `src/janissary-root.test.ts` (new): `janissaryRoot()` names a directory holding this repo's own `ai/` and `package.json`; `janissaryAiDir()` is that root's `ai/`.
- `src/sandbox/index.test.ts` (extended): a confined spawn's `-D` params carry `JANISSARY_AI_L`/`JANISSARY_AI_R` pointing at the install's `ai/` directory in both forms; the profile's read allow-list names both params; `janissary` is set to the install root on a confined spawn, on an unconfined workspaced spawn, and on a spawn with no `workspaceDir` at all; the two pass-through cases keep their command and args and gain only that variable.
- `web/src/pickers/useTaskPicker.test.ts` (updated): a janissary-source task inserts `execute $janissary/ai/tasks/<path>`; a project task still inserts `execute ./ai/tasks/<path>`; the harness-tab path sends the same `$janissary` text into the PTY.
- `web/src/useServerState.test.ts`, `web/src/ws.test.ts`, `web/src/App.test.tsx`, `web/src/pickers/usePickerOverlays.test.tsx` (updated): drop the removed state field from their fixtures.
- `src/sandbox/live.sandbox.test.ts` (extended): a live sandboxed process reads a real file under the install's `ai/` directory successfully, and is still denied a file elsewhere under the install root. Run with `npm run test:sandbox`, which `check-diff` does not cover.

## Out of scope

- **Write access to the installation.** Reads only. An agent that could write janissary's own `ai/` could rewrite the prompts a later, unsandboxed run follows.
- **Carving in the whole install root.** `ai/` is what a task needs. `node_modules` and the rest of the tree stay denied.
- **Teaching the agent to expand `$janissary` itself.** It is an ordinary environment variable; a shell expands it, and every path a task file names is already relative to the project.
- **The `execute` command's own handling.** Nothing parses the inserted text on the server — it is freeform input for the agent, as the task-picker spec says, and stays that way.
- **New user documentation for the built-in task section.** `documentation/user-documentation/command-bar/tasks.md` documents only the project-source `execute ./ai/tasks/<filename>` insertion, which is unchanged, and never described the built-in section's absolute path; adding it now would be new documentation rather than a correction. The developer-facing sandbox page does describe the read carve-ins and the added environment variables, so that page is corrected.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step, plus `npm run test:sandbox` once for the live carve-in test.

Manual: open a workspaced agent tab, pick a Janissary task from the picker, and confirm the agent can read and run the file the inserted command names.
