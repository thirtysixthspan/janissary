// The Seatbelt profile the e2e browser child runs under — deliberately *not* the harness profile.
// Reusing `SANDBOX_PROFILE` would be actively wrong: its read carve-ins include `Library/Keychains`,
// `.claude`, `.codex`, and opencode's state directory (see `paths.ts`), which is close to an
// inventory of what an escape would want. A browser needs none of it, so this profile carves in
// exactly three paths: the Chromium app bundle it executes, the browser's own scratch workspace, and
// that workspace's temp sibling.
//
// Built the same way `profile.ts` is: a static string with `-D` parameters, never string
// interpolation, so this module has no injection surface and stays a plain constant. Rule ordering
// follows Seatbelt's "last matching rule wins" semantic, same as the harness profile.
//
// The workspace this points at is created empty and is never a git clone (see
// `src/browser/e2e-server.ts`), so a `file://` read that got past the protocol guard lands somewhere
// with nothing worth having. That is the second of the two independent layers; neither is offered
// as sufficient alone.

import { dualParams, clausesFor } from './paths.js';

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
  // The directory of the Node binary running the child, and janissary's own installation root.
  // Both are commonly under `$HOME` (an nvm-managed node, a global npm install, a checkout), so
  // without them the child cannot read its own interpreter or entry point and never starts.
  node: DualPath;
  app: DualPath;
};

// The three read carve-ins, in the fixed order `browserProfileParams` binds them: the Chromium app
// bundle, the Node binary's directory, and janissary's installation root.
export const BROWSER_READ_PARAMS = dualParams('B', 3);

const readCarveClauses = clausesFor(BROWSER_READ_PARAMS);

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

; Writes: denied by default. Allowed only inside the browser's own workspace and its temp sibling —
; which are also its --user-data-dir and downloadsPath, so everything Chromium persists lands there
; — plus DARWIN_USER_CACHE_DIR (the real per-user /var/folders/<hash>/C/ macOS confstr(3) hands out,
; which system frameworks write lock/cache files into regardless of any TMPDIR override) and
; /dev/null.
(allow file-write*
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
  (subpath (param "DARWIN_USER_CACHE_DIR")))
(allow file-read-data file-write-data
  (literal "/dev/null"))

; Reads: allowed everywhere by default (system frameworks, /usr, /System, the dynamic linker cache),
; then $HOME's *contents* are denied, then exactly three paths are carved back in. Metadata (stat)
; stays allowed through all of $HOME for the same reason the harness profile allows it: resolving any
; path requires traversing every ancestor directory, and Seatbelt checks each component individually.
(allow file-read*)
(allow file-read-metadata (subpath (param "HOME")))
(deny file-read-data file-read-xattr (subpath (param "HOME")))
; The three carve-ins are the paths the child cannot start without, all of which commonly sit under
; $HOME. The Chromium app bundle: Playwright keeps its browsers in ~/Library/Caches/ms-playwright/,
; so without it the browser cannot read its own executable, frameworks, or resources — that path
; being unreadable is exactly why a sandboxed agent cannot launch its own browser and needs this
; one. The Node binary's directory: an nvm-managed node lives under $HOME, and a process must be
; able to read its own interpreter. Janissary's installation root: the child is "janus e2e-browser",
; so it reads janissary's own entry point, its node_modules, and its package manifest, and a global
; npm install or a checkout both land under $HOME.
;
; That root is janissary's own code rather than user data. The one overlap worth naming is a
; janissary run straight from a checkout that is *also* the project directory, where the root
; contains .janissary/workspace and therefore the other tabs' clones — the code under test, which
; the agent driving this browser already has, not a secret. Nothing else under $HOME is readable:
; no Keychains, no .claude, no .codex, no opencode state, no .ssh.
(allow file-read-data file-read-xattr
  (subpath (param "WORKSPACE"))
  (subpath (param "TMPDIR"))
${readCarveClauses})

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
  // The order here is the order `BROWSER_READ_PARAMS` names, so a path added to one must be added
  // to the other — the same pairing `homeDParams` relies on for the harness tables.
  const reads = [paths.chromium, paths.node, paths.app];
  return [
    '-D', `WORKSPACE=${paths.workspace}`,
    '-D', `TMPDIR=${paths.tmp}`,
    '-D', `HOME=${paths.home}`,
    '-D', `DARWIN_USER_CACHE_DIR=${paths.cache}`,
    ...reads.flatMap((read, i) => [
      '-D', `${BROWSER_READ_PARAMS.literal[i]}=${read.literal}`,
      '-D', `${BROWSER_READ_PARAMS.real[i]}=${read.real}`,
    ]),
  ];
}
