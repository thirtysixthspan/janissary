import { browserSpawn, type BrowserSpawnOptions } from './browser/spawn.js';
import { getConfig } from '../config.js';
import { sandboxAvailable as isSandboxAvailable, sandboxWillConfine } from './confinement.js';
import { withJanissaryHome, withWorkspaceCredentials } from './environment.js';
import { confinedHarnessSpawn } from './harness-spawn.js';
import type { ProjectTokens } from '../project/tokens.js';

export type SandboxOptions = {
  // Undefined for a non-workspaced tab — callers pass it through unconditionally and
  // `sandboxSpawn` returns the input unchanged rather than requiring a branch at every call site.
  workspaceDir?: string;
  installedSkillDirs?: string[];
  offline?: boolean;
  // The actual program that ends up running, when `command` is a shell wrapping it (e.g. PTY
  // callers spawn `bash -lc '<command>'`, so `command` is always `bash` — the shell itself, never
  // the harness binary the profile actually needs to carve in self-read access for). Falls back to
  // `command` when omitted (already the real program — e.g. the ACP agent spawn, which runs the
  // binary directly with no shell wrapper).
  selfBinaryHint?: string;
  // The project's configured credentials (see `src/project/tokens.ts`), each becoming the environment
  // variable its table row names. Applied for any workspaced spawn — not just a harness tab, since
  // a shell tab's plain shell can invoke the same CLIs — and whether or not this machine can
  // actually confine the process, because a host that cannot confine anything still needs its
  // harness authenticated and its pushes credentialed.
  tokens?: ProjectTokens;
  // Set only for the e2e browser child (`src/browser/e2e-server.ts`): confine it with the minimal
  // browser profile instead of the harness one. The harness profile's read carve-ins — Keychains,
  // `.claude`, `.codex`, opencode's state directory — are close to an inventory of what an escape
  // would want, and a browser needs none of them.
  //
  // See `browser/spawn.ts` for what each path is and why the installation root is not among them.
  browser?: BrowserSpawnOptions;
};

export type SandboxResult = {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
};

export function sandboxAvailable(): boolean {
  return isSandboxAvailable();
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

// Wrap a spawn invocation (`command` + `args` — the same shape `child_process.spawn`/node-pty's
// `spawn` take) for a workspaced tab. Returns the command and args unchanged when there's nothing
// to sandbox: no `workspaceDir`, the `sandboxWorkspaces` config toggle is off, or `sandbox-exec`
// isn't available (e.g. non-darwin) — the environment still picks up the workspace's credentials
// in that case, and the janissary install root in every case, neither of which is a sandbox concern
// (see `withWorkspaceCredentials` and `withJanissaryHome`). Otherwise
// returns `sandbox-exec -p <profile> -D … -- <command> <args>` plus a credential-scrubbed
// environment with `TMPDIR` set to the workspace's private temp dir, built by
// `confinedHarnessSpawn` in `./harness-spawn.ts`.
export function sandboxSpawn(
  options: SandboxOptions,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): SandboxResult {
  const dir = options.workspaceDir;
  const confinable = sandboxWillConfine(dir);
  // Answered before the confinement test, not inside it. What environment the browser gets follows
  // from what the browser is; the host only decides whether there is a profile around it. Deciding
  // it the other way round handed the whole server environment to a browser on precisely the hosts
  // with no kernel confinement behind it.
  if (options.browser) return browserSpawn(options.browser, dir, command, args, env, confinable);
  if (!dir || !confinable) {
    return { command, args, env: withJanissaryHome(withWorkspaceCredentials(env, options)) };
  }
  return confinedHarnessSpawn(options, dir, command, args, env);
}
