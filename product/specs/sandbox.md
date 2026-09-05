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

A conversation's ACP agent is also confined to its own private workspace. An ordinary agent launched from the conversation's metadata row uses the same directory as its sandbox workspace. That workspace belongs to the durable conversation rather than to a tab or project clone, and closing the conversation tab or shutting down the application does not sweep it. See [[conversations]].

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
  `~/.claude/settings.json`, `~/.config/gh/config.yml` (`gh`'s general settings, as opposed to
  `hosts.yml`, which stays denied), `~/Library/Keychains`, `~/.nvm` (nvm's loader scripts and every
  installed Node version under `versions/`), `~/.rvm` (same, for Ruby — execute needs no separate
  carve-in for either since `process-exec` is already allowed everywhere except
  `/tmp`/`/private/tmp`), `~/.bash_profile`/`~/.bashrc` (sourced by a login/interactive `bash`
  shell on startup), and `~/.cache/opencode/models.json` (opencode's cached provider/model
  catalog, so a workspaced opencode harness sees the same model list the non-sandboxed opencode on
  that machine has already fetched — read-only, and deliberately not a write carve-out, since a
  non-sandboxed opencode reads the same file and a writable cache would let a sandboxed process
  hand it a forged catalog; only that one file is carved in, not the rest of `~/.cache/opencode`)).
  `$HOME`'s directory **metadata** (stat/lstat) stays allowed
  everywhere, not just the carve-ins — resolving a path (`realpath`, a pre-exec `chdir`, git's
  ancestor-ownership walk) requires traversing every ancestor directory between `$HOME` and the
  workspace, and Seatbelt checks each ancestor individually rather than just the final target.
- **Dotfile symlinks**: many managed dotfiles (`.gitconfig`, …) are themselves symlinks (e.g. via a
  dotfile manager). Seatbelt evaluates an `lstat`/`readlink` of the symlink node against its literal
  path but a `read`/`open` that follows it against the resolved target, so every carve-in/deny table
  entry is expanded into **both** a literal and a fully realpath-resolved `-D` param
  (`dualParams` in `sandbox-profile.ts`) — carving in only one leaves the other operation denied.
- **Secrets** (`SECRET_DENY_PATHS`) are denied last, for writes as well as reads, even inside a
  carve-in: `.claude/.credentials.json`, `.local/share/opencode/auth.json`, `.ssh`, `.aws`,
  `.gnupg`, `.kube`, `.netrc`, `.config/gh/hosts.yml`, `.docker`, `.config/gcloud`, `.azure`,
  `.cargo/credentials(.toml)`, `.pypirc`, `.m2/settings.xml`, `.terraform.d`, shell/Python/Node REPL
  history files, and browser profile directories (Chrome, Firefox, Brave, Safari).
- **`.local/share/opencode/auth.json`** is the one entry whose deny does real work rather than
  backing up a denial the tables already imply. Every other entry sits outside every carve-in, so the
  top-level defaults would deny it anyway; this one is inside `.local/share/opencode`, a write
  carve-out that opencode's session database and logs need. It holds every provider credential
  opencode has been given, in plaintext, and denying it only became possible once a workspaced
  opencode harness had another route to a credential — `OPENCODE_API_KEY`, injected from
  `.janissary/opencode-token` (see [[workspaced-agent]]). The write deny exists for the same entry:
  with the read reporting `ENOENT`, a process that decided to write the file would see no
  credentials and overwrite the real ones on the host, so denying the write turns a silent clobber
  into an ordinary failure. Consequence worth stating plainly: an opencode provider configured by
  `opencode auth login` rather than by an environment variable stops working inside a workspace, and
  `.janissary/opencode-token` does not substitute for it — that file supplies `OPENCODE_API_KEY`,
  which is what the OpenCode Zen and OpenCode Go providers read and nothing else. Every other
  provider reads its own key from the environment, which the scrub deliberately exempts.
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
- Janissary's own **Playwright client** package directories (`PLAYWRIGHT_DIR`/`PLAYWRIGHT_CORE_DIR`)
  are readable, so a harness launched with `-b`/`--browser` can import the client Janissary hands it
  via `JANISSARY_PLAYWRIGHT` (see [End-to-end browser](#end-to-end-browser)). `playwright-core` is
  carved in separately from `playwright` rather than assumed to sit inside it: it is `playwright`'s
  only runtime dependency, and in a hoisted layout it is a sibling, so carving in the parent alone
  leaves every internal import denied. The carve-in applies to every sandboxed spawn, not only a
  `-b` one — it grants read access to two directories of Janissary's own dependency tree, which hold
  no user data, and gating it would thread a flag through every spawn path to no benefit.
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
`GIT_ASKPASS`, `GIT_CREDENTIAL_HELPER`, `KRB5CCNAME`. LLM provider keys are deliberately **not**
matched — the harnesses and the ACP agent need their own credentials to function, and since
`.local/share/opencode/auth.json` became a denied secret path this is the only route a non-OpenCode
opencode provider has into a workspace. The ones that matter are `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, and for Google `GOOGLE_GENERATIVE_AI_API_KEY` — the Google spellings
`GOOGLE_API_KEY` and `GEMINI_API_KEY` pass the scrub too, but opencode reads them only when
recognizing the provider, never on a request, so neither works alone. A variable carrying the
credential *itself* crosses intact; one carrying a
*filename* does not help. `GOOGLE_APPLICATION_CREDENTIALS`, which the Vertex providers read, passes
the scrub like any other variable — so a Vertex setup looks configured from the environment's side —
but the file it names is unreadable inside the sandbox whenever it sits under `$HOME` outside a
carve-in, and its default location under `~/.config/gcloud` is an explicit secret deny. Widening that
deny to fix it would hand a workspaced agent a Google credential file, which is what the list exists
to prevent, so a Vertex-configured harness has no working route into a workspace. If a scoped GitHub token is configured for the project
(`.janissary/github-token`, loaded by `src/project-tokens.ts`), `GH_TOKEN` is re-added after the scrub
with that value — the one deliberate exception to "a scrubbed var never comes back": it's not the
ambient value just stripped, it's a fresh, narrowly-scoped one chosen for this workspaced spawn (see
[[workspaced-agent]]'s "GitHub authentication"). In the same case, `GH_CONFIG_DIR` is also set, to a
fresh `gh-config` directory under the workspace's private temp dir: `gh` reads
`~/.config/gh/hosts.yml` on every invocation regardless of `GH_TOKEN`, and its Go config loader
treats the sandbox's deny on that file (`SECRET_DENY_PATHS` above) as a fatal error rather than
falling back to `GH_TOKEN` — `gh auth status`/`gh api`/etc. refuse to run at all otherwise.
Redirecting `GH_CONFIG_DIR` gives `gh` a directory with a genuinely absent `hosts.yml` (real ENOENT,
no denial involved), which it handles by falling through to `GH_TOKEN` normally. Those two variables
are the one part of this section that is *not* conditional on isolation being active: a workspaced
tab needs its scoped credential to push whether or not the machine can confine it (see
[[workspaced-agent]]), so `GH_TOKEN` and `GH_CONFIG_DIR` are added on the pass-through path too —
where nothing else about the environment is changed and nothing is scrubbed. (Seatbelt's
`(with errno ...)` deny qualifier looks like a more surgical fix, but only takes effect when it's the
*sole* matching deny for that operation+path — any other unqualified deny or allow on the same path,
in either direction, wins over it regardless of rule ordering, and `hosts.yml` already falls under
the broader `$HOME`-wide read deny.) If a Claude Code subscription token is configured for the
project (`.janissary/claude-token`, loaded by `src/project-tokens.ts`), `CLAUDE_CODE_OAUTH_TOKEN` is
set to it for every workspaced spawn, on the confined and pass-through paths alike and for the same
reason the GitHub variables are — see [[workspaced-agent]]'s "Harness authentication". This one is
*not* a scrub exception, because it was never scrubbed: it is an LLM provider credential, and the
list deliberately exempts those. An ambient `CLAUDE_CODE_OAUTH_TOKEN` therefore passes through as it
always has, and a configured token simply takes precedence over it. It needs no companion variable of
the `GH_CONFIG_DIR` kind either — the harness reads its configuration from `~/.claude`, which is
already carved in. An OpenCode API key configured at `.janissary/opencode-token` (loaded by
`src/project-tokens.ts`) is set as `OPENCODE_API_KEY` on exactly the same terms, for the same
reasons: the variable the OpenCode Zen and OpenCode Go providers declare, off the scrub list as a
provider credential, and needing no companion because opencode reads its own configuration from
`~/.local/share/opencode`, likewise already carved in. A Google AI key configured at
`.janissary/gemini-token` (loaded by `src/project-tokens.ts`) is set on the same terms again, under
two variables rather than one: `GEMINI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY`, both carrying the
same key. opencode reads the two at different moments — it recognizes a configured Google provider
from either, but the request itself loads the key from `GOOGLE_GENERATIVE_AI_API_KEY` alone, so a
workspace given only the first saw the provider accepted and then the first prompt fail. The token
exists at all because the Google provider's key lives in opencode's own credential store, which is a
denied secret path, so without it that provider has no route into a workspace other than the ambient
environment. Four more variables are added for every workspaced spawn, carrying the git name and email of the user
who opened janissary: `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and
`GIT_COMMITTER_EMAIL`. Git reads these in preference to `user.name`/`user.email`, so they are what a
commit made inside a workspace is attributed to. The identity is read once at startup, by asking git
what it resolves for the project directory — the same answer a commit made there outside a workspace
would get. Both the author and the committer pair are set: git distinguishes the two, a commit an
agent makes has no distinction to draw, and setting only the author would leave the committer
resolving from whatever config the machine happens to have. A half the identity does not have plants
no variable at all, since git reads an empty `GIT_AUTHOR_NAME` as a name rather than as an absence.
Like the credentials, this is added on the confined and pass-through paths alike, and for a stronger
reason: locally the sandbox already carves in `~/.gitconfig`, so the identity was never in doubt, but
a remote workspace runs as whatever account the ssh destination resolved to and would otherwise
attribute an agent's commits to that account — or fail outright where it has no identity configured.
The four are not on the scrub list: they carry a name and an email address, not a credential, and
scrubbing them is precisely what this exists to avoid. See [[remote-server]] for how the identity
reaches a remote machine. `TMPDIR` is overridden to the workspace's private temp dir
(`<workspace>.tmp`) regardless of what the caller passed in. `JANISSARY_NODE` is added, set to
`process.execPath` — the absolute path of the Node binary running the janissary server itself —
so a script inside the sandbox (e.g. a project's own `.claude/settings.json` hook) can invoke a
known-good `node` directly instead of relying on a bare `node` resolving correctly via `PATH` in
whatever context spawned it. A tab launched with `-b`/`--browser` additionally gets
`JANISSARY_PLAYWRIGHT`, the path to Janissary's own Playwright client, and
`JANISSARY_BROWSER_WS_ENDPOINT`, the endpoint of the guard in front of that tab's browser (see
[End-to-end browser](#end-to-end-browser)). Both name paths and ports on the machine the harness
runs on, so a remote launch builds its own pair on the far side rather than being handed these.
Neither is a credential: the endpoint's unguessable path is the only secret either carries, and it
grants nothing beyond the one contained browser it names.

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
- **Keychain database *writes* for token refresh.** When a harness's OAuth access token expires
  mid-session it refreshes the token and persists the new one back into the Keychain — a *write* to
  a keychain database file, which the top-level write deny would otherwise block silently, leaving
  the stale expired token in place so the provider returns `401` ("Please run /login") after an
  extended run. Two narrow write carve-outs cover the databases a refreshed credential can land in:
  the file-based login keychain (`~/Library/Keychains/login.keychain-db`) and the data-protection
  keychain (`~/Library/Keychains/<UUID>/keychain-2.db`), where modern Keychain Services persists a
  generic-password item on current macOS. Both also cover each database's atomic-write temp sibling
  and SQLite sidecars (`-wal`/`-shm`/`-journal`). The carve-outs are deliberately limited to the
  keychain database files themselves, never the whole `~/Library/Keychains` subtree — the databases
  stay encrypted and `securityd`-ACL-enforced regardless of raw file writability, the same trade-off
  the read carve-in above rests on.
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

### End-to-end browser

A harness launched with `-b`/`--browser` (see Harness Tab) gets a headless Chromium it can drive.
That browser is contained by two independent layers, because neither is sufficient alone.

**The protocol guard.** The endpoint the harness is handed does not belong to the browser; it
belongs to a Janissary process in front of it. The guard relays browser-control traffic in both
directions and inspects every frame, in both text and binary form, by decoding it as UTF-8 and
parsing it as JSON. A frame from the harness naming a `file:` URL anywhere ends the session, as does
a reply from the browser whose navigation-result fields hold one, as does any frame that will not
parse at all. Ending the session means the connection is closed outright rather than one call
failing, so there is no partial read to salvage. Matching is on parsed values, not a text search, so
a `file:` URL written with JSON escapes is caught, and the scheme is compared after the same
normalization a browser's own URL parser applies — ASCII tabs and newlines removed throughout, then
leading controls and spaces trimmed — so a scheme padded or split by those characters names the same
thing to the guard as it does to the browser. Ordinary page content that merely mentions
`file://` relays through untouched. The guard listens on loopback only and accepts connections on
one unguessable path; the browser's own address behind it never leaves the Janissary process.

Both ends of that private hop are pinned to one loopback address rather than resolved by name, and
the endpoint the harness receives names the same one. A host that answers `localhost` with an IPv6
address first therefore cannot leave the browser listening on one loopback family while the guard
dials the other — a split that would present as a browser that starts, stays alive, reports no
failure, and is unreachable.

What the guard does not see is a server-initiated redirect that lands on a `file:` URL. That gap is
what the second layer exists to make harmless.

**The browser's own sandbox.** The browser process runs under its own Seatbelt profile — deliberately
not the harness profile, whose carve-ins (`~/Library/Keychains`, `~/.claude`, `~/.codex`, opencode's
state directory) are close to an inventory of what an escape would want. A browser needs none of
them. Its profile denies everything by default, allows reads broadly outside `$HOME`, denies `$HOME`'s
contents, and carves back in exactly three paths: the Chromium application bundle, the Node binary's
directory, and Janissary's own installation root — the three the process cannot start without. It may
write only inside its own scratch directory, that directory's temp sibling, and the Darwin per-user
cache. Networking, POSIX shared memory, IOKit property reads, and `sysctl-read` are allowed, since
Chromium fails to start rather than degrading without them.

That scratch directory is created fresh and empty for each `-b` tab, is never a clone of the
project, and is removed when the tab closes. It holds the browser's profile and downloads, so a
`file:` read that got past the guard finds a disposable directory with nothing in it — and cannot
reach the code under test, which the browser has no reason to read.

**What the browser is given.** The browser process does not inherit a filtered copy of the Janissary
server's environment the way a harness does. It is given a named, minimal set of variables — enough
to start and to find its own browser binary, its scratch temp directory, and the locale — and
nothing else crosses. It receives none of the project's configured credentials, none of the ambient
provider keys a harness is deliberately allowed to keep, no agent socket, and not the user's git
identity. Unlike the confinement below, this holds on every host: a machine that cannot sandbox the
browser is a reason to give it less, not more.

Each browser's directory belongs to that browser alone. It is allocated by creating it, so a
directory that already exists is never taken over, and it is never a workspace a tab could also be
using: two tabs, two browsers, or two sessions sharing one name still get separate directories, and
closing any one of them removes only the directory it created. A tab label decorates the name so a
directory listing says which tab a browser belongs to; it does not decide the location.

Chromium refuses to initialize its own internal sandbox inside an outer one, so a confined Chromium
runs with that internal sandbox off. This costs nothing that was not already given up: Playwright
defaults it off, and every Chromium Janissary launches today already runs that way with nothing
around it. The outer profile is a strict improvement on that.

**Where only one layer applies.** On a host without Seatbelt, or with `sandboxWorkspaces` off, the
browser starts unconfined and the guard is the only layer left. The scratch directory is still
created and still used, so writes stay tidy either way. This is the same asymmetry a workspaced tab
already has on a non-macOS host.

An operator wanting a third layer can apply Chromium's enterprise `URLBlocklist` policy with
`file://*` on the host. It is the only control that lives inside the browser process where a client
cannot reach it. Janissary does not apply it: a mandatory policy needs admin-installed managed
preferences per host and applies to the whole browser installation rather than to one tab.

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
