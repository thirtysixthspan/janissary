// OpenSSH flags that take a following value, so the token after them is never mistaken for the
// destination (e.g. `ssh -p 2222 -i ~/.ssh/id admin@host` must still find `admin@host`).
const VALUE_FLAGS = new Set(['-B', '-b', '-c', '-D', '-E', '-e', '-F', '-I', '-i', '-J', '-L', '-l', '-m', '-O', '-o', '-p', '-Q', '-R', '-S', '-W', '-w']);

const SCHEME = /^ssh:\/\//i;
const USER_PREFIX = /^[^@]*@/;
const PORT_SUFFIX = /:\d+$/;

const USAGE = 'Usage: ssh <destination> [ssh options].';

export type SshParsed = { command: string; destination: string; label: string } | { error: string };

// Find the first non-option token in an `ssh` command's arguments, skipping any flag and (for
// value-taking flags) the value that follows it.
function findDestination(tokens: string[]): string | undefined {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      i += VALUE_FLAGS.has(token) ? 2 : 1;
      continue;
    }
    return token;
  }
  return undefined;
}

/**
 * Parse an `ssh <destination> [ssh options…]` command. `command` is the input verbatim
 * (trimmed), spawned as-is — every flag, `user@host`, port, jump host, or trailing remote
 * command works without modeling ssh's own CLI grammar. `destination` is the connection
 * identity (scheme stripped, if any); `label` is its bare host, used as the tab label.
 */
export function parseSshCommand(input: string): SshParsed {
  const trimmed = input.trim();
  const rest = trimmed.replace(/^ssh\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };
  const destinationToken = findDestination(rest.split(/\s+/));
  if (!destinationToken) return { error: USAGE };
  const destination = destinationToken.replace(SCHEME, '');
  const label = destination.replace(USER_PREFIX, '').replace(PORT_SUFFIX, '');
  return { command: trimmed, destination, label };
}
