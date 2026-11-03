export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser' | 'ssh' | 'terminal';

export type ParsedConnectionCommand =
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string }
  | { action: 'dock'; side: 'left' | 'right' }
  | { action: 'lookup'; text: string }
  | { action: 'open-list'; centre: boolean }
  | { error: string };

const kinds: readonly ConnectionKind[] = ['sqlite', 'shell', 'acp', 'browser', 'ssh', 'terminal'];
const USAGE = 'Usage: connections close <kind>:<id>';

function parseClose(target: string | undefined): ParsedConnectionCommand {
  if (!target) return { error: USAGE };
  const colon = target.indexOf(':');
  if (colon === -1) return { error: `Invalid connection "${target}". Expected <kind>:<id>, e.g. sqlite:mydb.` };
  const kind = target.slice(0, colon).toLowerCase();
  if (!kinds.includes(kind as ConnectionKind)) {
    return { error: `Unknown connection kind "${kind}". Expected one of: ${kinds.join(', ')}.` };
  }
  const id = target.slice(colon + 1);
  if (!id) return { error: `Missing id in "${target}".` };
  return { action: 'close', kind: kind as ConnectionKind, id };
}

export function parseConnectionsCommand(input: string, name = 'connections'): ParsedConnectionCommand {
  const commandName = name.trim().toLowerCase();
  if (commandName !== 'connections' && commandName !== 'connection') return { error: USAGE };
  const args = input.trim() ? input.trim().split(/\s+/u) : [];
  const subcommand = args[0]?.toLowerCase();
  if (args.length === 0) return { action: 'open-list', centre: true };
  if (commandName === 'connections' && (subcommand === 'left' || subcommand === 'right')) {
    return { action: 'dock', side: subcommand };
  }
  if (subcommand === 'list') return { action: 'list' };
  if (subcommand === 'close') return parseClose(args[1]);
  return { action: 'lookup', text: args[0] ?? '' };
}
