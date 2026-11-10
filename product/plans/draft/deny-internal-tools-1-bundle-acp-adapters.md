# Bundle the Claude and Codex ACP adapters for role launches

**Complexity: 4/10** — Two new exact-pinned dependencies behind the supply-chain gate, a lockfile regeneration, one new lookup step in `locateAcpCommand`, and a split of the claude branch out of `acpLaunchFor` in `acpLaunchForEntry`, with three test files updated; no protocol or behavior change beyond where the adapter binary comes from.

## Goal

Role-based ACP connections (core `ask` and `tell`) launch the Claude and Codex ACP adapters from Janissary's own installed dependencies instead of fetching the deprecated `@zed-industries/*` packages through `npx` at runtime. This is the first step of `product/plans/ready/deny-internal-tools-for-role-acp-connections.md`: later subplans configure the pinned adapters to turn their built-in tools off, and their configuration keys can only be confirmed against an adapter version the manifest pins.

## Design decisions and dependencies

Builds on nothing earlier; it is the first subplan in the series.

- Adapters ship in the manifest, not through `npx`. `@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp` become exact-pinned `dependencies` in `package.json`, replacing the deprecated `@zed-industries/*` packages that `acpLaunchForEntry` fetched at runtime. Role launches run the installed copy; opencode stays a binary on the user's `PATH`.
- `acpLaunchFor` (monitors, conversations, agent runs) keeps its current `npx` claude launch and is not touched. Its output stays byte-for-byte unchanged, so `src/monitor/acp.test.ts` keeps asserting `@zed-industries/claude-code-acp`.
- Scope is core `ask` and `tell` sessions only: everything launched through `AcpSessionManager.session` and `acpLaunchForEntry`, local and remote, including plugin-owned ask sessions and the launcher summarizer. Monitor personas (`src/monitor/acp.ts`), conversations (`src/conversations/sessions.ts`), editor persona queries, and autonomous `agent` runs (`src/agent/execute.ts`) keep their current launches (`acpLaunchFor`).
- The two new dependencies are checked against the supply-chain blocklist before they are added. Exit 2 (BLOCKED) or 3 (QUARANTINED) means stop and choose other versions; a failed check (exit 1) is never permission to proceed.
- Version choice: pin the newest release of each package published at least two weeks before implementation, never a `preview` tag. Both release often; on 2026-11-10 the candidates were `@agentclientprotocol/claude-agent-acp@0.97.0` (2026-10-26) and `@agentclientprotocol/codex-acp@2.3.0` (2026-10-26) — re-check `npm view <pkg> time` at implementation time. Their `bin` names are `claude-agent-acp` and `codex-acp` (confirm with `npm view <pkg>@<version> bin` for the chosen versions).
- The install's `node_modules/.bin` is searched ahead of the existing `PATH` and interactive-shell lookups. A command given as a path is still left alone first, as today. A name with no entry in `.bin` falls through unchanged, so opencode and `acpLaunchFor`'s `npx` are unaffected. The same function runs on a remote host's own install, so a remote role session finds the remote's bundled copy.
- Ceiling: this assumes the adapters sit under the install's own `node_modules`, which holds for a checkout and a global npm install. A layout that hoists them elsewhere fails to find the `bin` name and reports the agent failing to start (the role's model fallback then tries the next entry). The upgrade path is resolving through `createRequire`, as `src/browser/playwright-paths.ts` `resolvePackageDir` does — not built here.
- Between this subplan and subplan 6 (which bumps the remote protocol), a remote host running an older build at the same protocol version would not have the adapters installed and would fail to start a claude or codex role entry. That is a development-window state only; subplan 6's exact-version bump closes it before release.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Role entry launch per harness | `src/acp/launch.ts` `acpLaunchForEntry` | Already sets harness env and args (codex `-c key=value`); its claude and codex branches switch to the adapters' `bin` names. |
| Persona launch | `src/acp/launch.ts` `acpLaunchFor` | Left unchanged; the claude role branch stops delegating to it, opencode still does. |
| Executing-side command lookup | `src/acp/command-path.ts` `locateAcpCommand`, `findOnPath` | Gains one step: `findOnPath` over the install's `node_modules/.bin`. Runs on whichever host runs the agent. |
| Install root | `src/janissary-root.ts` `janissaryRoot` | `path.join(janissaryRoot(), 'node_modules', '.bin')` — no new resolution code. |
| Sandbox read access to the install's dependencies | `src/sandbox/harness-spawn.ts` `resolveExecutableDirs` / `packageRootDir` | An absolute command inside `node_modules/` already has that whole `node_modules/` carved into the Seatbelt read allow-list, so no sandbox change. |
| Supply-chain gate | `$janissary/scripts/run.mjs check-malicious-package` | Run on both packages at their exact versions before they enter `package.json`, then `--audit` the regenerated lockfile. |

## Proposed changes

1. Run `$janissary/scripts/run.mjs check-malicious-package @agentclientprotocol/claude-agent-acp@<version> @agentclientprotocol/codex-acp@<version>` at the chosen exact versions. On exit 2 or 3 choose other versions and re-run; on exit 1 fix the check before anything else.
2. `package.json`: add both adapters under `dependencies` at exact versions (no `^` or `~`). Regenerate `package-lock.json` with `npm install --ignore-scripts`. Then run `./scripts/run.mjs check-malicious-package --audit ./package-lock.json` (the lockfile is named explicitly, so the `$janissary` runner audits the same file). Exact known-malicious versions anywhere in the tree fail the audit and stop the work.
3. `src/acp/command-path.ts`: `locateAcpCommand` gains one step ahead of its existing lookups — after the existing "a command given as a path is left alone" check, the file's own `findOnPath` is run over `path.join(janissaryRoot(), 'node_modules', '.bin')`, and a hit returns the absolute path with the environment unchanged. A miss falls through to the current server-`PATH` check and interactive-shell fallback exactly as today. Update the file's header comment to name the new first step.
4. `src/acp/launch.ts`: `acpLaunchForEntry` launches a claude entry as `{ command: 'claude-agent-acp', args: [], env: { ANTHROPIC_MODEL, CLAUDE_THINKING_EFFORT } }` (the same env `acpLaunchFor` builds today, built here rather than by delegation) and a codex entry as `{ command: 'codex-acp', args: ['-c', model, ...effort], env: {} }` — no `npx`, no package argument. Opencode keeps delegating to `acpLaunchFor`. `acpLaunchFor` is unchanged. Update the comment above `acpLaunchForEntry`. Before writing, confirm in the pinned claude adapter's source that it still reads `ANTHROPIC_MODEL` (and the effort variable) the way the deprecated adapter did; if a variable name changed, use the pinned adapter's name and record it in the test.

## Tests

- `src/acp/command-path.test.ts`: with `../janissary-root.js` mocked (`vi.mock`) to a temp root holding `node_modules/.bin/<name>` as an executable file, a name present there resolves to its absolute path with the env unchanged, even when the server `PATH` would also resolve it; any other name falls through to the existing `PATH` behavior (the existing cases keep passing unmodified); a command given as a path is still returned as given.
- `src/acp/launch.test.ts` (it asserts the old `@zed-industries/*` argument lists today): claude role entries launch `claude-agent-acp` with no args and the model/effort env; codex role entries launch `codex-acp` with only the `-c` model and effort overrides; the no-effort codex case keeps only the model override; opencode still equals `acpLaunchFor`'s output; the two `acpLaunchFor` cases stay byte-for-byte unchanged (shared with subplan 4, which keeps them passing).
- `src/acp/manager-fallback.test.ts`: the assertions naming `npx` / `@zed-industries/claude-code-acp` / `@zed-industries/codex-acp` move to the new `bin` names and argument lists.
- `src/monitor/acp.test.ts`: unchanged, and must keep passing — it pins `acpLaunchFor`'s `npx` launch.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model" (the paragraph beginning "Each entry launches its harness's ACP agent"): `claude` and `codex` entries run the Claude Agent and Codex ACP adapters bundled with Janissary (found in the install's `node_modules/.bin` ahead of `PATH`), not through `npx`; opencode must still be installed and on `PATH`. This is the "bundled adapters" part of the source plan's `acp.md` bullet.
- `documentation/user-documentation/advanced-agents/acp-agent.md` "Before the first prompt": the sentence "A `claude` or `codex` entry runs its ACP adapter through `npx`." becomes stale with this change; replace it with one saying the adapters ship with Janissary, so only the harness's own sign-in is needed. (Not listed in the source plan; required by architecture principle 10 because this change makes the sentence false.)

## Verification

`$janissary/scripts/run.mjs check-diff` green (lint, typecheck, server tests). Manually: with a claude and a codex entry first in the `ask` role, run `ask hello` in a shell tab with outbound access to the npm registry blocked (or watch the process list) and confirm the session starts from `node_modules/.bin/claude-agent-acp` / `codex-acp` with no `npx` process or registry fetch; confirm the codex adapter starts after the `--ignore-scripts` install (its native `@openai/codex` binary resolves); confirm a monitor persona still launches through `npx @zed-industries/claude-code-acp`.

## Out of scope

- Any deny-all configuration of built-in tools (subplan 4), the session `_meta` channel (subplan 3), the denial activity record (subplan 2), the primer lines (subplan 5), and the remote protocol bump (subplan 6).
- Monitor, conversation, editor persona, and autonomous `agent` run launches, including their `npx` claude launch and their adapter package.
- A `createRequire`-based adapter resolution for hoisted layouts.
- Making `node` resolvable for the adapter's shebang when the server's `PATH` lacks it — the same requirement `npx` had before.
