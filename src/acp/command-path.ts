import { execFileSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';
import { shellCommandArgs } from '../shell/startup.js';

// An ACP agent is spawned directly, not through a shell, so it is found only on the server's own
// PATH. A harness tab finds the same binary through an interactive shell (see `shellCommandArgs`),
// whose rc file is where a version manager such as nvm adds its directory. A server started without
// that rc file — from a launcher, or from a tab shell that skips startup files — therefore failed
// with `spawn opencode ENOENT` for an agent the user's own terminal runs fine. The interactive
// shell's PATH is the fallback for exactly that case.

const MARKER = '__JANISSARY_PATH__';
const TIMEOUT_MS = 10_000;

// Asked once per shell for the life of the process: the answer is the user's rc file, which does not
// change under a running server, and the lookup blocks while that rc file runs.
const shellPaths = new Map<string, string | undefined>();

// The markers fence the value off from anything the rc file prints on the way in.
function interactiveShellPath(shell: string): string | undefined {
  if (shellPaths.has(shell)) return shellPaths.get(shell);
  let found: string | undefined;
  try {
    const output = execFileSync(shell, shellCommandArgs(shell, `printf '${MARKER}%s${MARKER}' "$PATH"`), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: TIMEOUT_MS,
    });
    const parts = output.split(MARKER);
    found = parts.length >= 3 ? parts[1] : undefined;
  } catch {
    found = undefined;
  }
  shellPaths.set(shell, found);
  return found;
}

function isExecutableFile(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function findOnPath(command: string, searchPath: string): string | undefined {
  return searchPath.split(':').filter(Boolean)
    .map((dir) => path.join(dir, command))
    .find((candidate) => isExecutableFile(candidate));
}

// The command and environment to spawn an agent with. A path, or a name the given PATH already
// resolves, is left alone. A name only the user's interactive shell resolves becomes that absolute
// path, and the agent gets the shell's PATH too, so whatever it runs in turn (an nvm `node` behind
// its shebang, most often) is found the same way.
export function locateAcpCommand(command: string, env: NodeJS.ProcessEnv): { command: string; env: NodeJS.ProcessEnv } {
  if (command.includes('/') || findOnPath(command, env.PATH ?? '')) return { command, env };
  const shellPath = interactiveShellPath(process.env.SHELL || 'bash');
  const located = shellPath ? findOnPath(command, shellPath) : undefined;
  if (!located) return { command, env };
  return { command: located, env: { ...env, PATH: shellPath } };
}
