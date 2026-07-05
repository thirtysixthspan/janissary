// Static Seatbelt (`sandbox-exec`) profile text, built from the table-driven path/env lists in
// sandbox-paths.ts. Dynamic paths (the workspace, its temp dir, `$HOME`, the parent repo's git
// objects dir) are never string-interpolated into the profile — they're substituted at spawn time
// via `-D KEY=value` params (see `sandbox.ts`), so this module has no injection surface and stays
// a plain constant.
//
// Rule ordering follows Seatbelt's "last matching rule wins" semantic: default deny → broad
// read/write allow → `$HOME` read-deny → carve-in allows → secret denies last (so a secret path
// stays denied even inside a carve-in).

import { WRITE_CARVEOUT_PARAMS, READ_CARVEIN_PARAMS, SECRET_DENY_PARAMS, clausesFor } from './sandbox-paths.js';

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
; Plain deny (EPERM), not errno ENOENT: an ENOENT swap here was tried and reverted after it broke
; esbuild's own config resolution (see git history) — esbuild opens ancestor *directories* (not
; just candidate files) while resolving an entry point, e.g. to list $HOME itself while walking up
; from the workspace looking for a tsconfig/package boundary. Metadata says that directory exists
; (allowed above), so telling the content-read ENOENT instead of EPERM makes the directory-open
; lie about its own existence — esbuild's resolver treats "an ancestor directory doesn't exist" as
; fatal for the whole resolution, unlike a merely-missing individual file. EPERM doesn't carry that
; false signal, so directory-listing-based resolvers degrade the way they do outside a sandbox
; (permission error on an ancestor they don't actually need, harmlessly ignored) instead of
; concluding the target itself can't exist. Narrower ENOENT carve-ins for specific *files* that
; upward-walking config discovery (cosmiconfig, Node's package-scope resolution) actually needs are
; still safe — see the package.json carve-in below — since a single missing config file at one
; level is exactly what those walks expect to see constantly, with no directory-existence lie
; involved.
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
(allow file-read-data file-read-xattr
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "GIT_OBJECTS"))
  (subpath (param "SELF_DIR_L"))
  (subpath (param "SELF_DIR_R"))
  (subpath (param "SERVER_NODE_DIR_L"))
  (subpath (param "SERVER_NODE_DIR_R"))
${readCarveClauses})
; Any package.json anywhere under $HOME, at any depth, stays readable. The workspace nests inside
; the parent repo (or repos, however many levels up), and config/module-resolution walks — Node's
; package-scope resolution, cosmiconfig (stylelint, eslint, prettier, postcss all use it) — probe
; upward for package.json indefinitely, not just one level. This is a plain file read (unlike the
; ancestor-directory-listing problem the $HOME-deny comment above describes), so there's no
; directory-existence lie to worry about — granting real read access is both simpler and more
; correct than an ENOENT trick would be, since tools that actually want the content (e.g.
; cosmiconfig checking for a "stylelint" key) get real data instead of a fake absence. One
; manifest per level leaks no secrets; everything else under $HOME stays denied.
(allow file-read-data file-read-xattr
  (require-all (subpath (param "HOME")) (regex #"/package\.json$")))
; errno ENOENT here too (see the $HOME-deny comment above): a secret path reads as genuinely
; absent rather than access-denied, which is both friendlier to tools that treat EPERM as fatal
; and better secrecy — EPERM already confirms the path exists, ENOENT reveals nothing. Unlike the
; $HOME-wide deny, this is safe: secret paths are individual files/dirs a resolver doesn't treat as
; a required ancestor of anything else, so there's no directory-existence lie in play. Uses the
; exact same operation set (file-read-data file-read-xattr) as the $HOME-wide deny above rather
; than the broader file-read* alias — empirically, the errno qualifier only takes effect when a
; later deny's operation set exactly matches an earlier deny matching the same path; file-read*
; here silently lost to the earlier plain file-read-data/file-read-xattr deny and produced EPERM
; instead of ENOENT. Metadata (stat) stays allowed throughout $HOME regardless, same as everywhere
; else — existence was never hidden, only content.
(deny file-read-data file-read-xattr
  (with errno ENOENT)
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
