import { execFileSync } from 'node:child_process';

// The name and email of the user who opened janissary, as git itself resolves them for the project
// directory. Either half can be absent: a machine with no `user.name` and no `user.email` is an
// ordinary state (git only complains once something tries to commit), and an identity that is
// missing a half is forwarded and injected as the half it has rather than being discarded.
export type GitIdentity = { name?: string; email?: string };

// One row per half of the identity: the git config key it is read from, and every environment
// variable it is written to. Both the author and the committer pair are set — git distinguishes the
// two, but a commit an agent makes inside a workspace has no distinction to draw, and setting only
// the author would leave the committer resolving from whatever config the machine happens to have.
const IDENTITY_FIELDS = [
  { name: 'name', key: 'user.name', env: ['GIT_AUTHOR_NAME', 'GIT_COMMITTER_NAME'] },
  { name: 'email', key: 'user.email', env: ['GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_EMAIL'] },
] as const;

let identity: GitIdentity = {};

// Ask git rather than parsing a config file: the value a commit made in this directory would use is
// the one git resolves across the system, global, and local scopes, and only git knows that order.
// A missing key exits non-zero, which is not an error here — it means this machine has no identity
// to offer.
function readConfig(projectDir: string, key: string): string | undefined {
  try {
    const value = execFileSync('git', ['config', '--get', key], { cwd: projectDir, stdio: 'pipe' });
    return value.toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

// Read the identity once, at startup — `main.ts` for the local server, `runRemoteServer` for the far
// end of a remote session, where it is the fallback a forwarded identity replaces. Replaces the
// cache outright rather than merging into it, so loading a second project never leaves the first
// one's identity behind.
export function loadGitIdentity(projectDir: string): GitIdentity {
  const loaded: GitIdentity = {};
  for (const { name, key } of IDENTITY_FIELDS) {
    const value = readConfig(projectDir, key);
    if (value) loaded[name] = value;
  }
  identity = loaded;
  return identity;
}

// Install an identity the local side forwarded over the `provision` frame. Whole-record replacement,
// not a per-field merge: a name from one machine paired with an email from another is an identity
// that belongs to nobody.
export function setGitIdentity(next: GitIdentity): void {
  identity = next;
}

export function getGitIdentity(): GitIdentity {
  return identity;
}

// The four variables git reads in preference to `user.name`/`user.email`. A half the identity does
// not have plants no variable at all — an empty `GIT_AUTHOR_NAME` is not the same as an absent one,
// and git treats the former as a name.
export function gitIdentityEnv(from: GitIdentity): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const { name, env: variables } of IDENTITY_FIELDS) {
    const value = from[name];
    if (!value) continue;
    for (const variable of variables) env[variable] = value;
  }
  return env;
}
