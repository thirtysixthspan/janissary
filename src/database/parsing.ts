import type { DbParsed as DatabaseParsed } from './types.js';

const VALID_NAME = /^[A-Za-z0-9_-]+$/;
const USAGE = 'Usage: db sqlite <create|delete|query|list> [name] [query]';
const ACTIONS = new Set(['create', 'delete', 'query', 'list']);

function engineError(engine: string): { error: string } {
  return { error: `Unsupported engine "${engine}". Only "sqlite" is supported.` };
}

function nameError(name: string): { error: string } {
  return { error: `Invalid database name "${name}". Use letters, numbers, "-" and "_" only.` };
}

function unwrapQuotes(s: string): string {
  const q = s[0];
  if (s.length >= 2 && (q === '"' || q === "'") && s.at(-1) === q) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parse a `db sqlite ...` command into an action. Pure — performs no I/O. */
export function parseDatabaseCommand(input: string): DatabaseParsed {
  const rest = input.trim().replace(/^db\b\s*/i, '').trim();
  if (!rest) return { error: USAGE };

  const [engineRaw, ...tail] = rest.split(/\s+/);
  const engine = engineRaw.toLowerCase();
  if (engine !== 'sqlite') {
    return ACTIONS.has(engine) ? { error: USAGE } : engineError(engine);
  }

  const action = tail[0]?.toLowerCase();
  if (!action) return { error: USAGE };

  if (action === 'list') return { action: 'list' };

  if (action === 'create' || action === 'delete') {
    const name = tail[1];
    if (!name) return { error: `Usage: db sqlite ${action} <name>` };
    if (!VALID_NAME.test(name)) return nameError(name);
    return { action, name };
  }

  if (action === 'query') {
    return parseQueryAction(rest);
  }

  return { error: USAGE };
}

function parseQueryAction(rest: string): DatabaseParsed {
  const m = rest.match(/^sqlite\s+query\s+(\S+)\s+([\s\S]+)$/i);
  if (!m) return { error: 'Usage: db sqlite query <name> <sql>' };
  const name = m[1];
  if (!VALID_NAME.test(name)) return nameError(name);
  const query = unwrapQuotes(m[2].trim());
  return { action: 'query', name, query };
}
