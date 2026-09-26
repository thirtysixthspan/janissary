import path from 'node:path';
import { janissaryRoot, JANISSARY_HOME_ENV } from '../janissary-root.js';
import { getGitIdentity, gitIdentityEnv } from '../git/identity.js';
import { PROJECT_TOKENS, type ProjectTokens } from '../project/tokens.js';
import { ENV_SCRUB_PATTERNS } from './paths.js';
import { resolvePath } from './resolve.js';

// What a spawn's environment gains and loses, as opposed to the profile and its `-D` params beside
// it in `./index.ts`. Two of these apply whether or not this machine can confine anything: a
// workspaced tab is handed its credentials on every host, and every spawn is told where janissary's
// own code is.

// The slice of `SandboxOptions` these read, named here so this module does not have to import the
// options type back out of the module that calls it.
type WorkspacedSpawn = { workspaceDir?: string; tokens?: ProjectTokens };

// Drop credential-shaped vars and agent-socket escape vectors (see `ENV_SCRUB_PATTERNS` in paths.ts).
export function scrubEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const scrubbed: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (ENV_SCRUB_PATTERNS.some((pattern) => pattern.test(key))) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
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
// opened janissary (see `git/identity.ts`). The identity is read from the module cache rather than
// threaded through the spawn options the way the tokens are, because unlike a token — which the
// remote side merges per provision — it is a single process-wide fact on either machine.
export function workspaceEnv(tmpDir: string, tokens: ProjectTokens): NodeJS.ProcessEnv {
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
export function withWorkspaceCredentials(env: NodeJS.ProcessEnv, options: WorkspacedSpawn): NodeJS.ProcessEnv {
  if (!options.workspaceDir) return env;
  const tmpDir = resolvePath(`${options.workspaceDir}.tmp`);
  const added = workspaceEnv(tmpDir, options.tokens ?? {});
  return Object.keys(added).length === 0 ? env : { ...env, ...added };
}

// The install root of the running janissary, under the one name a command line can spell: the task
// picker inserts `execute $janissary/ai/tasks/<task>.md` for a built-in task, and the agent that
// receives it has no other way to find the installation — a globally installed npm package sits
// nowhere near the project, and on a remote tab the install that matters is the one on the machine
// the process actually runs on, not the one the browser is talking to.
//
// Added for every spawn, workspaced or not, unlike the credentials above: the picker inserts the same
// command shape on any tab and cannot know which kind it is populating, so a plain agent tab that got
// `$janissary` with nothing to expand would be worse off than one given the old absolute path. The
// value is a filesystem path to janissary's own code, not a credential, so there is nothing for the
// unconfined path to be careful about.
export function withJanissaryHome(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, [JANISSARY_HOME_ENV]: janissaryRoot() };
}
