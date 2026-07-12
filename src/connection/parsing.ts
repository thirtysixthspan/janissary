import type { ConnectionKind, ConnectionParsed } from '../types.js';

const KINDS: ConnectionKind[] = ['sqlite', 'shell', 'acp', 'browser', 'ssh'];
const USAGE = 'Usage: connection <list|close> [kind:id]  (e.g. connection close sqlite:mydb)';

export function parseConnectionCommand(input: string): ConnectionParsed {
  const rest = input.trim().replace(/^connection\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };

  const [actionRaw, target] = rest.split(/\s+/);
  const action = actionRaw.toLowerCase();

  if (action === 'list') return { action: 'list' };

  if (action === 'close') {
    if (!target) return { error: 'Usage: connection close <kind>:<id>' };
    const index = target.indexOf(':');
    if (index === -1) {
      return { error: `Invalid connection "${target}". Expected <kind>:<id>, e.g. sqlite:mydb.` };
    }
    const kind = target.slice(0, index).toLowerCase();
    if (!KINDS.includes(kind as ConnectionKind)) {
      return { error: `Unknown connection kind "${kind}". Expected one of: ${KINDS.join(', ')}.` };
    }
    const id = target.slice(index + 1);
    if (!id) return { error: `Missing id in "${target}".` };
    return { action: 'close', kind: kind as ConnectionKind, id };
  }

  return { error: USAGE };
}
