# Isolate workspaced agents to their workspace (Seatbelt)

**Complexity: 6/10** — two new modules, three spawn-site integrations, env scrubbing, config toggle, `--offline` flag parsing, type changes across `Tab`/`AcpOptions`/`Config`, plus carve-in iteration against real harnesses.

Implements the `docs/todo-features.md` item "isolate workspaced agents to workspace": a workspaced tab (`agent <name> --workspace`, `harness <name> --workspace`) should only be able to touch files in its workspace clone.

## Approach

Generate a minimal Seatbelt profile in-process and wrap every process janissary spawns for a workspaced tab in `sandbox-exec -p '<profile>'`. Zero new dependencies; the restriction is kernel-enforced and inherited by the entire process tree, so nothing the harness or shell spawns can escape it.

Validated on this machine (macOS 12): inline profiles with `-D` parameter substitution enforce write-deny outside an allowed subpath (`Operation not permitted`), read-deny of protected dirs, and git works normally inside the sandbox.

Scope: v1 is full confinement — a write allowlist, read isolation of `$HOME` with explicit carve-ins, a layered secrets read-deny, exec and IPC hardening, environment scrubbing, and an opt-in network deny. The main implementation cost is carve-in iteration: launching each harness inside the sandbox, watching for `Operation not permitted`, and extending the table-driven carve-in lists until the smoke checklist passes.

Seatbelt ordering note: the last matching rule wins, so profiles are assembled as default → broad denies → carve-in allows → secret denies last (so a secret path inside a carve-in stays denied).

## The v1 rule set, spelled out

**Writes: denied by default.** The only writable locations are:

| Writable path | Why |
| --- | --- |
| the workspace clone (`<project>/.janissary/workspace/<name>`) | the point of the feature |
| the workspace's private temp dir (`.../workspace/<name>.tmp`, exported as `TMPDIR`) | scratch space without sharing `/tmp` across agents |
| `/dev/null` and tty/pty devices (regex, not the whole `/dev` subpath) | any terminal program needs these |
| `~/.claude/projects/`, `~/.claude/session-env/`, `~/.claude.json` (+ its atomic-rename temp files) | claude harness state/auth — **not** the whole `~/.claude/` (which contains `history.jsonl`, `file-history/`, `plugins/`, `daemon/` from all sessions; writing those is cross-session tampering) |
| `~/.codex` | codex harness state |
| `~/.config/opencode`, `~/.local/share/opencode`, `~/.local/state/opencode` | opencode harness state |
| `~/.npm/_cacache`, `~/.cache/pip`, `~/.cache/yarn` (narrow subpaths, not the whole `~/.cache`/`~/.npm`) | package-manager caches — see security note below |

**Cache poisoning risk.** Broad write access to `~/.cache` and `~/.npm` lets a sandboxed agent write poisoned packages that non-sandboxed processes (the user's own shell, other agents) later consume — a privilege-escalation path from sandboxed to unsandboxed. Narrow the carve-in to the specific subpaths each harness actually writes to (verified during smoke testing). If a harness needs broader cache access, document the trade-off explicitly rather than silently widening.

Global `/tmp` and `/private/tmp` are intentionally not writable — the per-workspace `TMPDIR` replaces them. Risk: tools that hardcode `/tmp` paths will fail; if the smoke checklist shows real breakage, fall back to allowing global `/tmp` and keep the private `TMPDIR` as the default.

Practical consequences inside a workspaced tab: no modifying the parent project repo — including `git push` to the local origin (push writes the parent's `.git`); work is integrated from outside by fetching from the workspace. No writing other repos, sibling workspaces, or dotfiles (`git config --global` fails). No global installs (`brew`, `npm i -g`, `pip install --user`). `git commit/fetch/pull`, `npm install`, builds, and venvs inside the workspace all work.

**Reads: `$HOME` denied by default**, with carve-ins; system paths outside `$HOME` stay readable (harness binaries, `/usr`, node, homebrew):

- carve-ins (read-allowed): the workspace and its temp dir, the parent repo's `.git/objects` (required by the `--shared` clone's alternates), the harness state dirs from the write table (narrowed `~/.claude` subpaths, not the whole directory), `~/.gitconfig`
- layered secret denies (last, so they win even inside carve-ins): `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.kube`, `~/.netrc`, `~/.config/gh`, `~/.docker`, `~/.config/gcloud`, `~/.azure`, `~/.cargo/credentials*`, `~/.pypirc`, `~/.m2/settings.xml`, `~/.terraform.d`, shell history files, `~/Library/Keychains`, browser profile dirs

Consequence: sibling workspaces, other repos, documents, and dotfiles are unreadable; the parent repo's *source* is unreadable (the workspace has its own checkout — only `.git/objects` is carved in).

**Exec:** denied from `/tmp` and `/private/tmp` (blocks download-and-run); the workspace itself stays exec-allowed because agents must run `node_modules/.bin` and their own builds.

**IPC:** deny Apple Events (controlling other apps) and pasteboard mach services (clipboard reads). Everything else under `(allow default)` remains — notably securityd/Keychain lookups, which claude's OAuth tokens require.

**Network:** allowed by default; `--offline` on `agent`/`harness` adds `(deny network*)` to that tab's profile for fully-local work. Domain-level filtering needs a proxy — deferred.

**Environment scrubbing (not Seatbelt — complements it):** all three spawn sites currently pass `process.env` through, so credentials in janissary's environment reach the agent regardless of the file sandbox. Workspaced spawns get a scrubbed env: a table-driven denylist of credential-shaped vars (`AWS_*`, `GITHUB_TOKEN`/`GH_TOKEN`, `NPM_TOKEN`, `DOCKER_*`, `KUBECONFIG`, generic `*_SECRET`/`*_PASSWORD`). LLM provider keys (`ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`/`GOOGLE_*`) are explicitly *not* scrubbed — the harnesses and the ACP agent need their own credentials to function.

**Agent-socket vars must also be scrubbed** (these are IPC escape vectors — the file sandbox doesn't block them):

| Variable | Risk if passed through |
| --- | --- |
| `SSH_AUTH_SOCK` | the agent can use the user's SSH keys via the agent socket to authenticate to git remotes, effectively bypassing the `~/.ssh` read-deny |
| `GPG_AGENT_INFO` / `GNUPGHOME` | the agent can sign/encrypt through the user's GPG keys via the GPG agent |
| `GIT_ASKPASS` / `GIT_CREDENTIAL_HELPER` | git inside the sandbox could invoke external credential helpers that return passwords |
| `KRB5CCNAME` | the agent can use the user's Kerberos ticket cache |

These are unset in the scrubbed env, not just read-denied at the file level. The scrub denylist is the enforcement point.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| `workspaceDir` already stored on `Tab` | `src/types.ts`, `Tab.workspaceDir?: string` |
| `workspaceDir` threaded through harness and agent creation | `HarnessManager.open` (`src/harness-manager.ts`), `ProfileManager.newAgent` (`src/profile-manager.ts`) |
| `makeHarnessTab` / `makeTab` accept `workspaceDirectory` | `src/tab.ts`, `makeHarnessTab` and `makeTab` |
| Workspace clone creation and cleanup | `createWorkspace` / `removeWorkspace` (`src/workspace.ts`), `WorkspaceManager` (`src/workspace-manager.ts`) |
| PTY spawn with env passthrough | `spawnPty` (`src/pty.ts`) — `env: process.env` |
| Shell spawn with env passthrough | `spawnShell` (`src/shell.ts`) — `env: { ...process.env, ...extraEnvironment }` |
| ACP subprocess spawn with env passthrough | `connectAcp` (`src/acp.ts`) — `env: options.env ? { ...process.env, ...options.env } : process.env` |
| Config loading and defaults | `loadConfig` / `DEFAULT_CONFIG` (`src/config.ts`) |
| `--workspace` flag parsing | `parseAgentCommand` (`src/agent-commands.ts`), `parseHarnessCommand` (`src/harness.ts`) |
| Tab cleanup on close (workspace removal) | `closeTabResources` → `workspace.remove` (`src/tab-cleanup.ts`) |
| `cwdOf` for tab working directory | `TabManager.cwdOf` (`src/tab-manager.ts`) |

## Implementation steps

Each step leaves `./scripts/run.mjs check-diff` green. Steps 1–2 are self-contained; step 3 adds the config toggle; step 4 wires the three spawn sites (depends on 1–3); step 5 is docs.

### 1. New modules `src/sandbox.ts` + `src/sandbox-profile.ts`

- `sandbox.ts` — the API: `sandboxAvailable(): boolean` (darwin and `sandbox-exec` on PATH, cached); `sandboxSpawn(options, command, args): { command, args, env }` — returns `sandbox-exec` + `-D` params + `-p <profile>` + original argv and a scrubbed env when sandboxing applies; returns input unchanged when `workspaceDir` is undefined, config-disabled, or unavailable. `options` carries `workspaceDir` and `offline`.
- `sandbox-profile.ts` — the static profile text plus the table-driven lists: write-allow carve-outs, read carve-ins, secret read-denies, env-scrub patterns. Extending any restriction is a one-line table change.
- All dynamic paths go in via `-D KEY=value` params, never string-interpolated into the profile — no quoting/injection surface, and the profile stays a static constant (keeps `security/*` lint rules happy).
- **Line budget:** `sandbox-profile.ts` holds the profile text and four tables (write-allow, read carve-in, secret deny, env scrub). Budget ~120 lines for the profile text and ~60 for the tables — tight against the 200-line `max-lines` limit. If it exceeds, extract the env-scrub denylist into `sandbox-env.ts` (a pure data module). `sandbox.ts` holds the API functions and should stay well under 200 lines.
- **Import extensions:** all relative imports from these modules use `.js` per the NodeNext rule (`import-x/extensions` in `eslint.config.mjs`).

### 2. Workspace temp dir

- `createWorkspace` (`src/workspace.ts`, `export function createWorkspace`) also creates the sibling `<target>.tmp`; `removeWorkspace` (`src/workspace.ts`, `export function removeWorkspace`) removes it. `sandboxSpawn` sets `TMPDIR` to it in the returned env.

### 3. Config toggle and `--offline` flag

- `Config.sandboxWorkspaces?: boolean`, default `true`, added to `Config` type in `src/types.ts` (the `--- config.ts ---` section, currently `Config` has `transcriptMaxLines` and `tabNameMaxLength`) and to `DEFAULT_CONFIG` in `src/config.ts` (line 8). Workspaced means isolated by default; the config key is the escape hatch.
- `--offline` parsed by `parseAgentCommand` (`src/agent-commands.ts`, `parseAgentCommand` function) and `parseHarnessCommand` (`src/harness.ts`, `parseHarnessCommand` function). Both return types gain an `offline: boolean` field (`AgentCommand` and `HarnessParsed` in `src/types.ts`). Stored on the tab as a new field `Tab.offline?: boolean` (added to `Tab` type in `src/types.ts`) so relaunches keep it, and passed into `sandboxSpawn`.
- When a workspaced tab is created but sandboxing is off/unavailable, append a one-line notice to the creating tab's transcript (e.g. "workspace isolation off: sandbox-exec unavailable"). No tab-label markers — status belongs in the transcript/connections panel.

### 4. Wire-up at the three spawn sites (each gated on the owning tab's `workspaceDir`)

- **PTY harnesses** — `HarnessManager.open` (`src/harness-manager.ts`, `open` method) already knows `workspaceDir`; pass it (along with `tab.offline`) through `PseudoterminalManager.spawn` (`src/pseudoterminal-manager.ts`, `spawn` method) → `spawnPty` (`src/pty.ts`, `spawnPty` function). `spawnPty` currently calls `pty.spawn(shell, ['-lc', command], { env: process.env })` — the sandbox integration point is here: when `workspaceDir` is set, replace `command` with `sandbox-exec -p '<profile>' -D KEY=value … -- <shell> -lc <command>` and replace `process.env` with the scrubbed env from `sandboxSpawn`. `PseudoterminalManager.spawn` gains optional `workspaceDir` and `offline` parameters to thread through. `openInlinePty` (`src/pseudoterminal-manager.ts`, `openInlinePty` method) currently gets cwd from `this.managers.tab.cwdOf(label)` — it must also look up `tab.workspaceDir` and `tab.offline` for inline terminal cards on workspaced tabs (e.g. `shell vim` inside a workspaced agent tab).
- **Per-tab persistent shell** — `ShellManager.getShell` (`src/shell-manager.ts`, `getShell` method) looks up the tab's `workspaceDir` and `offline` from `this.managers.tab.tabs` and passes them to `spawnShell` (`src/shell.ts`, `spawnShell` function). `spawnShell` currently calls `spawn(process.env.SHELL || 'bash', …, { env: { ...process.env, ...extraEnvironment } })` — when `workspaceDir` is set, wrap the spawn argv via `sandboxSpawn` (prepend `sandbox-exec -p '<profile>' …` to the command, use the returned scrubbed env). The shell itself is the sandboxed process; everything it spawns inherits the sandbox.
- **ACP subprocess** — add `workspaceDir?: string` and `offline?: boolean` to `AcpOptions` in `src/types.ts`. `connectAcp` (`src/acp.ts`, `connectAcp` function) currently calls `spawn(options.command, options.args, { cwd, env })` — when `options.workspaceDir` is set, wrap via `sandboxSpawn` before spawning. `AcpManager.session` (`src/acp-manager.ts`, `session` method) supplies `workspaceDir` and `offline` from the tab when calling `connectAcp`. **Note:** `monitor-acp.ts` also calls `connectAcp` directly (for monitor sessions). Monitor sessions don't belong to workspaced tabs, so they never pass `workspaceDir` — `sandboxSpawn` returns input unchanged when `workspaceDir` is undefined, so monitor sessions are unaffected. No code change needed in `monitor-acp.ts`.

**ACP tool-loop commands are NOT sandboxed by this plan.** The ACP tool loop (`acp-manager.ts`, `run` method) dispatches extracted commands via `database.runInTab` (which runs SQLite in-process via `runDatabaseCommand`, not through the tab shell) and `browser.run` (which drives a headless browser). These are in-process operations, not shell commands — the Seatbelt sandbox on the ACP subprocess does not constrain them. This is acceptable for v1: the ACP agent itself is sandboxed (it can't read/write outside the workspace), and its tool-loop commands are limited to the db/browser surfaces janissary already provides.

Out of scope, intentionally: monitor sessions (`monitor-acp.ts`) and the browser manager — they don't belong to workspaced tabs.

### 5. Docs

- `README.md` `### Commands` section (parsed into `help` by `buildHelp()`, `src/commands.ts`): document that `--workspace` now confines the tab's processes to the workspace (writes and `$HOME` reads), scrubs credential env vars, and supports `--offline`; document the `sandboxWorkspaces` config key.
- Remove/strike the item from `docs/todo-features.md` when complete.

## Tests

- `src/sandbox.test.ts` (unit): argv/env shape of `sandboxSpawn`; identity passthrough when workspaceDir undefined / config off / non-darwin; every `-D` param present; profile constant syntactically balanced; env scrubbing drops denylisted vars (including `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, `GIT_ASKPASS`, `GIT_CREDENTIAL_HELPER`, `KRB5CCNAME`) and keeps provider keys; `offline` adds the network-deny param; `sandboxWorkspaces: false` disables sandboxing even with `workspaceDir` set.
- Integration (darwin-only, `describe.skipIf(!sandboxAvailable())`): spawn a real sandboxed shell via `sandboxSpawn` with a temp workspace; assert (a) write inside workspace and its `TMPDIR` succeeds, (b) write outside fails, (c) read of a path under the fake `$HOME` fails while a carve-in succeeds, (d) exec of a script copied to `/tmp` fails, (e) with `offline`, a localhost connection fails.

## Security considerations

**Network exfiltration is the largest residual risk.** With network allowed by default (the current plan), a sandboxed agent can read every file in its workspace — the full source code, configs, and anything the clone contains — and send it to any remote endpoint. The env scrub removes credential-shaped vars, but the code itself is the asset being protected. `--offline` closes this, but it's opt-in. The implementer should consider whether the default should flip to network-denied (with an `--online` opt-in), or whether the transcript notice when sandboxing is active should explicitly warn "network access enabled — use --offline to disable". This is a product-scope decision for the human.

**`SSH_AUTH_SOCK` is the highest-priority env scrub.** The file sandbox read-denies `~/.ssh`, but `SSH_AUTH_SOCK` points to a Unix domain socket (typically under `/private/tmp/com.apple.launchd.*/Listeners`) that the SSH agent listens on. A sandboxed process with this var can run `ssh-add -l` to list keys, `git push` to authenticate to remotes, or `ssh host` to log into servers — all without ever reading a key file. The env scrub must unset it. Same logic applies to `GPG_AGENT_INFO` (GPG agent socket) and `KRB5CCNAME` (Kerberos ticket cache).

**Symlink resolution.** Seatbelt evaluates rules against the *resolved* (real) path, not the symlink path, so a symlink inside the workspace pointing to `/etc/passwd` or `~/Documents` should be denied by the read rules. This must be verified in the smoke checklist: create a symlink inside the workspace to a path outside, then `cat` it — should fail with `Operation not permitted`.

**macOS system temp (`/private/var/folders`).** Many macOS APIs (`NSTemporaryDirectory()`, `mkstemp`, Foundation's `FileManager.temporaryDirectory`) resolve to `/private/var/folders/…`, not `/tmp`. The plan's per-workspace `TMPDIR` overrides this for processes that honor `TMPDIR`, but processes that call the macOS APIs directly bypass it. Add a smoke test: run a small node script inside the sandbox that calls `os.tmpdir()` and verify it resolves to the workspace's `TMPDIR`, not `/private/var/folders`.

**`~/.claude` is not a single-purpose directory.** It contains `projects/` (trust settings for all projects the user has ever used claude in), `history.jsonl` (command history from all sessions), `file-history/` (edit history), `plugins/`, `daemon/`, and `session-env/`. The write allowlist must be narrowed to the subpaths the claude harness actually writes to during a session — not the whole directory. A sandboxed agent with write access to `projects/` could modify trust settings for other projects; with write access to `plugins/` it could inject a plugin that runs in future non-sandboxed sessions.

**What the sandbox does NOT protect against:**
- Network exfiltration of workspace contents (unless `--offline` is used)
- Timing attacks or side-channel observation of other processes
- Abuse of LLM provider keys that are intentionally passed through (`ANTHROPIC_*`, `OPENAI_*`) — a sandboxed agent can make arbitrary API calls with these keys
- Denial of service within the workspace (deleting workspace files, filling `TMPDIR`)

## Risks and open questions

- **Carve-in iteration is now the main cost.** Read isolation of `$HOME` and the loss of global `/tmp` will surface missing paths (harness caches, `~/.claude.json` rename temps, npm/npx internals, opencode data dirs) as `Operation not permitted` during the smoke checklist. Budget for iterating the tables per harness; fall back per-restriction (e.g. re-allow global `/tmp`) rather than abandoning the sandbox.
- **Nested sandboxes fail.** Codex applies its own Seatbelt profile to shell commands (`--sandbox workspace-write`), and Claude Code's sandboxed-bash does the same when enabled; `sandbox-exec` inside `sandbox-exec` errors. Mitigation: launch codex inside a workspace with its own sandbox relaxed (the outer boundary already enforces), or document that harness-native sandboxing must be off inside workspaced tabs. Likewise janissary itself must not already be running under a Seatbelt sandbox.
- **Keychain/IPC denies.** Verify the Apple Events / pasteboard denies don't catch securityd lookups — claude's OAuth tokens live in the Keychain. If they do, drop the pasteboard deny before weakening Keychain access.
- **Env scrubbing vs harness auth.** Users who authenticate claude via `ANTHROPIC_API_KEY` (rather than OAuth) depend on provider keys passing through — hence the explicit keep-list. The scrub denylist is a judgment call; keep it table-driven and documented.
- **Secrets denies are still a blocklist** for paths *inside* carve-ins (e.g. a credential under `~/.cache`). The `$HOME` default-deny covers everything else.
- **`sandbox-exec` is deprecated** (still what Chrome/Codex/Claude Code ship on). The `sandboxSpawn` choke point keeps the mechanism swappable (e.g. for a dedicated-user wrapper) if Apple ever removes it.

## Out of scope

- Domain-level network filtering (requires a local proxy) — `--offline` is all-or-nothing.
- Connections-panel indicator showing a tab's isolation state.
- Linux support (bubblewrap behind the same `sandboxSpawn` choke point).
- Monitor sessions (`monitor-acp.ts`) — they don't belong to workspaced tabs and call `connectAcp` without `workspaceDir`, so `sandboxSpawn` passes through unchanged.
- Browser manager — not associated with workspaced tabs.
- ACP tool-loop commands (`database.runInTab`, `browser.run`) — these are in-process operations, not shell commands; the Seatbelt sandbox on the ACP subprocess doesn't constrain them.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end: `harness claude -w` — claude launches, edits workspace files, `touch ~/escape` fails, `cat ~/.ssh/id_rsa` and `ls ~/Documents` fail, `env` shows no `GITHUB_TOKEN` **and no `SSH_AUTH_SOCK`**; same smoke for `opencode` and `codex`; `agent x -w` shell tab — `touch ../escape` fails; `harness claude -w --offline` — network calls fail.
- **Security smoke tests** (run during carve-in iteration):
  - **Symlink escape:** `ln -s ~/Documents/secret.txt link && cat link` inside the workspace — must fail.
  - **NSTemporaryDirectory bypass:** `node -e "console.log(require('os').tmpdir())"` inside the sandbox — must print the workspace's `TMPDIR`, not `/private/var/folders/…`.
  - **SSH agent use:** `ssh-add -l` inside the sandbox — must fail (no `SSH_AUTH_SOCK` in env).
  - **Cache poisoning check:** after a sandboxed `npm install`, verify `~/.npm/_cacache` is the only npm subpath written to (no writes to `~/.npm/` outside `_cacache`).
- `npm run check` left to the human at the end.
