## Sandbox

A workspaced tab (`agent -w` / `harness -w`) confines its processes to the workspace directory
using a kernel-enforced [Seatbelt](https://en.wikipedia.org/wiki/Sandbox_(computer_security))
sandbox (`sandbox-exec`), on macOS only. `src/sandbox-profile.ts` holds the static profile text and
its table-driven carve-out/carve-in/secret-deny lists; `src/sandbox.ts` resolves the dynamic paths
(workspace, temp dir, `$HOME`, the parent repo's git objects dir, the self-binary's own directory,
the real Darwin per-user cache dir) and wraps the spawn in `sandbox-exec -p <profile> -D … --`.

### What gets sandboxed

`sandboxSpawn(options, command, args, env)` wraps any spawn given a `workspaceDir` — the tab's
shell (`src/shell.ts`), a harness/interactive PTY (`src/pty.ts`), or an ACP agent connection
(`src/acp.ts`). It returns the input unchanged (no-op) when there's nothing to sandbox: no
`workspaceDir`, the `sandboxWorkspaces` config toggle is off, or `sandbox-exec` isn't on the host
(non-macOS). Everything a sandboxed process itself spawns inherits the same confinement.

### Filesystem policy

Rule ordering follows Seatbelt's "last matching rule wins" semantic: broad allow → `$HOME` deny →
carve-in allows → secret denies last (so a secret path stays denied even inside a carve-in).

- **Writes** are denied everywhere except the workspace, its private temp dir, the real Darwin
  per-user cache directory (see [Known OS quirks](#known-os-quirks-and-their-carve-ins)), and a
  narrow set of harness-state carve-outs (`HOME_WRITE_CARVEOUTS` in `sandbox-profile.ts`):
  `~/.claude/projects`, `~/.claude/session-env`, `~/.claude.json`, `~/.codex`,
  `~/.config/opencode`, `~/.local/share/opencode`, `~/.local/state/opencode`, `~/.npm/_cacache`,
  `~/.cache/pip`, `~/.cache/yarn`. Never the whole `~/.claude`, `~/.cache`, or `~/.npm` — broad
  cache write access would let a sandboxed agent poison packages a non-sandboxed process later
  consumes.
- **Reads** are allowed everywhere by default (system paths, language runtimes, Homebrew all stay
  readable) except `$HOME`'s *contents*, which are denied and then carved back in
  (`HOME_READ_CARVEINS` — the write carve-outs above, plus `~/.gitconfig`, `~/.gitexcludes`,
  `~/.claude/settings.json`, and `~/Library/Keychains`). `$HOME`'s directory **metadata** (stat/lstat) stays allowed
  everywhere, not just the carve-ins — resolving a path (`realpath`, a pre-exec `chdir`, git's
  ancestor-ownership walk) requires traversing every ancestor directory between `$HOME` and the
  workspace, and Seatbelt checks each ancestor individually rather than just the final target.
- **Dotfile symlinks**: many managed dotfiles (`.gitconfig`, …) are themselves symlinks (e.g. via a
  dotfile manager). Seatbelt evaluates an `lstat`/`readlink` of the symlink node against its literal
  path but a `read`/`open` that follows it against the resolved target, so every carve-in/deny table
  entry is expanded into **both** a literal and a fully realpath-resolved `-D` param
  (`dualParams` in `sandbox-profile.ts`) — carving in only one leaves the other operation denied.
- **Secrets** (`SECRET_DENY_PATHS`) are denied last, with the full `file-read*` operation (including
  metadata, so their existence isn't observable either), even inside a carve-in: `.ssh`, `.aws`,
  `.gnupg`, `.kube`, `.netrc`, `.config/gh`, `.docker`, `.config/gcloud`, `.azure`,
  `.cargo/credentials(.toml)`, `.pypirc`, `.m2/settings.xml`, `.terraform.d`, shell/Python/Node REPL
  history files, and browser profile directories (Chrome, Firefox, Brave, Safari).
- **`~/Library/Keychains`** is a read carve-in, not a secret deny, despite being far more sensitive
  in principle than the other carve-ins — see [Known OS quirks](#known-os-quirks-and-their-carve-ins).
- A harness's own executable directory (`SELF_DIR_L`/`SELF_DIR_R`, resolved from `PATH` at spawn
  time — both the literal and realpath-resolved form, same reasoning as dotfile symlinks above) is
  always readable, even under `$HOME` (e.g. an nvm- or `~/.opencode/bin`-installed binary). A
  process reading its own executable is always safe to allow, and some system frameworks the
  process links against do exactly that for self-introspection (see below).
- The janissary **server's own** Node binary directory (`SERVER_NODE_DIR_L`/`SERVER_NODE_DIR_R`,
  resolved from `process.execPath` — same literal/real dual reasoning) is readable for the same
  self-introspection reason, and its path is also exposed to sandboxed processes via the
  `JANISSARY_NODE` env var (see [Environment scrubbing](#environment-scrubbing)) so a script
  running inside the sandbox can invoke a known-good `node` without depending on `PATH` resolution
  order inside that sandboxed context.
- `/dev/null` and tty/pty devices get their own narrow read/write/ioctl allow, independent of the
  workspace/`$HOME` rules — a PTY-backed tab needs `ioctl` (raw-mode termios, window size) on its
  controlling terminal, which is a distinct Seatbelt operation from `file-read*`/`file-write*`.
- `/tmp` and `/private/tmp` are explicitly denied for `process-exec` — a script copied there can't
  be run, even though the directory itself is readable/writable by everything.

### IPC and system info

- `mach-lookup` is allowed broadly (needed for `securityd`/Keychain access — see below — and
  general system service lookups), except the macOS pasteboard (`com.apple.pboard`), denied last so
  a sandboxed process can't read the system clipboard.
- `appleevent-send` is denied outright — no controlling other apps via Apple Events.
- `sysctl-read` is allowed — read-only system info (CPU/memory/OS-version queries, no user data).
  JS engines that JIT (Bun, which compiles the `claude`/`opencode` CLIs) probe these during startup
  via `sysctlbyname`; denied, the probe traps (`SIGTRAP`) rather than erroring, crashing the harness
  outright instead of falling back gracefully.
- Network is allowed by default; `--offline` swaps in a profile variant that denies it.

### Environment scrubbing

`scrubEnv` drops credential-shaped variables and agent-socket/credential-helper escape vectors from
the spawned process's environment before wrapping it — vectors that would otherwise bypass the
file-read denies above entirely (e.g. `SSH_AUTH_SOCK` lets a process use the user's SSH keys without
ever reading `~/.ssh`): `AWS_*`, `GITHUB_TOKEN`, `GH_TOKEN`, `NPM_TOKEN`, `DOCKER_*`, `KUBECONFIG`,
anything ending `_SECRET`/`_PASSWORD`, `SSH_AUTH_SOCK`, `GPG_AGENT_INFO`, `GNUPGHOME`,
`GIT_ASKPASS`, `GIT_CREDENTIAL_HELPER`, `KRB5CCNAME`. LLM provider keys (`ANTHROPIC_*`, `OPENAI_*`,
`GEMINI_*`/`GOOGLE_*`) are deliberately **not** matched — the harnesses and the ACP agent need their
own credentials to function. If a scoped GitHub token is configured for the project
(`.janissary/github-token`, loaded by `src/github-token.ts`), `GH_TOKEN` is re-added after the scrub
with that value — the one deliberate exception to "a scrubbed var never comes back": it's not the
ambient value just stripped, it's a fresh, narrowly-scoped one chosen for this workspaced spawn (see
[[workspaced-agent]]'s "GitHub authentication"). `TMPDIR` is overridden to the workspace's private temp dir
(`<workspace>.tmp`) regardless of what the caller passed in. `JANISSARY_NODE` is added, set to
`process.execPath` — the absolute path of the Node binary running the janissary server itself —
so a script inside the sandbox (e.g. a project's own `.claude/settings.json` hook) can invoke a
known-good `node` directly instead of relying on a bare `node` resolving correctly via `PATH` in
whatever context spawned it.

### Known OS quirks and their carve-ins

Two macOS behaviors don't fit the tidy "deny `$HOME`, carve in what's needed" model and needed
dedicated handling:

- **Self-binary introspection.** A framework a harness links against may reopen the harness's own
  executable file (and its containing directory) for introspection — notably Keychain's
  `SecItemCopyMatching`, which calls `CFBundleGetMainBundle` to determine code identity for ACL
  matching. Without the `SELF_DIR_L`/`SELF_DIR_R` carve-in, a harness binary installed under `$HOME`
  (nvm, `~/.opencode/bin`, …) can't complete that self-read, and the Keychain call fails silently —
  the harness reports "not logged in" with no permission error to explain why. Because a PTY-backed
  tab always spawns `<shell> -lc '<command>'`, `sandboxSpawn`'s own `command` argument is always the
  shell, never the harness binary — `pty.ts` passes the real program name through explicitly as
  `SandboxOptions.selfBinaryHint` so the profile carves in the right directory.
- **The real Darwin per-user cache directory.** `confstr(3)`'s `_CS_DARWIN_USER_CACHE_DIR` — a
  fixed, per-user, kernel-assigned path (`/var/folders/<hash>/<hash2>/C/`) — is looked up directly
  by system frameworks, bypassing the `TMPDIR` override entirely. Security.framework's legacy
  CDSA/MDS subsystem (still exercised by `SecItemCopyMatching` on some macOS versions) locks
  `.../C/mds/mds.lock` on every Keychain query; denied, the lock acquisition fails and the query
  returns "not found" rather than erroring — again surfacing as a silent "not logged in". `sandbox.ts`
  resolves this path once (via `getconf DARWIN_USER_CACHE_DIR`, cached for the process's life) and
  carves in **only** the `C/` (cache) subtree for writes — deliberately not its `T/` (temp) sibling,
  which is what `os.tmpdir()`-based scratch paths resolve to; carving in the shared parent of both
  would let a sandboxed process write anywhere a plain `mktemp` call lands, defeating the
  outside-the-workspace write deny.
- **`~/Library/Keychains` as a read carve-in.** Even "modern" Keychain Services calls
  (`SecItemCopyMatching`) fall through to the same legacy CDSA/MDS implementation, which reads the
  keychain database file directly rather than only talking to `securityd` over IPC. Denying that
  read (its natural home would be `SECRET_DENY_PATHS`, alongside `.ssh`/`.aws`/etc.) blocks every
  keychain lookup a sandboxed process makes, including a harness's own OAuth credential. The
  database stays encrypted and per-item ACL-enforced by `securityd` regardless of raw file
  readability, so this doesn't hand out plaintext secrets — but it is a materially larger read
  surface than the other carve-ins, kept as a deliberate trade-off documented inline in
  `sandbox-profile.ts` rather than silently folded in with the others.
- **The harness CLI's own scratchpad directory.** Claude Code (and presumably other harness CLIs)
  creates a per-project/session scratch directory under a fixed, UID-keyed path,
  `/private/tmp/claude-<uid>/`, before running any tool call — including a plain shell command.
  This path is outside `$HOME`, outside the workspace-local `TMPDIR` override, and outside the
  Darwin cache dir carve-in above, so without carving it in, **every** tool invocation inside a
  sandboxed harness session fails at that housekeeping step, before the tool's own command ever
  runs — the harness reports an EPERM/`mkdir` failure with no indication that a shell command was
  even attempted. `sandbox.ts` resolves this once as `CLAUDE_SCRATCH_DIR` (`/private/tmp/claude-<uid>`,
  from `process.getuid()`, cached for the process's life) and carves in write access for it —
  reads already work via the broad file-read* allow, same as the Darwin cache dir.

### Practical consequences

No global installs, no reading sibling workspaces/other repos/dotfiles outside the carve-ins above.
`git commit`/`fetch`/`pull`, `npm install`, builds, and venvs inside the workspace all work normally,
as does logging in and running a harness (`claude`, `opencode`) that needs its Keychain-stored
credential. The workspace's `origin` is HTTPS and points at GitHub directly (not the local root
repo), so `git push` and `gh` (PR create/merge) work from inside the sandbox too, **if** a scoped
GitHub token is configured (see [[workspaced-agent]]) — without one, those still fail, since `.ssh`
and `SSH_AUTH_SOCK` are denied/scrubbed and there's no other credential path in.

### Configuration and availability

Isolation is on by default (`sandboxWorkspaces: true` in `.janissary/config.json`); set it to
`false` to disable it (e.g. on a non-macOS host, or if a particular harness misbehaves under it).
`sandboxAvailable()` additionally requires `darwin` and `/usr/bin/sandbox-exec` to exist — cached
after the first check. `sandboxNotice()` returns a one-line explanation (`workspace isolation off:
sandboxWorkspaces disabled in config` / `workspace isolation off: sandbox-exec unavailable`) when a
workspaced tab is created and isolation isn't actually active; the caller appends it to that tab's
transcript. `--offline` (independent of the config toggle) swaps in `SANDBOX_PROFILE_OFFLINE`, which
denies `network*` instead of allowing it.
