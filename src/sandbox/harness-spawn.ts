import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolvePath, dualPath, darwinUserCacheDir } from './resolve.js';
import { SANDBOX_PROFILE, SANDBOX_PROFILE_OFFLINE, sandboxProfile } from './profile.js';
import { playwrightPackagePaths } from '../browser/playwright-paths.js';
import {
  HOME_WRITE_CARVEOUTS, HOME_READ_CARVEINS, SECRET_DENY_PATHS, HOME_READ_LISTING_DIRS, HOME_WRITE_PREFIX_CARVEOUTS,
  WRITE_CARVEOUT_PARAMS, READ_CARVEIN_PARAMS, SECRET_DENY_PARAMS, LISTING_DIR_PARAMS, WRITE_PREFIX_PARAMS,
} from './paths.js';
import { janissaryRoot, janissaryAiDir, janissaryScriptsDir, janissarySecurityDir, JANISSARY_HOME_ENV } from '../janissary-root.js';
import { scrubEnv, workspaceEnv } from './environment.js';
import type { ProjectTokens } from '../project/tokens.js';

// The `sandbox-exec` invocation for a harness spawn this host has already decided to confine: the
// profile, its `-D` parameters, and the scrubbed environment. Split out of `sandboxSpawn` in
// `./index.ts`, which keeps the host check and the dispatch, so everything here only computes paths
// and strings and can be tested on a host that cannot confine anything — the same split
// `browserSpawn` in `./browser/spawn.ts` already has, which takes the decision as an argument.

// The slice of `SandboxOptions` the builder reads, named here so this module does not have to import
// the options type back out of the module that calls it.
export type HarnessSpawnOptions = {
  installedSkillDirs?: string[];
  offline?: boolean;
  selfBinaryHint?: string;
  tokens?: ProjectTokens;
};

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

// `sandbox-exec -p <profile> -D … -- <command> <args>` plus a credential-scrubbed environment with
// `TMPDIR` set to the workspace's private temp dir, for the workspace `dir`.
export function confinedHarnessSpawn(
  options: HarnessSpawnOptions,
  dir: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const workspaceDir = resolvePath(dir);
  const tmpDir = resolvePath(`${dir}.tmp`);
  const home = resolvePath(homedir());
  const darwinCacheDir = darwinUserCacheDir();
  const scrubbed = scrubEnv(env);
  scrubbed.TMPDIR = tmpDir;

  const gitObjects = parentGitObjectsDir(dir);
  const selfDirs = resolveExecutableDirs(options.selfBinaryHint ?? command);
  const scratchDir = claudeScratchDir();
  const serverNodeDir = serverNodeDirs();
  const playwright = playwrightPackagePaths();
  const janissaryAi = dualPath(janissaryAiDir());
  const janissaryScripts = dualPath(janissaryScriptsDir());
  const janissarySecurity = dualPath(janissarySecurityDir());
  const installedSkillsRoot = path.join(janissaryRoot(), 'skills');
  const installedSkillsRealRoot = resolvePath(installedSkillsRoot);
  const skillDirs = (options.installedSkillDirs ?? []).filter((skillDir) => {
    const relative = path.relative(installedSkillsRealRoot, resolvePath(skillDir));
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });

  scrubbed.JANISSARY_NODE = process.execPath;
  scrubbed[JANISSARY_HOME_ENV] = janissaryRoot();
  Object.assign(scrubbed, workspaceEnv(tmpDir, options.tokens ?? {}, dir));

  const profile = skillDirs.length > 0
    ? sandboxProfile(Boolean(options.offline), skillDirs.length)
    : options.offline ? SANDBOX_PROFILE_OFFLINE : SANDBOX_PROFILE;
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
    '-D', `JANISSARY_AI_L=${janissaryAi.literal}`,
    '-D', `JANISSARY_AI_R=${janissaryAi.real}`,
    '-D', `JANISSARY_SCRIPTS_L=${janissaryScripts.literal}`,
    '-D', `JANISSARY_SCRIPTS_R=${janissaryScripts.real}`,
    '-D', `JANISSARY_SECURITY_L=${janissarySecurity.literal}`,
    '-D', `JANISSARY_SECURITY_R=${janissarySecurity.real}`,
    ...skillDirs.flatMap((skillDir, index) => {
      const dual = dualPath(skillDir);
      return ['-D', `JANISSARY_SKILL_${index}_L=${dual.literal}`, '-D', `JANISSARY_SKILL_${index}_R=${dual.real}`];
    }),
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
