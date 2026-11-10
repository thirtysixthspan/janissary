# Bundle the Claude and Codex ACP adapters for role launches

**Complexity: 5/10** — ~30 added production lines across 4 files (`command-path.ts`, `launch.ts`, `package.json`, the regenerated lockfile), 7 requirements, and 9 test scenarios; the codex launch moves its model and effort from `-c` args into the `CODEX_CONFIG` environment variable because the pinned adapter ignores its argv (p=5.35)

## Goal

Role-based ACP connections (core `ask` and `tell`) launch the Claude and Codex ACP adapters from Janissary's own installed dependencies instead of fetching the deprecated `@zed-industries/*` packages through `npx` at runtime. This is the first step of `product/plans/complete/deny-internal-tools-for-role-acp-connections.md`: later subplans configure the pinned adapters to turn their built-in tools off, and their configuration keys can only be confirmed against an adapter version the manifest pins.

## Design decisions and dependencies

Builds on nothing earlier; it is the first subplan in the series.

- Adapters ship in the manifest, not through `npx`. `@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp` become exact-pinned `dependencies` in `package.json`, replacing the deprecated `@zed-industries/*` packages that `acpLaunchForEntry` fetched at runtime. Role launches run the installed copy; opencode stays a binary on the user's `PATH`.
- `acpLaunchFor` (monitors, conversations, agent runs) keeps its current `npx` claude launch and is not touched. Its output stays byte-for-byte unchanged, so `src/monitor/acp.test.ts` keeps asserting `@zed-industries/claude-code-acp`.
- Scope is core `ask` and `tell` sessions only: everything launched through `AcpSessionManager.session` and `acpLaunchForEntry`, local and remote, including plugin-owned ask sessions and the launcher summarizer. Monitor personas (`src/monitor/acp.ts`), conversations (`src/conversations/sessions.ts`), editor persona queries, and autonomous `agent` runs (`src/agent/execute.ts`) keep their current launches (`acpLaunchFor`).
- Pinned versions (decided; verified 2026-11-10 17:02 UTC). Rule: the newest non-`preview` release published at least 14 days earlier.
  - `@agentclientprotocol/claude-agent-acp@0.97.0`, published 2026-10-26T12:48Z, `bin` `{ "claude-agent-acp": "dist/index.js" }`. `0.98.0` (2026-10-27T18:53Z) was 13 days 22 hours old at the check and is excluded.
  - `@agentclientprotocol/codex-acp@2.3.0`, published 2026-10-26T12:57Z, `bin` `{ "codex-acp": "dist/index.js" }`. The next release, `2.4.0`, is from 2026-10-29.
  - `$janissary/scripts/run.mjs check-malicious-package` gave exit 0 (OK) for both on 2026-11-10.
  - The implementer pins exactly these versions and does not pick newer ones. Subplan 4 confirms its keys against these versions. The gate is re-run before install, because the blocklist can change. Exit 2 (BLOCKED) or 3 (QUARANTINED) stops this subplan; report it, and do not silently pick other versions, since subplan 4's key confirmation depends on the version. A failed check (exit 1) is never permission to proceed.
- What the pinned packages pull in (checked from the published metadata and tarballs):
  - claude-agent-acp 0.97.0 depends on `@agentclientprotocol/sdk@2.0.2`, `@anthropic-ai/claude-agent-sdk@0.3.310`, `zod`, and `diff`, and needs `node >=22`. The SDK ships the Claude CLI as platform-specific `optionalDependencies` (`@anthropic-ai/claude-agent-sdk-<platform>-<arch>`). The adapter finds it with `createRequire` in `claudeCliPath` (`dist/acp-agent.js`).
  - codex-acp 2.3.0 depends on `@openai/codex@^0.164.0`, among others. That package ships its native binary as platform `optionalDependencies` and declares a `codex` bin. The adapter runs `@openai/codex/bin/codex.js` through `require.resolve` when `CODEX_PATH` is unset.
  - Neither package has an install script, so `npm install --ignore-scripts` leaves both adapters runnable.
  - The root `@agentclientprotocol/sdk` (`^1.3.0`, used by `src/acp/index.ts`) is not bumped. npm nests 2.0.2 under the adapters.
- Claude launch env (confirmed in the tarball). claude-agent-acp 0.97.0 reads `process.env.ANTHROPIC_MODEL` to pick the session model (`dist/session-model.js`). It does not read `CLAUDE_THINKING_EFFORT`, and neither did the deprecated `@zed-industries/claude-code-acp@0.16.2`. The role launch still sets the same `{ ANTHROPIC_MODEL, CLAUDE_THINKING_EFFORT }` env that `acpLaunchFor` builds today. That keeps parity and changes no behavior. Honoring a role entry's claude effort through the adapter's `effort` session config option is out of scope.
- Codex launch config (confirmed in the tarball). codex-acp 2.3.0 is a Node adapter that ignores its argv apart from `--version`, `login`, and `cli` (`startAcpServer` in `dist/index.js`). It takes its Codex config from the `CODEX_CONFIG` environment variable, a JSON object it passes as `config` on every `threadStart`/`threadResume`. Its README describes the variable as "JSON object merged into the Codex session config". The deprecated Rust adapter's `-c key=value` args would be dropped without any error. So a codex role entry launches with no args and `env: { CODEX_CONFIG: <JSON> }`:
  - The object holds `model` set to the entry's model, plus `model_reasoning_effort` set to the entry's effort only when the entry sets one.
  - These are the config keys the `-c` overrides used, now as JSON values instead of TOML-quoted strings.
  - The launch env wins over any ambient `CODEX_CONFIG`, because `connectAcp` spreads `options.env` last (`src/acp/index.ts`, `locateAcpCommand(options.command, { ...process.env, ...requested })`), the same way `OPENCODE_CONFIG_CONTENT` works.
  - `CODEX_CONFIG` is not matched by `ENV_SCRUB_PATTERNS` (`src/sandbox/paths.ts`), so it reaches the confined process. The remote `acp-open` frame already carries `env`.
- Consequence for subplan 4, recorded here so it is not rediscovered mid-flight: subplan 4 and the canonical plan describe the codex deny-all as `-c` overrides appended to `args`. Against codex-acp 2.3.0 those args would be ignored. The codex deny-all keys have to merge into the `CODEX_CONFIG` object instead, the way opencode's merge into `OPENCODE_CONFIG_CONTENT` works. This subplan does not change subplan 4; the human resolves it there.
- The install's `node_modules/.bin` is searched ahead of the existing `PATH` and interactive-shell lookups. A command given as a path is still left alone first, as today. A name with no entry in `.bin` falls through unchanged.
  - `locateAcpCommand` is called by every `connectAcp` caller: monitors, conversations, agent runs, and `src/remote/serve-acp.ts` on a remote host, not only role sessions.
  - Today `.bin` holds no `npx` and no `opencode`, so those launches resolve exactly as before.
  - After the install `.bin` also gains `codex` (from `@openai/codex`). No `connectAcp` caller launches `codex`.
  - The same function runs on a remote host's own install, so a remote role session finds the remote's bundled copy.
- Accepted side effect, documented rather than prevented: a server started through an npm script (`npm start`, `npm run dev`) has `node_modules/.bin` on its own `PATH`, as npm sets it. A harness tab from such a dev server whose shell does not put the user's own `codex` earlier on `PATH` would run the bundled `@openai/codex` 0.164.x. A global install and `janus` are unaffected.
- Ceiling: this assumes the adapters sit under the install's own `node_modules`, which holds for a checkout and a global npm install. A layout that hoists them elsewhere fails to find the `bin` name and reports the agent failing to start (the role's model fallback then tries the next entry). The upgrade path is resolving through `createRequire`, as `src/browser/playwright-paths.ts` `resolvePackageDir` does. It is not built here.
- Between this subplan and subplan 6 (which bumps the remote protocol), a remote host running an older build at the same protocol version would not have the adapters installed and would fail to start a claude or codex role entry. That is a development-window state only; subplan 6's exact-version bump closes it before release.
- Ordering: steps 1–2 (gate, install) land first, so the `bin` files exist before any manual check. Steps 3 and 4 are independent of each other and each keeps typecheck and tests green on its own, as long as each lands with its own test updates.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Role entry launch per harness | `src/acp/launch.ts` `acpLaunchForEntry` | Its claude and codex branches switch to the adapters' `bin` names; codex's `-c` args become a `CODEX_CONFIG` env value. |
| Persona launch | `src/acp/launch.ts` `acpLaunchFor` | Left unchanged; the claude role branch stops delegating to it (today `if (entry.harness === 'opencode' \|\| entry.harness === 'claude') return acpLaunchFor(...)`), opencode still does. |
| Executing-side command lookup | `src/acp/command-path.ts` `locateAcpCommand`, `findOnPath` (module-private) | Gains one step: `findOnPath` over the install's `node_modules/.bin`. Called from `connectAcp` (`src/acp/index.ts`), so it runs on whichever host runs the agent. |
| Install root | `src/janissary-root.ts` `janissaryRoot` | `path.join(janissaryRoot(), 'node_modules', '.bin')`, with no new resolution code. Import as `../janissary-root.js`. |
| Sandbox read access to the install's dependencies | `src/sandbox/harness-spawn.ts` `resolveExecutableDirs` / `packageRootDir` | An absolute command inside `node_modules/` already has the whole `node_modules/` carved into the Seatbelt read allow-list: `packageRootDir` walks the `.bin` symlink's real path up to `node_modules`. That covers the adapters' nested native CLIs too, so no sandbox change is needed. |
| JSON-in-env config precedent | `src/acp/launch.ts` `acpLaunchFor` opencode branch (`OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: harness.model })`) | Build `CODEX_CONFIG` the same way. |
| Supply-chain gate | `$janissary/scripts/run.mjs check-malicious-package` | Run on both packages at their exact versions before they enter `package.json`, then `--audit` the regenerated lockfile. |
| Exact-version saving | `.npmrc` `save-exact=true` | `npm install <pkg>@<ver>` writes the exact version into `package.json`, with no `^`. |

## Proposed changes

1. Run `$janissary/scripts/run.mjs check-malicious-package @agentclientprotocol/claude-agent-acp@0.97.0 @agentclientprotocol/codex-acp@2.3.0`. Exit 0 proceeds. On exit 2 or 3, stop and report (see Design decisions). On exit 1, fix the check before anything else.
2. Run `npm install --ignore-scripts @agentclientprotocol/claude-agent-acp@0.97.0 @agentclientprotocol/codex-acp@2.3.0`. It adds both packages under `dependencies` at exact versions (the `.npmrc` already enforces this; confirm `package.json` shows `"0.97.0"` and `"2.3.0"` with no `^` or `~`) and regenerates `package-lock.json`. Then run `$janissary/scripts/run.mjs check-malicious-package --audit ./package-lock.json`. The lockfile is named explicitly so the gate audits this checkout's file, not the installation's. An exact known-malicious version anywhere in the tree fails the audit and stops the work. Confirm `node_modules/.bin/claude-agent-acp` and `node_modules/.bin/codex-acp` exist and that `node_modules/.bin` holds no `npx` or `opencode`.
3. `src/acp/command-path.ts`: `locateAcpCommand` gains one step. The existing first line returns early both for a command containing `/` and for a name the given `PATH` resolves. Split it: the `/` check stays first, unchanged. Next, run `findOnPath(command, path.join(janissaryRoot(), 'node_modules', '.bin'))`. A hit returns `{ command: <absolute path>, env }` with `env` unchanged and no `PATH` rewrite. Then the existing server-`PATH` check and interactive-shell fallback run exactly as today. Update the header comment and the doc comment above `locateAcpCommand` to name the new step. The file is 64 lines, so it stays far under the limit.
4. `src/acp/launch.ts` `acpLaunchForEntry`:
   - opencode keeps delegating to `acpLaunchFor`.
   - A claude entry launches as `{ command: 'claude-agent-acp', args: [], env: { ANTHROPIC_MODEL: entry.model, CLAUDE_THINKING_EFFORT: variant } }`. `variant` is the existing `entry.effort ?? 'default'`, so the env matches what `acpLaunchFor` builds today, but it is built here rather than by delegation.
   - A codex entry launches as `{ command: 'codex-acp', args: [], env: { CODEX_CONFIG } }`. `CODEX_CONFIG` is `JSON.stringify` of `{ model: entry.model }`, plus `model_reasoning_effort: entry.effort` only when `entry.effort` is set. There is no `npx`, no package argument, and no `-c` args.
   - Any other harness still answers `undefined`.
   - `acpLaunchFor` is unchanged.
   - Rewrite the comment above `acpLaunchForEntry`: opencode launches as its persona does; claude and codex run the bundled adapters by `bin` name; codex takes its model and effort through `CODEX_CONFIG` because the adapter ignores argv.

## Tests

- `src/acp/command-path.test.ts` (it uses the real root today and has no `janissary-root` mock):
  - Mock `../janissary-root.js` with `vi.mock` and a `vi.hoisted` root variable, the hoisting pattern `src/acp/manager-fallback.test.ts` uses. The mock factory returns only `janissaryRoot`; `command-path.ts` imports nothing else from that module.
  - Point the root at a temp directory holding `node_modules/.bin/<name>` as an executable file, built like the file's existing `binDirWith` helper.
  - A name present in `.bin` resolves to its absolute path with the same `env` object. This holds even when the given `PATH` also resolves the name.
  - Any other name falls through to the existing behavior: the four existing cases keep passing unmodified, with the mocked root holding no matching `.bin` entry.
  - A command given as a path is still returned as given.
- `src/acp/launch.test.ts` (it asserts the old `@zed-industries/*` argument lists today):
  - A claude role entry equals `{ command: 'claude-agent-acp', args: [], env: { ANTHROPIC_MODEL, CLAUDE_THINKING_EFFORT } }`.
  - A codex role entry with effort has `command: 'codex-acp'` and `args: []`, and its parsed `env.CODEX_CONFIG` equals `{ model, model_reasoning_effort }`.
  - The no-effort codex case parses to `{ model }` only. Assert on `JSON.parse` of the value, not on the string, as `src/acp/manager-fallback.test.ts` does for `OPENCODE_CONFIG_CONTENT`.
  - opencode still equals `acpLaunchFor`'s output, and `gemini` still answers `undefined`.
  - The two `acpLaunchFor` cases stay byte-for-byte unchanged.
  - Subplan 4 later rewrites the opencode case and extends the codex config.
- `src/acp/manager-fallback.test.ts`:
  - The claude fallback assertion (`toMatchObject({ command: 'npx', args: ['@zed-industries/claude-code-acp'] })`) becomes `command: 'claude-agent-acp'` with `args: []`. Its `env` assertion is unchanged.
  - The two codex assertions that list `'@zed-industries/codex-acp', '-c', ...` (in "skips a disabled noncurrent entry…" and "starts past an entry that cannot be launched") become `command: 'codex-acp'`, `args: []`, and a parsed `CODEX_CONFIG` of `{ model: CODEX.model, model_reasoning_effort: 'high' }`.
- `src/monitor/acp.test.ts`: unchanged, and must keep passing. It pins `acpLaunchFor`'s `npx` launch, and the new `.bin` step leaves `npx` alone because `.bin` has no `npx`.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model", the paragraph beginning "Each entry launches its harness's ACP agent":
  - `claude` and `codex` entries run the Claude Agent and Codex ACP adapters bundled with Janissary, found in the install's `node_modules/.bin` ahead of `PATH`, not through `npx`.
  - The codex entry's model and effort reach the adapter through its `CODEX_CONFIG` setting.
  - "Each agent must be installed, authenticated, and on PATH" narrows to opencode being installed and on `PATH`. Claude and codex only need their sign-in.
  - This is the "bundled adapters" part of the source plan's `acp.md` bullet.
- `documentation/user-documentation/advanced-agents/acp-agent.md` "Before the first prompt": this change makes the sentence "A `claude` or `codex` entry runs its ACP adapter through `npx`." false. Replace it with one saying the adapters ship with Janissary, so only the harness's own sign-in is needed. The paragraph's opening, "Each harness your `ask` role lists must be installed, signed in, and on your `PATH`", narrows the same way. The source plan does not list this file, but architecture principle 10 requires the update because the sentence becomes false.

## Verification

`$janissary/scripts/run.mjs check-diff` green (lint, typecheck, server tests). Manually:

1. With a claude entry first in the `ask` role, run `ask hello` in a shell tab. Confirm with `ps -axo command | grep "[c]laude-agent-acp"` that the session runs from `node_modules/.bin/claude-agent-acp`, with no `npx` process.
2. Repeat with a codex entry first, using `[c]odex-acp`. To prove `CODEX_CONFIG` reaches Codex, set that entry's model to a name Codex does not offer (for example `no-such-model`) and confirm the prompt fails and the role falls back to its next entry. The connection name `acp:ask:<model>` comes from the role entry, so it proves nothing on its own. Then restore a real model and confirm the prompt answers. Confirm the codex adapter starts after the `--ignore-scripts` install, which means its native `@openai/codex` binary resolves.
3. Confirm a monitor persona still launches through `npx @zed-industries/claude-code-acp`.

## Out of scope

- Any deny-all configuration of built-in tools (subplan 4), the session `_meta` channel (subplan 3), the denial activity record (subplan 2), the primer lines (subplan 5), and the remote protocol bump (subplan 6).
- Monitor, conversation, editor persona, and autonomous `agent` run launches, including their `npx` claude launch and their adapter package.
- Honoring a claude role entry's effort through the adapter's `effort` session config option (neither the old nor the new adapter reads `CLAUDE_THINKING_EFFORT`).
- Bumping the root `@agentclientprotocol/sdk` dependency.
- Keeping the bundled `codex` bin off the `PATH` of a server started through an npm script.
- A `createRequire`-based adapter resolution for hoisted layouts.
- Making `node` resolvable for the adapter's shebang (`#!/usr/bin/env node`) when the server's `PATH` lacks it. `npx` had the same requirement before.
