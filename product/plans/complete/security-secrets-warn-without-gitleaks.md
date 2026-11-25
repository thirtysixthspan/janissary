# fix(security): warn instead of failing when gitleaks is not installed

**Complexity: 3/10** — ~25 added lines in one new script, 1 file edited, 5 requirements, 3 scenarios (p=4.37)

## Goal

`npm run security:secrets` runs `gitleaks detect --no-banner --redact` directly. On a machine without the gitleaks binary, the shell exits 127 with `gitleaks: command not found`. Because `npm run security` chains `security:secrets && security:deps`, the dependency audit never runs either. Run the secrets scan through a small wrapper script instead. It runs gitleaks when it is installed. When it is missing, it prints a clearly marked warning that secrets were not scanned, with an install hint, and exits successfully so the rest of the security gate still runs.

## Requirements

1. "if gitleaks binaray is not available, dont fail": when no `gitleaks` executable is on `PATH`, `npm run security:secrets` exits with status 0.
2. "issue a warning notification": when gitleaks is missing, the command writes a warning to stderr saying secrets were not scanned because gitleaks is not installed, with how to install it.
3. When gitleaks is missing, `npm run security` goes on to run the dependency audit (follows from requirement 1 and the existing `&&` chain).
4. When gitleaks is installed, the command runs `gitleaks detect --no-banner --redact` with its output passed straight through to the terminal.
5. When gitleaks is installed and reports leaks (non-zero exit), the command exits with gitleaks's own status, so a real finding still fails the gate.

## Design decisions

- Detect a missing binary by spawning `gitleaks` and checking for an `ENOENT` spawn error, not by shelling out to `which`/`command -v`. This needs no extra tool and treats "not on PATH" exactly the way the old command did (see Assumption 2).
- The warning is a stderr message. "Notification" can't mean the app's notifications feed here: an npm script has no channel to it, because `notify` is a tab command with no CLI entry point (Assumption 3).
- Put the wrapper in `scripts/security-secrets.mjs` and point the package script at it with `node scripts/security-secrets.mjs`, following the `lint:files` precedent (Assumption 4).
- Pass gitleaks's exit status through unchanged, and pass through a non-ENOENT spawn error as a failure. Only a missing binary is downgraded to a warning.

## Preserved behavior

None found

## Assumptions

1. The secrets scan is reached only through the package script: `package.json:52` `"security:secrets": "gitleaks detect --no-banner --redact"`. No hook, CI workflow, or other script invokes gitleaks (grep over `src/`, `scripts/`, `.github/`, `ai/` finds only `ai/tasks/hygiene/improve-security.md`, which already treats "not installed" as a skip).
2. Node reports a binary missing from `PATH` as a spawn error with code `ENOENT` through `spawnSync(...).error`.
3. `notify` is a tab command: `help/notify.md:3` "Push a custom message into the notifications feed, attributed to the tab that sent it." `bin/janus.mjs` exposes no `notify` subcommand.
4. Package scripts already run checked-in scripts through node: `package.json:29` `"lint:files": "node scripts/lint-files.mjs"`.
5. Script tests run in the server vitest project: `vitest.config.ts:14` `include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs']`.

## Existing functionality

1. `scriptPath` resolves a sibling script by absolute path for tests: `scripts/script-path.mjs` `export function scriptPath(name)`.
2. The subprocess test pattern (spawn the script with `process.execPath` against a scratch directory holding a planted fake binary): `scripts/lint-files.test.mjs` `function run(cwd)`.

## Implementation steps

1. Add `scripts/security-secrets.mjs`. It spawns `gitleaks` with `detect --no-banner --redact` and inherited stdio. On an `ENOENT` spawn error, it prints a warning line to stderr and exits 0, for example:
   ```
   security:secrets: WARNING — gitleaks is not installed; secrets were not scanned. Install it with `brew install gitleaks` or from https://github.com/gitleaks/gitleaks/releases.
   ```
   On any other spawn error it prints the error and exits 1. Otherwise it exits with gitleaks's status (1 when the status is null, such as a kill by signal). Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `package.json`, change `security:secrets` to `node scripts/security-secrets.mjs`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Add `scripts/security-secrets.test.mjs` (see Tests). Build command: `$janissary/scripts/run.mjs check-diff`.
4. Create the functional spec `product/specs/security-checks.md` describing the secrets scan's behavior with and without gitleaks.

## UI design

None. The change affects a developer npm script's terminal output only.

## Tests

In `scripts/security-secrets.test.mjs`, run the script with `process.execPath` and a `PATH` limited to a scratch `bin` directory, mirroring `scripts/lint-files.test.mjs`:

- Requirements 1–2: with no `gitleaks` in the scratch `bin`, the exit status is 0 and stderr contains the "gitleaks is not installed" warning and the install hint.
- Requirement 4: with a planted fake `gitleaks` that echoes its arguments and exits 0, the exit status is 0 and stdout contains `detect --no-banner --redact`.
- Requirement 5: with a planted fake `gitleaks` that exits 1, the exit status is 1 and no "not installed" warning appears.

Requirement 3 follows from requirement 1 and the unchanged `&&` chain, so it has no separate test.

## Out of scope

- Changing `security:sast` (opengrep), which is an on-demand audit and not part of the `security` gate.
- Adding git hooks, or posting to the in-app notifications feed.
- `documentation/developer-documentation/security-checks.md`, which sits outside this task's editable documentation and still accurately says the scan requires gitleaks.

## Verification

1. Run `$janissary/scripts/run.mjs check-diff`; it must pass.
2. On a machine without gitleaks, or with `PATH` stripped of it (`env PATH=/usr/bin:/bin "$(command -v node)" scripts/security-secrets.mjs; echo "exit=$?"`), confirm the warning prints and `exit=0`. A `command not found` error or a non-zero exit means the fix did not take.
3. With gitleaks installed, run `npm run security:secrets` and confirm gitleaks's normal scan output and exit status.
