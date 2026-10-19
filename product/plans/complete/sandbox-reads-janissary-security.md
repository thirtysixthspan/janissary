# Let a sandboxed process read the Janissary installation's `security/` directory

**Complexity: 3/10** — one new one-line function beside `janissaryAiDir()` and `janissaryScriptsDir()`, and one read carve-in built from the pattern those two already set. No new architecture.

A workspaced tab's processes run under a Seatbelt profile that denies reads of `$HOME`'s contents, and a Janissary installation commonly lives under `$HOME`. Two parts of it are carved back in: `$janissary/ai/` for the task prompts and `$janissary/scripts/` for the runner they name. `AGENTS.md` and every package-update task tell an agent to run `$janissary/scripts/run.mjs check-malicious-package` before touching `node_modules/`. That script reads its blocklist from `$janissary/security/known-malicious-packages.json`, which sits outside both carve-ins, so the supply-chain gate fails inside a workspace and an agent can't install anything.

The issue asks for reads from the directory `$janissary` names. The decision is to scope that to the three directories a task actually needs, `ai/`, `scripts/`, and `security/`, rather than the whole root.

## Approach

**One more narrow read carve-in: `<install root>/security`.** It goes beside the `ai/` and `scripts/` params as `JANISSARY_SECURITY_L`/`JANISSARY_SECURITY_R`, in both literal and realpath-resolved form via `dualPath`, since an npm-global install is commonly reached through a symlinked prefix. Read-only and unconditional, on the same terms as its neighbours. The directory holds the blocklist and nothing else. An agent able to write it could clear a blocked release that a later unsandboxed install would then accept.

**Rejected: the whole install root.** A development checkout keeps a project's local state at its root: `.janissary/` with the project tokens, the server log that records the live session's URL and token, and every sibling workspace. Carving in the root would need a second deny to win those back, and every future file at the root would be readable by default. Three named directories keep the default as deny.

## Implementation steps

1. `src/janissary-root.ts` — add `janissarySecurityDir()` beside `janissaryScriptsDir()`, and update the comments that say `ai/` and `scripts/` are the only parts carved in.
2. `src/sandbox/index.ts` — bind `JANISSARY_SECURITY_L`/`JANISSARY_SECURITY_R` via `dualPath`, beside the `ai/` and `scripts/` params.
3. `src/sandbox/install-reads.ts` — add the two params to the read allow and extend its comment to cover them.
4. `product/specs/sandbox.md` — record the `security/` carve-in, and say `ai/`, `scripts/`, and `security/` are the only parts of the installation carved in.
5. `documentation/user-documentation/advanced-agents/workspacing.md` and `documentation/user-documentation/command-bar/tasks.md` — both say only `ai/` and `scripts/` stay readable. Add `security/`.

## Tests

- `src/janissary-root.test.ts`: `janissarySecurityDir()` is that root's `security/`, and the root's directory check covers `security/known-malicious-packages.json`.
- `src/sandbox/index.test.ts`: a confined spawn's `-D` params carry `JANISSARY_SECURITY_L`/`JANISSARY_SECURITY_R` pointing at the install's `security/` in both forms, and the profile's read allow names both. The existing "does not carve in the install root itself" assertion still holds.
- `src/sandbox/live.sandbox.test.ts`: a live sandboxed process reads `known-malicious-packages.json` under the install's `security/`. Run with `npm run test:sandbox`, which `check-diff` does not cover.

## Out of scope

- **`AGENTS.md`.** Its `$janissary` section says only `ai/` and `scripts/` are readable inside a sandboxed workspace. That line is now incomplete, but this task may not edit `AGENTS.md`. It needs a follow-up.
- **`lint-files` and the installation's `node_modules/`.** `lint-files.mjs` runs `$janissary/node_modules/.bin/eslint`, which stays denied, so `$janissary/scripts/run.mjs lint-files` (and `check-diff`'s lint step) still fails inside a workspace. Making it use the project's own eslint is a script change, not a sandbox one.
- **The bare `check-malicious-package --audit`.** With no path it reads the installation's own `package-lock.json`, which stays denied. `AGENTS.md` already tells agents to name the lockfile.
- **Write access to any part of the installation.** Reads only.

## Verification

Automated: `$janissary/scripts/run.mjs check-diff` after each step, plus `npm run test:sandbox` for the live test where the host can apply a nested profile.

Manual: in a workspaced tab on an installation under `$HOME`, run `$janissary/scripts/run.mjs check-malicious-package --audit ./package-lock.json` and confirm it reads the blocklist.
