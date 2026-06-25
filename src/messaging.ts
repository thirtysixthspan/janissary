import type {
  MessageKind, ParsedMsg as ParsedMessage, ParsedBroadcast,
} from './types.js';

const KIND_ALIASES: Record<string, MessageKind> = {
  i: 'info', info: 'info', informational: 'info',
  r: 'request', req: 'request', request: 'request',
  c: 'command', cmd: 'command', command: 'command',
};

export function parseKind(token: string): MessageKind | null {
  return KIND_ALIASES[token.trim().toLowerCase()] ?? null;
}

/** Parse a `msg <agent> <kind> <text...>` command (the leading `msg` is optional). */
export function parseMsgCommand(input: string): ParsedMessage | { error: string } {
  const body = input.trim().replace(/^msg\s+/i, '');
  const parts = body.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return { error: 'Usage: msg <agent> <info|request|command> <text>' };
  const to = parts[0].toLowerCase();
  const kind = parseKind(parts[1]);
  if (!kind) return { error: `Unknown message type "${parts[1]}". Use info, request, or command.` };
  const text = parts.slice(2).join(' ');
  if (!text) return { error: 'Message text is empty.' };
  return { to, kind, text };
}

/**
 * Parse a `broadcast <all|agent[,agent...]> <kind> <text>` command. The first token is
 * either `all`/`*` (every other agent) or a comma-separated list of recipient names.
 */
export function parseBroadcastCommand(input: string): ParsedBroadcast | { error: string } {
  const body = input.trim().replace(/^broadcast\s+/i, '');
  const parts = body.split(/\s+/).filter(Boolean);
  if (parts.length < 3) return { error: 'Usage: broadcast <all|agent[,agent...]> <info|request|command> <text>' };
  const spec = parts[0].toLowerCase();
  const kind = parseKind(parts[1]);
  if (!kind) return { error: `Unknown message type "${parts[1]}". Use info, request, or command.` };
  const text = parts.slice(2).join(' ');
  if (!text) return { error: 'Message text is empty.' };
  const targets = spec === 'all' || spec === '*' ? 'all' : spec.split(',').filter(Boolean);
  if (targets !== 'all' && targets.length === 0) return { error: 'No broadcast recipients specified.' };
  return { targets, kind, text };
}

