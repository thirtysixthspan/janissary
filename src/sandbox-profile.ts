// Static Seatbelt (`sandbox-exec`) profile text plus the table-driven path/env lists it's built
// from. Extending any restriction is a one-line table change. Dynamic paths (the workspace, its
// temp dir, `$HOME`, the parent repo's git objects dir) are never string-interpolated into the
// profile — they're substituted at spawn time via `-D KEY=value` params (see `sandbox.ts`), so
// this module has no injection surface and stays a plain constant.
//
// Rule ordering follows Seatbelt's "last matching rule wins" semantic: default deny → broad
// read/write allow → `$HOME` read-deny → carve-in allows → secret denies last (so a secret path
// stays denied even inside a carve-in).

// Narrow write carve-outs: harness auth/state directories and package-manager cache subpaths —
// never the whole `~/.claude`, `~/.cache`, or `~/.npm` (broad cache write access would let a
// sandboxed agent poison packages/plugins that other, non-sandboxed processes later consume).
// The `.claude/` entries are the session-state paths a sandboxed `claude` writes while running:
// transcripts, session env, task/todo/job state, shell snapshots, edit history, debug logs,
// plans, paste cache, and its stats/statsig telemetry caches. Deliberately absent: `.claude/plugins`
// (write access would let a sandboxed agent replace plugin code the unsandboxed CLI later runs —
// reads are carved in below), `daemon`/`ide`/`backups`, and the auto-updater's state files.
export const HOME_WRITE_CARVEOUTS = [
  '.claude/projects',
  '.claude/session-env',
  '.claude/sessions',
  '.claude/tasks',
  '.claude/todos',
  '.claude/jobs',
  '.claude/shell-snapshots',
  '.claude/file-history',
  '.claude/history.jsonl',
  '.claude/debug',
  '.claude/plans',
  '.claude/paste-cache',
  '.claude/cache',
  '.claude/statsig',
  '.claude/stats-cache.json',
  '.claude/mcp-needs-auth-cache.json',
  '.claude.json',
  '.codex',
  '.config/opencode',
  '.local/share/opencode',
  '.local/state/opencode',
  '.npm/_cacache',
  '.npm/_logs',
  '.npm/_npx',
  '.cache/pip',
  '.cache/yarn',
];

// Read carve-ins: the write carve-outs (a harness needs to read its own state), plus read-only
// extras — `.claude/settings.json` and the customization dirs a sandboxed `claude` loads on
// startup but must not modify (`plugins`, `skills`, `agents`, `commands`, `keybindings.json`),
// `.gitconfig` and `.gitexcludes` (the latter is whatever `core.excludesfile`
// in the former points to; every git invocation reads both), `.config/gh/config.yml` (`gh`'s
// general settings — git_protocol, editor, prompt — as opposed to `hosts.yml`, which can hold a
// plaintext OAuth token and stays denied via `SECRET_DENY_PATHS`; a workspaced `gh` authenticates
// via the injected `GH_TOKEN` env var instead, see `github-token.ts`), `Library/Keychains` (see
// the comment on `SECRET_DENY_PATHS` — read access is needed for any Keychain lookup to work at all
// on this OS, including harness login), and `.nvm/versions` (every installed Node version's
// binaries and libs — broader than SERVER_NODE_DIR_L/R in sandbox.ts, which only carves in the one
// version the janissary server itself runs on; a sandboxed process that shells out to a bare
// `node`/`npm`/`npx`, or to a harness installed under a different nvm-managed version, needs to
// read that version's directory too).
export const HOME_READ_CARVEINS = [
  ...HOME_WRITE_CARVEOUTS,
  '.claude/settings.json', '.claude/plugins', '.claude/skills', '.claude/agents', '.claude/commands', '.claude/keybindings.json',
  '.gitconfig', '.gitexcludes', '.config/gh/config.yml', 'Library/Keychains', '.nvm/versions',
];

// Secret paths denied last, even inside a carve-in.
//
// `Library/Keychains` is deliberately NOT here (writes stay denied by the top-level deny-default —
// only reads matter). Even "modern" Keychain Services calls (SecItemCopyMatching) fall through to
// a legacy CDSA/MDS implementation on this OS that reads the keychain DB file directly rather than
// only talking to securityd over IPC; denying that read blocks every keychain lookup a sandboxed
// harness makes, including its own OAuth credential, and it shows up as "not logged in" rather
// than a permission error. The DB stays encrypted and per-item ACL-enforced by securityd regardless
// of raw file readability, so this doesn't hand out plaintext secrets — it's a materially larger
// read surface than the other entries here, but the alternative breaks harness login outright.
//
// `.config/gh/hosts.yml` denies plainly here (EPERM on read) like everything else in this list —
// `gh` reads it on every invocation regardless of `GH_TOKEN`, and its Go config loader treats *any*
// read error there as fatal, EPERM included, so a workspaced `gh` call needs to never attempt that
// read at all rather than have it denied a particular way. `sandbox.ts` handles this by pointing
// `GH_CONFIG_DIR` at an empty, workspace-writable directory whenever a scoped token is injected —
// `gh` then finds a genuinely absent `hosts.yml` there (real ENOENT, no denial involved) and falls
// through to `GH_TOKEN` normally. (Seatbelt does have a `(with errno ...)` deny qualifier, but it
// only takes effect when it's the *sole* matching deny for that operation+path — any other
// unqualified deny or allow rule touching the same path, in either direction, wins over it
// regardless of ordering. That made it too fragile to rely on here, since the same path already
// falls under the broader `$HOME`-wide read deny.)
export const SECRET_DENY_PATHS = [
  // On installs without Keychain access (Linux, some containers) this file holds the harness
  // OAuth token in plaintext. Already outside every carve-in above, but denied explicitly so a
  // future widening of the `.claude/` entries can't silently expose it.
  '.claude/.credentials.json',
  '.ssh', '.aws', '.gnupg', '.kube', '.netrc', '.config/gh/hosts.yml', '.docker',
  '.config/gcloud', '.azure', '.cargo/credentials', '.cargo/credentials.toml',
  '.pypirc', '.m2/settings.xml', '.terraform.d',
  '.bash_history', '.zsh_history', '.python_history', '.node_repl_history',
  'Library/Application Support/Google/Chrome',
  'Library/Application Support/Firefox',
  'Library/Application Support/BraveSoftware',
  'Library/Safari',
];

// Env vars scrubbed from a workspaced process's environment: credential-shaped vars and
// agent-socket / credential-helper escape vectors that bypass the file-read denies above (e.g.
// `SSH_AUTH_SOCK` lets a process use the user's SSH keys without ever reading `~/.ssh`). LLM
// provider keys (`ANTHROPIC_*`, `OPENAI_*`, `GEMINI_*`/`GOOGLE_*`) are deliberately NOT matched —
// the harnesses and the ACP agent need their own credentials to function.
export const ENV_SCRUB_PATTERNS: RegExp[] = [
  /^AWS_/, /^GITHUB_TOKEN$/, /^GH_TOKEN$/, /^NPM_TOKEN$/, /^DOCKER_/, /^KUBECONFIG$/,
  /_SECRET$/, /_PASSWORD$/,
  /^SSH_AUTH_SOCK$/, /^GPG_AGENT_INFO$/, /^GNUPGHOME$/,
  /^GIT_ASKPASS$/, /^GIT_CREDENTIAL_HELPER$/, /^KRB5CCNAME$/,
];

function paramName(prefix: string, index: number): string {
  return `${prefix}${index}`;
}

// Two `-D` param names per table entry, in the same order — `sandbox.ts` pairs these with the
// literal (`~/…`, unresolved beyond `$HOME` itself) and fully realpath-resolved forms of the same
// path. Both are needed: many dotfiles (`.gitconfig`, `.npmrc`, …) are themselves symlinks (e.g.
// managed by a dotfile manager), and Seatbelt evaluates an `lstat`/`readlink` of the symlink node
// against its literal path but a `read`/`open` that follows it against the resolved target —
// carving in only one leaves the other operation denied.
function dualParams(prefix: string, count: number): { literal: string[]; real: string[] } {
  return {
    literal: Array.from({ length: count }, (_, i) => paramName(`${prefix}L`, i)),
    real: Array.from({ length: count }, (_, i) => paramName(`${prefix}R`, i)),
  };
}

export const WRITE_CARVEOUT_PARAMS = dualParams('W', HOME_WRITE_CARVEOUTS.length);
export const READ_CARVEIN_PARAMS = dualParams('R', HOME_READ_CARVEINS.length);
export const SECRET_DENY_PARAMS = dualParams('S', SECRET_DENY_PATHS.length);

const clausesFor = (params: { literal: string[]; real: string[] }) =>
  [...params.literal, ...params.real].map((p) => `  (subpath (param "${p}"))`).join('\n');

const writeCarveClauses = clausesFor(WRITE_CARVEOUT_PARAMS);
const readCarveClauses = clausesFor(READ_CARVEIN_PARAMS);
const secretDenyClauses = clausesFor(SECRET_DENY_PARAMS);

function buildProfile(networkClause: string): string {
  return String.raw`(version 1)
(deny default)
(allow process-fork)
(allow process-exec)
(deny process-exec
  (subpath "/tmp")
  (subpath "/private/tmp"))

; Writes: denied by default (the top-level deny above). Allowed only inside the workspace, its
; private temp dir, /dev/null and tty/pty devices, and the narrow harness-state carve-outs.
; DARWIN_USER_CACHE_DIR (the real per-user /var/folders/<hash>/C/ macOS confstr(3) hands out for
; system caches — NOT its T/ temp sibling, which stays denied) is carved in for writes here even
; though it's outside $HOME entirely: TMPDIR above is overridden to a workspace-local path, but
; frameworks that look this path up directly via confstr bypass that override and write lock/cache
; files into the real one regardless (e.g. Security.framework's legacy MDS subsystem locks
; .../C/mds/mds.lock on every SecItemCopyMatching call — denied, the call silently fails rather
; than erroring, so a sandboxed harness reads back "not logged in" even with a valid Keychain
; item). Reads there already work via the broad file-read* allow below; only writes are
; default-denied. CLAUDE_SCRATCH_DIR (/private/tmp/claude-<uid>/) is the harness CLI's own
; per-user scratch tree, where it creates a per-project/session scratchpad directory before
; running any tool — a fixed path outside $HOME and outside our TMPDIR override, so without this
; carve-in every tool invocation inside a sandboxed harness session fails at that housekeeping
; step, before the tool's own command ever runs.
(allow file-write*
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "DARWIN_USER_CACHE_DIR"))
  (subpath (param "CLAUDE_SCRATCH_DIR"))
${writeCarveClauses})
(allow file-read-data file-write-data
  (literal "/dev/null")
  (regex #"^/dev/tty")
  (regex #"^/dev/pty"))
; Terminal ioctls (raw-mode/echo termios, window size) are a separate Seatbelt operation from
; file-read*/file-write* — without this, a PTY-backed harness tab can't disable canonical mode
; or query window size, so keystrokes and mouse-tracking escapes leak through unparsed instead
; of being consumed by the TUI (e.g. Enter never submits).
(allow file-ioctl
  (literal "/dev/null")
  (regex #"^/dev/tty")
  (regex #"^/dev/pty"))

; Reads: allowed everywhere by default (system paths, harness binaries, /usr, node, homebrew
; all stay readable), then $HOME's *contents* are denied (data/xattr — metadata/stat stays
; allowed everywhere, see below), then the workspace/temp dir/parent-repo-objects/harness-state/
; .gitconfig/.gitexcludes are carved back in, then secrets are denied last (full file-read*,
; including metadata, so their existence isn't observable either) so they lose even inside a
; carve-in.
(allow file-read*)
; Directory metadata (stat/lstat) stays allowed through all of $HOME, not just the carve-ins:
; resolving a path — realpath, a pre-exec chdir, git's ancestor-ownership walk — requires
; traversing every ancestor directory between $HOME and the workspace, and Seatbelt checks each
; component individually rather than just the final target. Only actual file contents (data/xattr)
; are denied outside the carve-ins below; metadata alone doesn't leak file contents.
(allow file-read-metadata (subpath (param "HOME")))
(deny file-read-data file-read-xattr (subpath (param "HOME")))
; A process reading its own executable (and the directory it lives in) is always safe to allow —
; frameworks the process links against may reopen its own binary for introspection (e.g. Keychain's
; SecItemCopyMatching calls CFBundleGetMainBundle, which does exactly this to determine code identity
; for ACL matching). Harness binaries installed under $HOME (nvm, ~/.opencode/bin, …) would otherwise
; fail that self-read and the harness would appear logged out even with a valid Keychain item.
; SERVER_NODE_DIR_L/R (the janissary server's own process.execPath directory) is carved in for the
; same self-read reasoning, and so a script running inside the sandbox can invoke the known-good
; node at JANISSARY_NODE (see sandbox.ts) instead of relying on PATH resolution inside the
; sandboxed process, which doesn't always find a working node first.
; PARENT_PKG_L/R (the parent repo's root package.json, as-named and realpath-resolved) is carved
; in read-only because the workspace nests inside the parent repo: Node module resolution and
; vitest's parent-folder config discovery walk up ancestor directories probing package.json at
; each level, and the $HOME contents deny turns that probe into a hard EPERM crash (metadata/stat
; is allowed, so the walk can see the file exists but dies reading it) instead of a clean miss.
; One manifest file leaks no secrets; the rest of the parent repo stays denied.
(allow file-read-data file-read-xattr
  (literal (param "PARENT_PKG_L"))
  (literal (param "PARENT_PKG_R"))
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "GIT_OBJECTS"))
  (subpath (param "SELF_DIR_L"))
  (subpath (param "SELF_DIR_R"))
  (subpath (param "SERVER_NODE_DIR_L"))
  (subpath (param "SERVER_NODE_DIR_R"))
${readCarveClauses})
(deny file-read*
${secretDenyClauses})

; IPC: mach-lookup is allowed broadly — notably securityd/Keychain, which OAuth-based harness
; auth needs (e.g. Claude Code's own credentials live in the Keychain, not a file) — except no
; controlling other apps and no clipboard reads, denied last so they lose even though the
; broad allow above matches them too.
(deny appleevent-send)
(allow mach-lookup)
(deny mach-lookup (global-name-regex #"^com\.apple\.pboard"))

; Read-only system info (CPU/memory/OS-version queries) — no user data, but JS engines that JIT
; (Bun, which compiles the claude/opencode CLIs) probe these during startup via sysctlbyname and
; hit a hard trap (SIGTRAP) rather than an error if denied, instead of falling back gracefully.
(allow sysctl-read)

; signal has no rule above, so it falls to the top-level default deny — every kill(2) call fails
; EPERM, including a process terminating its own children (e.g. ShellManager killing the
; persistent shell it spawned for a tab, or a package manager killing a build step it started).
; target children allows exactly that self-inflicted case — signaling a descendant of the
; sandboxed process tree — without opening the door to signaling arbitrary other processes on the
; host.
(allow signal (target children))

${networkClause}
`;
}

// Network allowed by default; `--offline` swaps in the deny-network variant.
export const SANDBOX_PROFILE = buildProfile('(allow network*)');
export const SANDBOX_PROFILE_OFFLINE = buildProfile('(deny network*)');
