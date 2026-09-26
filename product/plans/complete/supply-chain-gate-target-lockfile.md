# Audit the lockfile the project is about to install, not the installation's

**Complexity: 2/10** — one optional argument on an existing script, one new test file for a script that has none, and two paragraphs of prose in a task prompt and the repository guide. No new module, no new architecture.

`ai/tasks/research/find-bugs.md` runs an unattended install in whatever project the tab is open on, and before that install it tells the run to satisfy the package-safety gate: "In a Janissary checkout, audit the lockfile with `$janissary/scripts/run.mjs check-malicious-package --audit` first", followed by "only success permits installation". The gate cannot succeed there. `scripts/run.mjs` dispatches by a path relative to its own directory, and `scripts/check-malicious-package.mjs` derives `repoRoot` from its own `import.meta.url` and reads `path.join(repoRoot, 'package-lock.json')`, so `--audit` always audits the **installation's** lockfile whatever the process's working directory is. `$janissary` is the install root of the running app (`src/sandbox/environment.ts` sets it from `janissaryRoot()`), which on a workspace tab is the install and not the workspace clone the run is about to install — and `package.json`'s `files` list publishes no lockfile at all, so an installed Janissary has nothing for the audit to read and the script exits 1. A gate that either inspects the wrong file or cannot run leaves the run with two bad options: refuse to install anything, or train an agent to wave the gate through.

## Approach

**Give the gate a lockfile to audit.** `--audit` takes an optional path, resolved against the process's working directory; with no path the behavior is exactly what it is today, the installation's own `package-lock.json`. The audit prints the file it read, so a reader can tell which lockfile was judged, and the unreadable case names the path it tried. Every exit code is unchanged — 0 clean, 1 usage or data error, 2 blocked, 3 quarantined — because playbooks already branch on them. A second argument after `--audit` is a usage error rather than a silently ignored extra.

**Point the playbook at the project's own gate.** A project that documents its own gate runs it. A Janissary checkout carries `scripts/run.mjs`, `security/known-malicious-packages.json`, and `package-lock.json`, so the run audits `./package-lock.json` through the checkout's own runner, which is the arrangement `AGENTS.md` already describes and the one that reads the right file. Only a project with no runner of its own reaches for the installation's, and then it names the project's lockfile explicitly. The step also says what each non-zero exit means, so 2 and 3 stop the run and 1 is a failed check rather than permission to install.

**Document the form where the gate is documented.** `AGENTS.md`'s package-update section is the gate's own reference; a new form that only the code knows about is the same drift this fixes.

## Implementation steps

1. `scripts/check-malicious-package.mjs` — `--audit [lockfile]`: resolve a given path against `process.cwd()`, default to `path.join(repoRoot, 'package-lock.json')`, print the audited file, name it in the unreadable error, and reject a third argument as usage. `checkSpecs` and its campaign classification are untouched.
2. `scripts/check-malicious-package.test.mjs` — new; the script's first test file.
3. `ai/tasks/research/find-bugs.md` — Step 0's install step: audit the tree about to be installed, through the project's own runner where it has one, and spell out the exit codes.
4. `AGENTS.md` — the package-update section documents `--audit <lockfile>` alongside the bare form.
5. `product/specs/task-picker.md` — one sentence in "Finding bugs from specs": a blocked, quarantined, or unreadable audit stops the run before it installs.

## Tests

`scripts/check-malicious-package.test.mjs` (new), driving the script as the runner does — `spawnSync` on `process.execPath`, asserting the exit code and the output, because the contract a playbook depends on is the exit code and not an internal return value:

- `--audit` with no path audits the repository's own `package-lock.json`, named in the output, so the default is pinned rather than assumed.
- `--audit <path>` audits the named file: a fixture lockfile holding a known-malicious version from `security/known-malicious-packages.json` exits 2 and names both the file and the package.
- A fixture lockfile holding a package from a compromised account at a version that is not itself known-bad exits 0 and lists the package, which is the quarantine report the current code already prints.
- A fixture lockfile holding nothing recognizable exits 0 with the clean line.
- A path that does not exist exits 1 and names the path, so a missing lockfile is a failed check rather than a clean one.
- A relative path is resolved against the working directory: the same fixture is audited from a temporary working directory by relative name and from elsewhere by absolute name, with the same verdict.
- A third argument after `--audit` is a usage error, not a silently ignored extra.

No application code changes, so no `src/` or `web/src/` coverage is involved.

## Out of scope

- **Changing what the gate blocks, quarantines, or how it classifies a package.** The campaign list, `classify`, and the exit codes are the security decision; this change only decides which file is read.
- **Running the audit for a project that documents no gate.** The playbook requires the gate a project's own instructions require. Adding Janissary's blocklist to projects that never asked for it is a policy change, not a bug fix.
- **Auditing a tree other than the one about to be installed** — a transitive dependency's own lockfile, a workspace member's. One run installs one tree.
- **A `--project` or `--cwd` flag.** A path is the whole need; a directory form would add a second way to say the same thing.
- **User documentation.** Neither `help.md` nor `documentation/user-documentation/` describes the gate or a task prompt's internals, and Step 6 adds nothing for behavior that was never documented.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual, from a workspace tab whose install root is not the project: run the playbook's audit command with a path and confirm the output names the project's lockfile rather than the installation's.
