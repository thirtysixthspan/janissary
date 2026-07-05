import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE,
  HOME_WRITE_CARVEOUTS, HOME_READ_CARVEINS, SECRET_DENY_PATHS,
  WRITE_CARVEOUT_PARAMS, READ_CARVEIN_PARAMS, SECRET_DENY_PARAMS,
  ENV_SCRUB_PATTERNS,
} from './sandbox-profile.js';
import { getConfig } from './config.js';

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
  // A scoped GitHub token to inject as `GH_TOKEN` for this spawn (see the injection site below) —
  // the one deliberate exception to "a scrubbed env var never comes back": it isn't the ambient
  // value `scrubEnv` just stripped, it's a fresh one we chose to hand this specific workspaced spawn.
  githubToken?: string;
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
// dual reasoning as `dualParams` in sandbox-profile.ts: a framework may `opendir`/`lstat` the
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

// Drop credential-shaped vars and agent-socket escape vectors (see `sandbox-profile.ts`).
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
// sandbox-profile.ts for why both are needed.
function homeDParams(home: string, relPaths: string[], params: { literal: string[]; real: string[] }): string[] {
  const args: string[] = [];
  for (const [i, rel] of relPaths.entries()) {
    const literalPath = path.join(home, rel);
    args.push('-D', `${params.literal[i]}=${literalPath}`, '-D', `${params.real[i]}=${resolvePath(literalPath)}`);
  }
  return args;
}

// Wrap a spawn invocation (`command` + `args` — the same shape `child_process.spawn`/node-pty's
// `spawn` take) for a workspaced tab. Returns the input unchanged when there's nothing to
// sandbox: no `workspaceDir`, the `sandboxWorkspaces` config toggle is off, or `sandbox-exec`
// isn't available (e.g. non-darwin). Otherwise returns `sandbox-exec -p <profile> -D … -- <command>
// <args>` plus a credential-scrubbed environment with `TMPDIR` set to the workspace's private
// temp dir.
export function sandboxSpawn(
  options: SandboxOptions,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SandboxResult {
  if (!options.workspaceDir || !getConfig().sandboxWorkspaces || !sandboxAvailable()) {
    return { command, args, env };
  }

  const workspaceDir = resolvePath(options.workspaceDir);
  const tmpDir = resolvePath(`${options.workspaceDir}.tmp`);
  const home = resolvePath(homedir());
  const gitObjects = parentGitObjectsDir(options.workspaceDir);
  const selfDirs = resolveExecutableDirs(options.selfBinaryHint ?? command);
  const darwinCacheDir = darwinUserCacheDir();
  const scratchDir = claudeScratchDir();
  const serverNodeDir = serverNodeDirs();

  const scrubbed = scrubEnv(env);
  scrubbed.TMPDIR = tmpDir;
  scrubbed.JANISSARY_NODE = process.execPath;
  if (options.githubToken) {
    scrubbed.GH_TOKEN = options.githubToken;
    // `gh` reads `~/.config/gh/hosts.yml` on every invocation regardless of `GH_TOKEN`, and its
    // config loader treats the sandbox's EPERM deny on that file (see SECRET_DENY_PATHS in
    // sandbox-profile.ts) as fatal, refusing to run at all. Pointing `GH_CONFIG_DIR` at an empty,
    // workspace-private directory instead gives `gh` a genuinely absent hosts.yml (real ENOENT),
    // which it handles by falling through to `GH_TOKEN` normally.
    scrubbed.GH_CONFIG_DIR = path.join(tmpDir, 'gh-config');
  }

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
    ...homeDParams(home, HOME_WRITE_CARVEOUTS, WRITE_CARVEOUT_PARAMS),
    ...homeDParams(home, HOME_READ_CARVEINS, READ_CARVEIN_PARAMS),
    ...homeDParams(home, SECRET_DENY_PATHS, SECRET_DENY_PARAMS),
  ];

  return {
    command: 'sandbox-exec',
    args: ['-p', profile, ...dParams, '--', command, ...args],
    env: scrubbed,
  };
}
