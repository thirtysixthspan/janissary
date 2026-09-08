# Point the built-in tasks at `$janissary/scripts`, and give the sandbox read access to that directory

**Complexity: 5/10** — one new one-line function beside `janissaryAiDir()`, one read carve-in built from the pattern the `ai/` carve-in already established, one cwd-relative path in a script made self-relative, and a mechanical rewrite of one command string across the task prompts. No new architecture.

The task picker inserts `execute $janissary/ai/tasks/<path>` for a built-in task, so a Janissary task prompt now runs against whatever project the tab is open on — not only against a checkout of Janissary itself. Every one of those prompts then tells the agent to run `./scripts/run.mjs check-diff`, `./scripts/run.mjs pr-commit`, and the rest. That path resolves against the agent's working directory, which is the project, and outside a Janissary checkout the project has no `scripts/run.mjs`. The prompt names a runner that is not there.

The install root is already the answer to exactly this question, and it is already in the agent's environment. `scripts/` ships in the package (`package.json`'s `files` list) beside `ai/`, so `$janissary/scripts/run.mjs` names the runner on whichever machine the process is actually running on — the same fact, and the same fix, as the task path itself.

Two things have to be true for that to work. The runner has to be readable: a workspaced tab's processes run under a Seatbelt profile that denies reads of `$HOME`'s contents, and a Janissary installation is commonly under `$HOME`, so `scripts/` needs the carve-in `ai/` already has. And the runner has to work from a foreign working directory: `check-diff.mjs` invokes its sibling as the cwd-relative `scripts/lint-files.mjs`, which finds nothing when cwd is not a Janissary checkout.

## Approach

**`$janissary/scripts/run.mjs`, not `./scripts/run.mjs`.** A straight substitution in the task prompts, in prose mentions as well as runnable blocks — a prompt that names the command two ways teaches the agent the wrong one half the time. The runner is still the only entry point; only its anchor changes, from the working directory to the installation. The scripts it dispatches to are cwd-relative in what they operate *on* (`git`, `gh`, `npm` all act on the working directory), which is what makes this correct rather than merely resolvable: the runner comes from the installation, the work happens in the project.

**One narrow read carve-in: `<install root>/scripts`.** Added beside `JANISSARY_AI_L`/`JANISSARY_AI_R` as `JANISSARY_SCRIPTS_L`/`JANISSARY_SCRIPTS_R`, in both literal and realpath-resolved form via `dualPath`, since an npm-global install is commonly reached through a symlinked prefix. Read-only and `scripts/` alone, for the same reasons the `ai/` carve-in is read-only and narrow: these are Janissary's own trusted scripts, they hold no user data, and an agent able to write them could rewrite what a later, unsandboxed run executes. `node_modules` and the rest of the tree stay denied, and the secret denies still win last.

Reads are all that is needed. The profile already allows `process-exec` everywhere except `/tmp`, and `node`/`bash` reach the file through an ordinary read — which is precisely what the `$HOME` content deny was refusing.

**Unconditional, like the `ai/` and Playwright carve-ins.** Every workspaced spawn gets it. The prompts insert the same command shape on any tab, nothing at spawn time knows whether a task will be run, and gating it would thread a flag through `SandboxOptions`, `spawnPty`, and the remote spawn path to withhold read access to one directory of Janissary's own code.

**`check-diff.mjs` resolves its sibling from its own location.** It is the one script that runs another by a cwd-relative path. Anchoring it to `import.meta.dirname` is a no-op inside a Janissary checkout — same file either way — and is the difference between working and not when the runner is reached through `$janissary` from another project's directory.

**The two agent allowlists learn the new spelling.** `.claude/settings.json` pre-approves `Bash(./scripts/run.mjs *)` and `.codex/rules/default.rules` pre-approves the `./scripts/run.mjs` pattern. Neither matches `$janissary/scripts/run.mjs`, so without this the very prompts being changed would stall an unattended run on a permission prompt at their first verification step. Both spellings are kept: a human working in a Janissary checkout still types the relative one, and the project's own `CLAUDE.md` still names it. This is scope the issue implies rather than states, and it is recorded here rather than made silently.

**`CLAUDE.md` and `ai/guidelines/pull-request-automation.md` keep the relative path.** `CLAUDE.md` is this project's own instructions to an agent working on this project, where the working directory *is* the installation and the relative path is correct and pre-approved. `pull-request-automation.md` documents the `scripts/pr-*.sh` inventory by name and shows direct `./scripts/pr-*.sh` invocations, a form `CLAUDE.md` already tells agents not to use; reconciling that is its own change, not this one. The two guidelines that invoke the *runner* (`plugins.md`, `plugins-tabs.md`) are rewritten with the tasks, since they name the same command for the same purpose.

## Implementation steps

1. `src/janissary-root.ts` — add `janissaryScriptsDir()` beside `janissaryAiDir()`, with a comment saying what the directory is and why a sandboxed process needs to read it.
2. `src/sandbox/index.ts` — carve `janissaryScriptsDir()` in as `JANISSARY_SCRIPTS_L`/`JANISSARY_SCRIPTS_R` via `dualPath`, beside the `ai/` params.
3. `src/sandbox/profile.ts` — add the two params to the read allow-list and extend the neighbouring comment to cover them.
4. `scripts/check-diff.mjs` — resolve `lint-files.mjs` from `import.meta.dirname` instead of the working directory.
5. `ai/tasks/**/*.md` — replace every `./scripts/run.mjs` with `$janissary/scripts/run.mjs`, in prose and in fenced blocks alike.
6. `ai/guidelines/plugins.md`, `ai/guidelines/plugins-tabs.md` — the same replacement, for the same command.
7. `.claude/settings.json` — add `Bash($janissary/scripts/run.mjs *)` alongside the existing entry.
8. `.codex/rules/default.rules` — add `$janissary/scripts/run.mjs` to the same pattern list.
9. `product/specs/sandbox.md` — record the `scripts/` read carve-in in the filesystem policy.
10. `product/specs/task-picker.md` — record that a built-in task prompt reaches Janissary's own scripts through `$janissary/scripts/` for the same reason it reaches its own task files through `$janissary/ai/`.

## Tests

- `src/janissary-root.test.ts` (extended): `janissaryScriptsDir()` is that root's `scripts/`, and the root's directory check covers `scripts/run.mjs` as well as `ai/tasks`.
- `src/sandbox/index.test.ts` (extended): a confined spawn's `-D` params carry `JANISSARY_SCRIPTS_L`/`JANISSARY_SCRIPTS_R` pointing at the install's `scripts/` directory in both forms, and the profile's read allow-list names both params. The existing "does not carve in the install root itself" assertion continues to hold.
- `scripts/check-diff.test.mjs` (new, or extended if one exists): the lint step names an absolute path under the script's own directory, so it does not depend on the working directory.
- `src/sandbox/live.sandbox.test.ts` (extended): a live sandboxed process reads `run.mjs` under the install's `scripts/` directory successfully, while a file elsewhere under the install root stays denied. Run with `npm run test:sandbox`, which `check-diff` does not cover.

## Out of scope

- **Write access to the installation's `scripts/`.** Reads only, on the same reasoning as `ai/`.
- **Carving in the whole install root.** `scripts/` and `ai/` are what a task needs; the rest stays denied.
- **Making every script cwd-independent.** Only `check-diff.mjs` reaches a sibling by a cwd-relative path. The rest either take no path or deliberately act on the working directory, which is the project — exactly what a task wants.
- **`ai/guidelines/pull-request-automation.md`'s direct `./scripts/pr-*.sh` invocations.** A separate inconsistency with `CLAUDE.md`'s runner rule, not this issue's.
- **A fallback for an unset `$janissary`.** The variable is set on every process Janissary spawns, workspaced or not; a prompt run from a terminal Janissary did not start is outside what the picker's insertion already assumes.
- **New user documentation.** `documentation/user-documentation/` documents the task picker's insertion, not the commands inside a task prompt, and `help.md` names no script. There is nothing already written that this makes wrong.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` after each step, plus `npm run test:sandbox` once for the live carve-in test.

Manual: open a workspaced agent tab on a project that is not a Janissary checkout, pick a Janissary task from the picker, and confirm the agent can run the `$janissary/scripts/run.mjs` command the prompt names.
