import { spawn, type ChildProcess } from 'node:child_process';
import { isGitHubUrl, toHttpsUrl } from './repository-url.js';

// The one `git clone` every clone janissary makes goes through: a local `-w` workspace, a remote
// workspace, and a remote project root. Run via `spawn` (no shell) rather than `execSync` so it
// never blocks the event loop and so the child can be killed on cancel.

// Set only on the clone's own child, so the token never appears in an argument list or on disk.
const TOKEN_VARIABLE = 'JANUS_CLONE_GITHUB_TOKEN';

// An inline credential helper answering every `get` with the token from the child's environment.
// It is quoted for the shell git runs `!` helpers through, so `$JANUS_CLONE_GITHUB_TOKEN` expands
// there and not here.
const TOKEN_HELPER = `!f() { test "$1" = get && echo username=x-access-token && echo "password=$${TOKEN_VARIABLE}"; }; f`;

export type GitCloneOptions = {
  // A GitHub credential to clone with. Used only when the URL is on github.com, which then fetches
  // its HTTPS form; ignored for every other host, so a GitHub token is never sent anywhere else.
  githubToken?: string;
  // Keep git's stderr so a failure can report git's own first error line.
  keepStderr?: boolean;
};

export type GitCloneHandle = {
  // Resolves once `git clone` exits cleanly.
  ready: Promise<void>;
  // Kills the clone if it is still running. A no-op once it has settled.
  cancel: () => void;
};

function cloneCommand(url: string, target: string, options: GitCloneOptions): { args: string[]; env?: NodeJS.ProcessEnv } {
  const { githubToken, keepStderr } = options;
  if (githubToken === undefined || !isGitHubUrl(url)) {
    // A clone whose errors are being kept runs where no terminal can answer git, so a credential
    // prompt fails it instead of hanging it.
    return { args: ['clone', url, target], ...(keepStderr && { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }) };
  }
  // The empty value first resets every inherited helper (the reset `finishProvisioning` explains),
  // so the token is the only credential this clone can offer; a `git -c` value is never written to
  // the clone's own config.
  return {
    args: ['-c', 'credential.helper=', '-c', `credential.helper=${TOKEN_HELPER}`, 'clone', toHttpsUrl(url), target],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', [TOKEN_VARIABLE]: githubToken },
  };
}

function firstLine(text: string): string | undefined {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
}

export function startGitClone(url: string, target: string, options: GitCloneOptions = {}): GitCloneHandle {
  const { args, env } = cloneCommand(url, target, options);
  let cancelled = false;
  let stderr = '';
  const child: ChildProcess = spawn('git', args, {
    stdio: ['ignore', 'ignore', options.keepStderr ? 'pipe' : 'ignore'],
    ...(env && { env }),
  });
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => { stderr += chunk; });
  const ready = new Promise<void>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (cancelled) reject(new Error('git clone cancelled.'));
      else if (code === 0) resolve();
      else reject(new Error((options.keepStderr ? firstLine(stderr) : undefined) ?? `git clone exited with code ${String(code)}`));
    });
  });
  return {
    ready,
    cancel: () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      cancelled = true;
      child.kill();
    },
  };
}
