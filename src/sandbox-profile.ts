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
// sandboxed agent poison packages that other, non-sandboxed processes later consume).
export const HOME_WRITE_CARVEOUTS = [
  '.claude/projects',
  '.claude/session-env',
  '.claude.json',
  '.codex',
  '.config/opencode',
  '.local/share/opencode',
  '.local/state/opencode',
  '.npm/_cacache',
  '.cache/pip',
  '.cache/yarn',
];

// Read carve-ins: the write carve-outs (a harness needs to read its own state), plus a couple of
// read-only extras.
export const HOME_READ_CARVEINS = [...HOME_WRITE_CARVEOUTS, '.gitconfig'];

// Secret paths denied last, even inside a carve-in.
export const SECRET_DENY_PATHS = [
  '.ssh', '.aws', '.gnupg', '.kube', '.netrc', '.config/gh', '.docker',
  '.config/gcloud', '.azure', '.cargo/credentials', '.cargo/credentials.toml',
  '.pypirc', '.m2/settings.xml', '.terraform.d',
  '.bash_history', '.zsh_history', '.python_history', '.node_repl_history',
  'Library/Keychains',
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
(allow file-write*
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
${writeCarveClauses})
(allow file-read-data file-write-data
  (literal "/dev/null")
  (regex #"^/dev/tty")
  (regex #"^/dev/pty"))

; Reads: allowed everywhere by default (system paths, harness binaries, /usr, node, homebrew
; all stay readable), then $HOME is denied, then the workspace/temp dir/parent-repo-objects/
; harness-state/.gitconfig are carved back in, then secrets are denied last so they lose even
; inside a carve-in.
(allow file-read*)
(deny file-read* (subpath (param "HOME")))
(allow file-read*
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "GIT_OBJECTS"))
${readCarveClauses})
(deny file-read*
${secretDenyClauses})

; IPC: no controlling other apps, no clipboard reads. Everything else stays allowed by default —
; notably securityd/Keychain lookups, which OAuth-based harness auth needs.
(deny appleevent-send)
(deny mach-lookup (global-name-regex #"^com\.apple\.pboard"))

${networkClause}
`;
}

// Network allowed by default; `--offline` swaps in the deny-network variant.
export const SANDBOX_PROFILE = buildProfile('(allow network*)');
export const SANDBOX_PROFILE_OFFLINE = buildProfile('(deny network*)');
