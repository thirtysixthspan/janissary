import { isHostName } from './plugins/hosts/hosts-values.js';
import type { SavedHost } from './plugins/hosts/hosts-values.js';
import { shellQuote } from './shell/quote.js';
import type { SshParsed } from './ssh.js';

const BARE_NAME = /^ssh\s+(\S+)$/i;
const HOME_PREFIX = '~/';

// Only a bare `ssh <name>` can name a saved host. Flags, extra words, a trailing remote command, or
// an address with `@`/`:` all fall through to the literal parser; a lone hyphen-prefixed token is a
// name the catalog itself admits, so `ssh -v` can select a host called `-v`.
export function savedSshName(input: string): string | undefined {
  const token = BARE_NAME.exec(input.trim())?.[1];
  return token !== undefined && isHostName(token) ? token : undefined;
}

function cdOperand(path: string): string {
  if (path === '~') return '"$HOME"';
  if (path.startsWith(HOME_PREFIX)) return `"$HOME"/${shellQuote(path.slice(HOME_PREFIX.length))}`;
  return shellQuote(path);
}

// The remote side runs this with the account's shell. `$HOME` and `$SHELL` stay literal here so the
// local shell cannot expand them; the `||` keeps a failed `cd` from tripping a remote `set -e`, and
// the login shell then starts in whichever directory is current.
function remoteCommand(path: string): string {
  const operand = cdOperand(path);
  const failed = shellQuote(`janissary: cannot change directory to ${path}`);
  return String.raw`cd -- ${operand} || printf '%s\n' ${failed} >&2; exec "$SHELL" -l`;
}

/**
 * Build the literal ssh invocation for a validated saved host. The destination is the real
 * `[user@]host`, the label is the stored name, and the remote command — when there is one — is a
 * single element of `options` so its argument boundary survives a caller that otherwise splits the
 * generated command text on whitespace.
 */
export function buildSavedSshInvocation(host: SavedHost): SshParsed {
  const destination = host.user === undefined ? host.host : `${host.user}@${host.host}`;
  const prefix = ['ssh'];
  if (host.port !== undefined) prefix.push('-p', String(host.port));
  if (host.path !== undefined) prefix.push('-t');
  prefix.push('--');
  const remote = host.path === undefined ? [] : [shellQuote(remoteCommand(host.path))];
  return {
    command: [...prefix, destination, ...remote].join(' '),
    destination,
    label: host.name,
    options: [...prefix.slice(1), ...remote],
  };
}
