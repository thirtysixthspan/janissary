import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE } from './profile.js';
import { BROWSER_SANDBOX_PROFILE, browserProfileParams } from './browser-profile.js';
import { playwrightPackagePaths } from '../browser/playwright-paths.js';
import {
  HOME_WRITE_CARVEOUTS, HOME_READ_CARVEINS, SECRET_DENY_PATHS, HOME_READ_LISTING_DIRS, HOME_WRITE_PREFIX_CARVEOUTS,
  WRITE_CARVEOUT_PARAMS, READ_CARVEIN_PARAMS, SECRET_DENY_PARAMS, LISTING_DIR_PARAMS, WRITE_PREFIX_PARAMS,
  ENV_SCRUB_PATTERNS,
} from './paths.js';
import { getConfig } from '../config.js';
import { PROJECT_TOKENS, type ProjectTokens } from '../project-tokens.js';
import { getGitIdentity, gitIdentityEnv } from '../git-identity.js';

export type SandboxOptions = {
  // Undefined for a non-workspaced tab — callers pass it through unconditionally and
  // `sandboxSpawn` returns the input unchanged rather than requiring a branch at every call site.
  workspaceDir?: string;
  offline?: boolean;
  // The actual program that ends up running, when `command` is a shell wrapping it (e.g. PTY
  // callers spawn `bash -lc '<command>'`, so `command` is always `bash` — the shell itself, never
  // the harness binary the profile actually needs to carve in self-read access for). Falls back to
  // `command` when omitted (already the real program — e.g. the ACP agent spawn, which runs the
  // binary directly with no shell wrapper).
  selfBinaryHint?: string;
  // The project's configured credentials (see `project-tokens.ts`), each becoming the environment
  // variable its table row names. Applied for any workspaced spawn — not just a harness tab, since
  // an agent tab's plain shell can invoke the same CLIs — and whether or not this machine can
  // actually confine the process, because a host that cannot confine anything still needs its
  // harness authenticated and its pushes credentialed.
  tokens?: ProjectTokens;
  // Set only for the e2e browser child (`src/browser/e2e-server.ts`): confine it with the minimal
  // browser profile instead of the harness one, carving in the named Chromium app bundle and
  // janissary's own installation root (the child runs `janus e2e-browser`, so it reads janissary's
  // entry point and dependencies). The harness profile's read carve-ins — Keychains, `.claude`,
  // `.codex`, opencode's state directory — are close to an inventory of what an escape would want,
  // and a browser needs none of them.
  browser?: { chromiumDir: string; appDir: string };
};

export type SandboxResult = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

let cachedAvailable: boolean | undefined;

// Whether Seatbelt sandboxing can be applied on this machine: darwin, with `sandbox-exec` on
// `PATH`. Cached after the first check.
export function sandboxAvailable(): boolean {
  cachedAvailable ??= process.platform === 'darwin' && existsSync('/usr/bin/sandbox-exec');
  return cachedAvailable;
}

// A one-line notice to append to a newly created workspaced tab's transcript when its processes
// will NOT actually be confined — either the config toggle is off, or `sandbox-exec` isn't
// available on this machine. Undefined when sandboxing is active, so callers only surface it when
// there's something to say.
export function sandboxNotice(): string | undefined {
  if (!getConfig().sandboxWorkspaces) return 'workspace isolation off: sandboxWorkspaces disabled in config';
  if (!sandboxAvailable()) return 'workspace isolation off: sandbox-exec unavailable';
  return undefined;
}

// Resolve a path through any symlinks (macOS's `/tmp` → `/private/tmp` being the common case) —
// Seatbelt's `subpath` rules match against the resolved path, so an unresolved path silently
// fails to carve in. Falls back to the input path if it doesn't exist (yet).
function resolvePath(p: string): string {
  try { return realpathSync(p); } catch { return p; }
}

// One path in both the forms a Seatbelt carve-in needs — see `dualParams` in paths.ts for why a
// rule that names only one of them leaves the other operation denied.
function dualPath(p: string): { literal: string; real: string } {
  return { literal: p, real: resolvePath(p) };
}

let cachedDarwinUserCacheDir: string | undefined;

// The real per-user `/var/folders/<xx>/<hash>/C/` cache directory macOS's `confstr(3)` hands out —
// NOT the same as `$TMPDIR`, which `sandboxSpawn` overrides to a workspace-local path below, and
// NOT its `.../T/` (temp) sibling, which stays denied (that's where `os.tmpdir()`-based scratch
// dirs land — carving it in too would let a sandboxed process write anywhere a plain `mktemp`
// call resolves to, defeating the outside-the-workspace write deny). System frameworks look the
// cache path up directly via `confstr`, bypassing our `TMPDIR` override entirely, and write
// lock/cache files into it regardless (e.g. Security.framework's legacy MDS subsystem locks
// `.../C/mds/mds.lock` on every `SecItemCopyMatching` call — denied, the call silently fails
// rather than erroring, so a sandboxed harness reads back "not logged in" even with a valid
// Keychain item). Cached: it's fixed for the life of the host process.
function darwinUserCacheDir(): string {
  if (cachedDarwinUserCacheDir) return cachedDarwinUserCacheDir;
  try {
    const cacheDir = execFileSync('getconf', ['DARWIN_USER_CACHE_DIR']).toString().trim();
    cachedDarwinUserCacheDir = resolvePath(cacheDir);
  } catch {
    cachedDarwinUserCacheDir = '/nonexistent-janissary-darwin-user-cache-dir-placeholder';
  }
  return cachedDarwinUserCacheDir;
}

let cachedClaudeScratchDir: string | undefined;

// The harness CLI's own per-user scratch tree, `/private/tmp/claude-<uid>/`, under which it creates
// a per-project/session scratchpad directory before running any tool — including a plain shell
// command. This is a fixed, UID-keyed path entirely outside `$HOME`, our workspace-local `TMPDIR`
// override, and the Darwin user cache dir above, so without carving it in, every tool invocation
// inside a sandboxed harness session fails at that housekeeping step, before the tool's own command
// ever runs. Cached: the UID is fixed for the life of the host process.
function claudeScratchDir(): string {
  if (cachedClaudeScratchDir) return cachedClaudeScratchDir;
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  cachedClaudeScratchDir = resolvePath(`/private/tmp/claude-${uid}`);
  return cachedClaudeScratchDir;
}

// Walk up from a resolved executable's path to the nearest ancestor directory literally named
// `node_modules`, if any. A globally-installed npm package (`npm` itself included) is laid out as
// `.../node_modules/<pkg>/bin/<script>`, where the script requires sibling files from `<pkg>/lib/`
// and beyond — carving in only the immediate `bin/` directory (as for a single bundled binary like
// claude.exe) leaves those sibling requires denied. Carving in the whole `node_modules/` directory
// instead covers every globally-installed package uniformly (not just the one being run), which is
// harmless — it's still just $HOME-scoped code, not secrets. Falls back to the script's own
// directory when there's no `node_modules` ancestor (a single-file bundled binary).
function packageRootDir(resolvedBin: string): string {
  let dir = path.dirname(resolvedBin);
  for (;;) {
    if (path.basename(dir) === 'node_modules') return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.dirname(resolvedBin);
    dir = parent;
  }
}

// Resolve `command` to an absolute path the way `execvp`/`posix_spawn` would (a `PATH` search for a
// bare name, or the path itself if it already contains a separator) so its containing directory can
// be carved into the read allow-list. Without this, a harness binary installed under `$HOME` (e.g.
// via nvm, or `~/.opencode/bin`) can't read its own executable — which some system frameworks need
// to do internally (Keychain's `SecItemCopyMatching` calls `CFBundleGetMainBundle`, which reopens the
// calling process's own binary and its directory to determine code identity for ACL matching; denied,
// the harness looks logged out even though its Keychain item is intact). Returns both the literal
// (unresolved — e.g. many npm-global installs are a `bin/foo` symlink into `lib/node_modules/...`)
// and fully realpath-resolved directory (widened to the enclosing `node_modules/` via
// `packageRootDir` above, for packages — like npm — that are more than a single bundled file), same
// dual reasoning as `dualParams` in paths.ts: a framework may `opendir`/`lstat` the
// symlink's own directory as well as the resolved target's. Falls back to a path that matches
// nothing so the profile's params always have a bound value.
function resolveExecutableDirs(command: string): { literal: string; real: string } {
  const fallback = '/nonexistent-janissary-self-bin-placeholder';
  const literalBin = command.includes('/')
    ? (existsSync(command) ? command : undefined)
    : (process.env.PATH ?? '').split(':').filter(Boolean)
      .map((dir) => path.join(dir, command))
      .find((candidate) => existsSync(candidate));
  if (!literalBin) return { literal: fallback, real: fallback };
  return { literal: path.dirname(literalBin), real: packageRootDir(resolvePath(literalBin)) };
}

// The directory of the Node binary currently running the janissary server itself
// (`process.execPath`), in both literal and realpath-resolved form (same dual reasoning as
// `resolveExecutableDirs` above — an nvm-managed `node` is commonly a symlink). Carved into the
// read allow-list so a script running inside the sandbox (e.g. a project's own `.claude/settings.json`
// hook) can reliably invoke a known-good `node` via the `JANISSARY_NODE` env var below, instead of
// hoping a bare `node` on the sandboxed process's PATH resolves to a working binary — PATH
// resolution order inside a spawned/hook context doesn't always match the server's own.
function serverNodeDirs(): { literal: string; real: string } {
  const execPath = process.execPath;
  return { literal: path.dirname(execPath), real: path.dirname(resolvePath(execPath)) };
}

// The workspace clone's own git objects directory. Falls back to a parent repo's real objects
// directory via a `--shared` alternates file, if one is present (older, locally-shared clones) —
// today's independent clones of `origin` have no alternates file, so this always hits the fallback.
function parentGitObjectsDir(workspaceDir: string): string {
  const fallback = path.join(workspaceDir, '.git', 'objects');
  try {
    const alternatesPath = path.join(workspaceDir, '.git', 'objects', 'info', 'alternates');
    const target = readFileSync(alternatesPath, 'utf8').trim().split('\n', 1)[0];
    return target ? resolvePath(target) : fallback;
  } catch {
    return fallback;
  }
}

// Drop credential-shaped vars and agent-socket escape vectors (see `ENV_SCRUB_PATTERNS` in paths.ts).
function scrubEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (ENV_SCRUB_PATTERNS.some((pattern) => pattern.test(key))) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}

// `-D <param>=<path>` for each home-relative table entry, in both its literal (`~/…`, as named —
// covers an `lstat`/`readlink` of a symlinked dotfile) and fully realpath-resolved (covers a
// `read`/`open` that follows the symlink) forms. See the comment on `dualParams` in
// paths.ts for why both are needed.
function homeDParams(home: string, relPaths: string[], params: { literal: string[]; real: string[] }): string[] {
  const args: string[] = [];
  for (const [i, rel] of relPaths.entries()) {
    const literalPath = path.join(home, rel);
    args.push('-D', `${params.literal[i]}=${literalPath}`, '-D', `${params.real[i]}=${resolvePath(literalPath)}`);
  }
  return args;
}

// Every credential this spawn is deliberately handed: each configured token under every variable its
// row in `PROJECT_TOKENS` names. Most rows name one; the gemini row names two, because opencode
// detects its Google provider from one variable and loads the key from another. `GH_TOKEN` is the
// one deliberate exception to "a scrubbed env var never comes back" — it isn't the ambient value
// `scrubEnv` just stripped, it's a fresh one chosen for this spawn. The provider keys are not on
// `ENV_SCRUB_PATTERNS` at all (the scrub deliberately exempts LLM provider credentials, see
// paths.ts), so an ambient value survives and a configured token simply takes precedence over it
// here.
//
// `GH_CONFIG_DIR` stays a guarded line rather than a fifth entry in the GitHub row's list, because
// the list is the same credential under other names and this carries a path instead. It points at an
// empty, workspace-private directory because `gh` reads `~/.config/gh/hosts.yml` on every invocation
// regardless of `GH_TOKEN`, and its config loader treats the sandbox's EPERM deny on that file (see
// SECRET_DENY_PATHS) as fatal, refusing to run at all; a genuinely absent hosts.yml (real ENOENT) it
// handles by falling through to `GH_TOKEN` normally. Where the sandbox is inactive there is no deny
// to work around, but the redirect still keeps that machine's own ambient `gh` login out of the
// workspace, which is the same guarantee an isolated tab gets.
function workspaceCredentialEnv(tmpDir: string, tokens: ProjectTokens): NodeJS.ProcessEnv {
  const credentials: NodeJS.ProcessEnv = {};
  for (const { name, env } of PROJECT_TOKENS) {
    const value = tokens[name];
    if (!value) continue;
    for (const variable of env) credentials[variable] = value;
  }
  if (tokens.github) credentials.GH_CONFIG_DIR = path.join(tmpDir, 'gh-config');
  return credentials;
}

// Everything a workspaced spawn's environment gains regardless of whether this machine can confine
// it: the project's credentials, plus the four variables carrying the git identity of the user who
// opened janissary (see `git-identity.ts`). The identity is read from the module cache rather than
// threaded through `SandboxOptions` the way the tokens are, because unlike a token — which the
// remote side merges per provision — it is a single process-wide fact on either machine.
function workspaceEnv(tmpDir: string, tokens: ProjectTokens): NodeJS.ProcessEnv {
  return { ...gitIdentityEnv(getGitIdentity()), ...workspaceCredentialEnv(tmpDir, tokens) };
}

// Handing a workspaced tab its scoped credentials is a provisioning concern, not an isolation one:
// the clone's `origin` is HTTPS and its `credential.helper` is `!gh auth git-credential` on every
// host (see src/workspace/index.ts), so `git push` and `gh` need `GH_TOKEN` whether or not Seatbelt
// is confining the process, and a harness needs its own token on exactly the same terms. This is the
// unconfined path's share of that — a non-darwin remote, or a host with `sandboxWorkspaces` off,
// would otherwise get a workspace it cannot push from, authenticate a harness in, or attribute a
// commit from. Without a token and without an identity, or outside a workspace, the caller's own
// environment object is returned untouched.
function withWorkspaceCredentials(env: NodeJS.ProcessEnv, options: SandboxOptions): NodeJS.ProcessEnv {
  if (!options.workspaceDir) return env;
  const tmpDir = resolvePath(`${options.workspaceDir}.tmp`);
  const added = workspaceEnv(tmpDir, options.tokens ?? {});
  return Object.keys(added).length === 0 ? env : { ...env, ...added };
}

// Wrap a spawn invocation (`command` + `args` — the same shape `child_process.spawn`/node-pty's
// `spawn` take) for a workspaced tab. Returns the command and args unchanged when there's nothing
// to sandbox: no `workspaceDir`, the `sandboxWorkspaces` config toggle is off, or `sandbox-exec`
// isn't available (e.g. non-darwin) — the environment still picks up the workspace's credentials
// in that case, which is not a sandbox concern (see `withWorkspaceCredentials`). Otherwise
// returns `sandbox-exec -p <profile> -D … -- <command> <args>` plus a credential-scrubbed
// environment with `TMPDIR` set to the workspace's private temp dir.
export function sandboxSpawn(
  options: SandboxOptions,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SandboxResult {
  if (!options.workspaceDir || !getConfig().sandboxWorkspaces || !sandboxAvailable()) {
    return { command, args, env: withWorkspaceCredentials(env, options) };
  }

  const workspaceDir = resolvePath(options.workspaceDir);
  const tmpDir = resolvePath(`${options.workspaceDir}.tmp`);
  const home = resolvePath(homedir());
  const darwinCacheDir = darwinUserCacheDir();
  const scrubbed = scrubEnv(env);
  scrubbed.TMPDIR = tmpDir;

  // The browser child gets its own profile and its own short parameter list, and none of the
  // credential injection below: it authenticates to nothing and pushes nowhere.
  if (options.browser) {
    const params = browserProfileParams({
      workspace: workspaceDir, tmp: tmpDir, home, cache: darwinCacheDir,
      chromium: dualPath(options.browser.chromiumDir),
      node: dualPath(path.dirname(process.execPath)),
      app: dualPath(options.browser.appDir),
    });
    return { command: 'sandbox-exec', args: ['-p', BROWSER_SANDBOX_PROFILE, ...params, '--', command, ...args], env: scrubbed };
  }

  const gitObjects = parentGitObjectsDir(options.workspaceDir);
  const selfDirs = resolveExecutableDirs(options.selfBinaryHint ?? command);
  const scratchDir = claudeScratchDir();
  const serverNodeDir = serverNodeDirs();
  const playwright = playwrightPackagePaths();

  scrubbed.JANISSARY_NODE = process.execPath;
  Object.assign(scrubbed, workspaceEnv(tmpDir, options.tokens ?? {}));

  const profile = options.offline ? SANDBOX_PROFILE_OFFLINE : SANDBOX_PROFILE;
  const dParams = [
    '-D', `WORKSPACE=${workspaceDir}`,
    '-D', `TMPDIR=${tmpDir}`,
    '-D', `HOME=${home}`,
    '-D', `GIT_OBJECTS=${gitObjects}`,
    '-D', `SELF_DIR_L=${selfDirs.literal}`,
    '-D', `SELF_DIR_R=${selfDirs.real}`,
    '-D', `DARWIN_USER_CACHE_DIR=${darwinCacheDir}`,
    '-D', `CLAUDE_SCRATCH_DIR=${scratchDir}`,
    '-D', `SERVER_NODE_DIR_L=${serverNodeDir.literal}`,
    '-D', `SERVER_NODE_DIR_R=${serverNodeDir.real}`,
    '-D', `PLAYWRIGHT_DIR=${playwright.dirs[0]}`,
    '-D', `PLAYWRIGHT_CORE_DIR=${playwright.dirs[1]}`,
    ...homeDParams(home, HOME_WRITE_CARVEOUTS, WRITE_CARVEOUT_PARAMS),
    ...homeDParams(home, HOME_READ_CARVEINS, READ_CARVEIN_PARAMS),
    ...homeDParams(home, SECRET_DENY_PATHS, SECRET_DENY_PARAMS),
    ...homeDParams(home, HOME_READ_LISTING_DIRS, LISTING_DIR_PARAMS),
    ...homeDParams(home, HOME_WRITE_PREFIX_CARVEOUTS, WRITE_PREFIX_PARAMS),
  ];

  return {
    command: 'sandbox-exec',
    args: ['-p', profile, ...dParams, '--', command, ...args],
    env: scrubbed,
  };
}
