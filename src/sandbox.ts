import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

// The parent repository's real git objects directory, discovered from the workspace clone's own
// `--shared` alternates file — no extra plumbing needed to track the source repo path.
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

  const scrubbed = scrubEnv(env);
  scrubbed.TMPDIR = tmpDir;

  const profile = options.offline ? SANDBOX_PROFILE_OFFLINE : SANDBOX_PROFILE;
  const dParams = [
    '-D', `WORKSPACE=${workspaceDir}`,
    '-D', `TMPDIR=${tmpDir}`,
    '-D', `HOME=${home}`,
    '-D', `GIT_OBJECTS=${gitObjects}`,
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
