// The Seatbelt profile the e2e browser child runs under — deliberately *not* the harness profile.
// Reusing `SANDBOX_PROFILE` would be actively wrong: its read carve-ins include `Library/Keychains`,
// `.claude`, `.codex`, and opencode's state directory (see `paths.ts`), which is close to an
// inventory of what an escape would want. A browser needs none of it, so this profile names only
// what the child cannot start without. For reads that is the six subpaths bound through
// `BROWSER_READ_PARAMS` — the Chromium app bundle it executes, the Node binary's directory, and
// janissary's runtime as four separate pieces — plus the two exact files in `BROWSER_FILE_PARAMS`,
// with the project's own state directory denied back out inside them through `BROWSER_DENY_PARAMS`.
// For writes it is the browser's own scratch workspace and that workspace's temp sibling. Those
// three tables are the inventory; a count written here would be wrong the next time one of them
// gains an entry, which is how the sentence this replaced came to say three.
//
// Built the same way `profile.ts` is: a static string with `-D` parameters, never string
// interpolation, so this module has no injection surface and stays a plain constant. Rule ordering
// follows Seatbelt's "last matching rule wins" semantic, same as the harness profile.
//
// The workspace this points at is created empty and is never a git clone (see
// `src/browser/e2e-server.ts`), so a `file://` read that got past the protocol guard lands somewhere
// with nothing worth having. That is the second of the two independent layers; neither is offered
// as sufficient alone.

import { dualParams, clausesFor, literalClausesFor } from './paths.js';

// One carve-in path in both its literal (as named) and fully realpath-resolved form. Both are
// needed for the same reason `dualParams` in `paths.ts` explains: Seatbelt evaluates an
// `lstat`/`readlink` against the symlink's own path but a `read` that follows it against the target.
export type DualPath = { literal: string; real: string };

export type BrowserProfilePaths = {
  // The browser's own scratch workspace and its `.tmp` sibling — where Playwright's profile
  // directory and Chromium's downloads land, so everything the browser writes stays inside them.
  workspace: string;
  tmp: string;
  home: string;
  cache: string;
  // The Chromium app bundle the child executes.
  chromium: DualPath;
  // The directory of the Node binary running the child. Commonly under `$HOME` (an nvm-managed
  // node), and a process must be able to read its own interpreter.
  node: DualPath;
  // Janissary's runtime, named piece by piece rather than by its installation root. In a
  // development install that root *is* the project directory, so carving it in recursively also
  // carves in `.janissary` — the project's tokens, the server log holding the live session token,
  // and every other tab's workspace clone.
  appModules: DualPath;
  // The tree the entry actually lives in: `src/` under tsx, `dist/` under a build. Whichever one
  // this process is running (see `e2e-child-command.ts`), never both.
  appEntry: DualPath;
  // Resolved separately because a hoisted layout puts them beside the installation rather than
  // inside its `node_modules`, where `appModules` would not reach them.
  playwright: DualPath;
  playwrightCore: DualPath;
  // The two root files Node and tsx read: the manifest for its `type` field, and the tsconfig for
  // compiler options. Carved in as exact paths, not subpaths — they are files, and the directory
  // holding them is the one being narrowed away.
  appManifest: DualPath;
  appTsconfig: DualPath;
  // `<root>/.janissary`, denied rather than allowed. Not redundant with the `$HOME` deny: reads
  // outside `$HOME` are never denied by this profile at all, so an installation at `/opt/janissary`
  // or on a remote host outside the home directory would otherwise expose all of it.
  appState: DualPath;
};

// The six subpath read carve-ins, in the fixed order `browserProfileParams` binds them: the Chromium
// app bundle, the Node binary's directory, janissary's dependencies, the code tree being run, and
// the two Playwright packages.
export const BROWSER_READ_PARAMS = dualParams('B', 6);

// The exact-path read carve-ins: the manifest and the tsconfig.
export const BROWSER_FILE_PARAMS = dualParams('F', 2);

// The one subpath denied back out after the carve-ins: the project's own state directory.
export const BROWSER_DENY_PARAMS = dualParams('X', 1);

const readCarveClauses = clausesFor(BROWSER_READ_PARAMS);
const fileCarveClauses = literalClausesFor(BROWSER_FILE_PARAMS);
const stateDenyClauses = clausesFor(BROWSER_DENY_PARAMS);

// Chromium refuses to initialize its own Seatbelt sandbox inside an outer one — macOS does not
// support nested `sandbox-exec` initialization — so a confined Chromium must run with its internal
// sandbox off. That costs nothing that was not already given up: Playwright's `chromiumSandbox`
// option defaults to false and `launchTabBrowser` does not set it, so every Chromium janissary
// launches today already runs with its own sandbox disabled and nothing else around it. Adding this
// outer profile is a strict improvement over that status quo, not a trade.
export const BROWSER_SANDBOX_PROFILE = String.raw`(version 1)
(deny default)
(allow process-fork)
(allow process-exec)

; Writes: denied by default. Allowed only inside the browser's own workspace and its temp sibling,
; which together hold everything Chromium persists: downloads are pointed at the workspace
; explicitly, and Playwright's own profile directory lands in the temp sibling because the caller
; points TMPDIR there. The user data directory is not passed as an argument at all — Playwright owns
; that flag and rejects an invocation supplying its own (see src/browser/e2e-child.ts).
; Also allowed: DARWIN_USER_CACHE_DIR (the real per-user /var/folders/<hash>/C/ macOS confstr(3) hands out,
; which system frameworks write lock/cache files into regardless of any TMPDIR override) and
; /dev/null.
(allow file-write*
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "DARWIN_USER_CACHE_DIR")))
(allow file-read-data file-write-data
  (literal "/dev/null"))

; Reads: allowed everywhere by default (system frameworks, /usr, /System, the dynamic linker cache),
; then $HOME's *contents* are denied, then the six subpaths and two exact files the tables above name
; are carved back in, and the project's state directory is denied inside them. Metadata (stat)
; stays allowed through all of $HOME for the same reason the harness profile allows it: resolving any
; path requires traversing every ancestor directory, and Seatbelt checks each component individually.
(allow file-read*)
(allow file-read-metadata (subpath (param "HOME")))
(deny file-read-data file-read-xattr (subpath (param "HOME")))
; The carve-ins are the paths the child cannot start without, most of which commonly sit under $HOME.
; The Chromium app bundle: Playwright keeps its browsers in ~/Library/Caches/ms-playwright/, so
; without it the browser cannot read its own executable, frameworks, or resources — that path being
; unreadable is exactly why a sandboxed agent cannot launch its own browser and needs this one. The
; Node binary's directory: an nvm-managed node lives under $HOME, and a process must be able to read
; its own interpreter. Then janissary's runtime, named piece by piece rather than by its installation
; root: the dependencies, the code tree actually being run (src/ under tsx, dist/ under a build), the
; two Playwright packages (resolved separately, since a hoisted layout puts them beside the
; installation rather than inside its node_modules), and the manifest and tsconfig as exact files.
;
; Piece by piece and not the root, because in a development install that root IS the project
; directory. Nothing else under $HOME is readable either: no Keychains, no .claude, no .codex, no
; opencode state, no .ssh.
(allow file-read-data file-read-xattr
${readCarveClauses}
${fileCarveClauses})

; Then the project's own state directory is denied back out, inside everything above. It holds the
; configured provider tokens (src/project-tokens.ts), the server log carrying the live URL and
; session token (bin/janus.mjs), and every other tab's workspace clone — none of which is
; application code, whatever the directory it sits in contains.
;
; This is a deny and not merely an absent carve-in because reads *outside* $HOME are never denied by
; this profile: an installation at /opt/janissary, or anywhere on a remote host outside the home
; directory, is covered by the broad allow at the top and by no carve-in at all.
(deny file-read-data file-read-xattr
${stateDenyClauses})

; Last, and so winning over the deny above: this browser's own scratch directory and its temp
; sibling. In a development install they live *inside* the directory just denied
; (.janissary/workspace/browsers/…), which is why they are allowed here rather than with the
; carve-ins. Narrower than the rule before it, like every step in this section.
(allow file-read-data file-read-xattr
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR")))

; IPC: Chromium looks up a number of system services by name during startup (the window server, the
; font and locale daemons, the sandbox and launch services) and fails hard rather than gracefully
; when they are unreachable. Controlling other apps and reading the clipboard are denied last so
; they lose even though the broad allow above matches them.
(deny appleevent-send)
(allow mach-lookup)
(deny mach-lookup (global-name-regex #"^com\.apple\.pboard"))

; POSIX shared memory: Chromium's multi-process architecture moves rendered frames and IPC buffers
; between its browser, renderer, and GPU processes through shm segments, and it aborts at startup
; rather than degrading if it cannot create them.
(allow ipc-posix-shm)

; IOKit: even headless, Chromium probes the graphics and power stacks while bringing up its GPU
; process. Read-only property access, not device control.
(allow iokit-open)
(allow iokit-get-properties)

; Read-only system info (CPU count, memory, OS version), which V8 and Chromium's own thread pool
; size themselves from during startup.
(allow sysctl-read)

; Chromium's helper processes are children of the process this profile wraps, so the browser must be
; able to signal its own process tree to shut down. "target children" allows exactly that, without
; opening the door to signaling anything else on the host.
(allow signal (target children))

; The browser has to reach the pages it is asked to test, including the AI's own server on
; 127.0.0.1, so the network is open. What it may navigate to is enforced at the protocol guard
; (src/browser/e2e-guard.ts), not here.
(allow network*)
`;

// The `-D` parameter list this profile is substituted with at spawn time — deliberately its own
// short list rather than the harness spawn's, since the harness list binds paths this profile does
// not name and must not learn about.
export function browserProfileParams(paths: BrowserProfilePaths): string[] {
  // Each list is in the order its param table names, so a path added to one must be added to the
  // other — the same pairing `homeDParams` relies on for the harness tables.
  const reads = [
    paths.chromium, paths.node, paths.appModules, paths.appEntry, paths.playwright, paths.playwrightCore,
  ];
  const files = [paths.appManifest, paths.appTsconfig];
  const denies = [paths.appState];
  return [
    '-D', `WORKSPACE=${paths.workspace}`,
    '-D', `TMPDIR=${paths.tmp}`,
    '-D', `HOME=${paths.home}`,
    '-D', `DARWIN_USER_CACHE_DIR=${paths.cache}`,
    ...dualBindings(reads, BROWSER_READ_PARAMS),
    ...dualBindings(files, BROWSER_FILE_PARAMS),
    ...dualBindings(denies, BROWSER_DENY_PARAMS),
  ];
}

function dualBindings(paths: DualPath[], params: { literal: string[]; real: string[] }): string[] {
  return paths.flatMap((entry, i) => [
    '-D', `${params.literal[i]}=${entry.literal}`,
    '-D', `${params.real[i]}=${entry.real}`,
  ]);
}
