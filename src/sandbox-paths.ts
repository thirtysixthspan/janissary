// Table-driven path/env lists the Seatbelt profile in sandbox-profile.ts is built from.
// Extending any restriction is a one-line table change here.

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
// on this OS, including harness login), `.nvm` (nvm's own `nvm.sh`/`bash_completion` loader
// scripts plus every installed Node version's binaries and libs under `versions/` — broader than
// SERVER_NODE_DIR_L/R in sandbox.ts, which only carves in the one version the janissary server
// itself runs on; a sandboxed process that sources `nvm.sh` or shells out to a bare `node`/`npm`/
// `npx`, or to a harness installed under a different nvm-managed version, needs to read the whole
// tree. Execute access for these binaries doesn't need a separate carve-in — `process-exec` is
// allowed everywhere except `/tmp`/`/private/tmp`, so this read carve-in is the only gap), `.rvm`
// (same reasoning as `.nvm`, for Ruby: `rvm`'s own loader script plus every installed Ruby
// version's binaries and gems under `rubies/`/`gems/`), and `.bash_profile`/`.bashrc` (a
// login/interactive bash shell sources these on startup; without the carve-in, spawning
// `bash -lc` inside the sandbox fails that read silently and the shell starts with none of the
// user's aliases/functions/PATH additions).
export const HOME_READ_CARVEINS = [
  ...HOME_WRITE_CARVEOUTS,
  '.claude/settings.json', '.claude/plugins', '.claude/skills', '.claude/agents', '.claude/commands', '.claude/keybindings.json',
  '.gitconfig', '.gitexcludes', '.config/gh/config.yml', 'Library/Keychains', '.nvm', '.rvm',
  '.bash_profile', '.bashrc',
];

// Directories where `opendir`/`readdir` must work even though most of their *contents* aren't
// separately carved in. `.claude` itself: a settings read-modify-write (e.g. `claude --effort`, or
// any tool following this project's own "read raw settings before writing" convention) opens the
// directory node itself to enumerate settings files before touching `settings.json` — a plain
// `subpath` carve-in of the file alone only covers `open()`ing that one path, not the parent
// directory's `file-read-data` (Seatbelt's listing operation, distinct from the `file-read-metadata`
// stat access already allowed HOME-wide — see the deny-then-carve-in comment in sandbox-profile.ts).
// These use `literal`, not `subpath`: the directory node itself becomes listable, but files inside
// it stay gated by the specific carve-ins in HOME_READ_CARVEINS above (or stay denied).
export const HOME_READ_LISTING_DIRS = ['.claude'];

// Write carve-outs matched by Seatbelt `prefix` (string prefix on the full path) rather than
// `subpath` (path-component match) or `literal` (exact match). `.claude/settings.json` itself is
// deliberately absent from HOME_WRITE_CARVEOUTS above — but a settings read-modify-write (e.g.
// `claude --effort`) writes it via an atomic-rename pattern: create a sibling temp file
// (`settings.json.tmp.<pid>.<random>`, a fresh, unpredictable name every write), fsync it, then
// rename it over the target. `subpath`/`literal` can't carve in a name that doesn't exist yet and
// varies per write; `prefix` matches both the base filename and every `<base>.tmp.*` sibling
// because the base string is a literal character-prefix of each. Narrower than carving in the
// whole `.claude` directory for writes (still deliberately avoided, per the comment on
// HOME_WRITE_CARVEOUTS above) — this only ever matches paths starting with the exact
// `settings.json` string.
//
// `Library/Keychains/login.keychain-db` is here for the same atomic-write reason, and is the fix
// for a specific failure mode: OAuth-based harness auth (e.g. Claude Code) reads its credential
// from the login Keychain fine — reads are carved in via HOME_READ_CARVEINS — but when the access
// token expires mid-session, persisting the *refreshed* token back is a Keychain write, which hit
// the top-level deny-default and silently failed, so the stale expired token kept being sent and
// the provider returned 401 invalid-credentials. The write lands as an atomic-rename temp sibling
// `login.keychain-db.sb-<random>` (confirmed in the Sandbox deny log: `file-write-create
// .../login.keychain-db.sb-151e5e06-tFbiQ8`), so a `subpath`/`literal` carve-in of the base name
// can't cover it — `prefix` does, and also naturally covers the DB's SQLite sidecars
// (`login.keychain-db-wal`/`-shm`/`-journal`), all of which share the base as a character-prefix.
// Deliberately the login keychain DB only, not the whole `~/Library/Keychains` subtree: the DB
// stays encrypted and per-item ACL-enforced by securityd regardless of raw file writability (same
// argument the read carve-in rests on — see SECRET_DENY_PATHS), and the narrow prefix keeps a
// sandboxed process from tampering with unrelated keychain files. If a data-protection keychain
// (`<UUID>/keychain-2.db`) is ever in play, its own write deny will surface separately in the log.
export const HOME_WRITE_PREFIX_CARVEOUTS = ['.claude/settings.json', 'Library/Keychains/login.keychain-db'];

// Secret paths denied last, even inside a carve-in.
//
// `Library/Keychains` is deliberately NOT here: reads are carved in (HOME_READ_CARVEINS) and one
// narrow write is carved in (HOME_WRITE_PREFIX_CARVEOUTS covers `login.keychain-db` and its
// atomic-write/SQLite siblings, so a harness can persist a refreshed OAuth token — see that
// comment); every other write under the subtree stays denied by the top-level deny-default. Even
// "modern" Keychain Services calls (SecItemCopyMatching) fall through to
// a legacy CDSA/MDS implementation on this OS that reads the keychain DB file directly rather than
// only talking to securityd over IPC; denying that read blocks every keychain lookup a sandboxed
// harness makes, including its own OAuth credential, and it shows up as "not logged in" rather
// than a permission error. The DB stays encrypted and per-item ACL-enforced by securityd regardless
// of raw file readability, so this doesn't hand out plaintext secrets — it's a materially larger
// read surface than the other entries here, but the alternative breaks harness login outright.
//
// `.config/gh/hosts.yml`'s deny below now reads as ENOENT too (see the errno qualifier on the
// final deny rule in buildProfile), which is exactly what `gh` needs — but `sandbox.ts` still
// separately points `GH_CONFIG_DIR` at an empty, workspace-writable directory whenever a scoped
// token is injected, so `gh` finds a real, uncomplicated absent `hosts.yml` there rather than
// depending on this deny rule's errno behavior. Kept as defense in depth: `gh`'s Go config loader
// treats any read error there as fatal, so relying on a single mechanism to keep that read from
// ever mattering felt worth avoiding.
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
export function dualParams(prefix: string, count: number): { literal: string[]; real: string[] } {
  return {
    literal: Array.from({ length: count }, (_, i) => paramName(`${prefix}L`, i)),
    real: Array.from({ length: count }, (_, i) => paramName(`${prefix}R`, i)),
  };
}

export const WRITE_CARVEOUT_PARAMS = dualParams('W', HOME_WRITE_CARVEOUTS.length);
export const READ_CARVEIN_PARAMS = dualParams('R', HOME_READ_CARVEINS.length);
export const SECRET_DENY_PARAMS = dualParams('S', SECRET_DENY_PATHS.length);
export const LISTING_DIR_PARAMS = dualParams('D', HOME_READ_LISTING_DIRS.length);
export const WRITE_PREFIX_PARAMS = dualParams('P', HOME_WRITE_PREFIX_CARVEOUTS.length);

export const clausesFor = (params: { literal: string[]; real: string[] }): string =>
  [...params.literal, ...params.real].map((p) => `  (subpath (param "${p}"))`).join('\n');

// Same shape as `clausesFor`, but matches only the exact path (Seatbelt `literal`) — used for
// HOME_READ_LISTING_DIRS, where a directory node must be listable without granting recursive
// access to everything under it (that's what `subpath` would do).
export const literalClausesFor = (params: { literal: string[]; real: string[] }): string =>
  [...params.literal, ...params.real].map((p) => `  (literal (param "${p}"))`).join('\n');

// Same shape again, but Seatbelt `prefix` (string-prefix match) — used for
// HOME_WRITE_PREFIX_CARVEOUTS, where the writable path's exact name isn't known ahead of time
// (a randomly-named atomic-write temp sibling of a fixed base filename).
export const prefixClausesFor = (params: { literal: string[]; real: string[] }): string =>
  [...params.literal, ...params.real].map((p) => `  (prefix (param "${p}"))`).join('\n');
