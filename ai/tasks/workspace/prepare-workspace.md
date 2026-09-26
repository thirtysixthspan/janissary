# Prepare Workspace

## Step 1 — Pull latest changes

1. Run `git checkout master` to switch to the primary branch.
2. Run `git pull origin master` to fetch the latest commits.

---

## Step 2 — Install dependencies

**Nothing is installed before the supply-chain gate has cleared it.** Run the gate this project's own instructions require before installing, and treat its verdict as the answer: `0` is clean and permits the install, `2` (a known-malicious version) and `3` (a package or scope belonging to a compromised maintainer account) stop the run and report what was refused, and `1` means the check could not read its input and is a failed check, never permission to proceed. [`AGENTS.md`](../../AGENTS.md) carries the full policy.

In a Janissary checkout — recognized by `bin/janus.mjs` at its root, and carrying the gate, the blocklist, and the lockfile itself — run it from the project directory:

```bash
./scripts/run.mjs check-malicious-package --audit ./package-lock.json
```

A project with no runner of its own reaches for the installation's instead, and then names this project's lockfile explicitly, because the gate reads the file it is given rather than the one beside the script:

```bash
$janissary/scripts/run.mjs check-malicious-package --audit <path to this project's lockfile>
```

A project that ships no gate of its own and is not a Janissary checkout has none to run; say so in the report and continue. Do not install a package to obtain one.

Then run `npm install --ignore-scripts` to ensure dependencies are up to date before doing anything else. This links every `node_modules/.bin` binary (vitest, tsc, eslint, …) but skips all lifecycle scripts — including the project's own `postinstall`, which runs `npx playwright install chromium`. Never let that run in a workspace: it downloads a ~130MB browser per workspace, and the sandbox denies writes to playwright's browser cache anyway.

---

## Step 3 — Run the dependency install scripts that matter

`--ignore-scripts` above also skipped the install scripts of the three packages that genuinely need them. Run them now:

```bash
npm rebuild esbuild node-pty unrs-resolver
chmod +x node_modules/node-pty/prebuilds/*/spawn-helper 2>/dev/null || true
```

This builds esbuild's platform binary, node-pty's native addon, and unrs-resolver's bindings — everything a full install provides except the playwright browser download.

---
