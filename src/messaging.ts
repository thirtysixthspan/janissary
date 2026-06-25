import { useRef } from 'react';
import type {
  MessageKind, Message, ParsedMsg as ParsedMessage, ParsedBroadcast, MessagingDeps as MessagingDependencies, Messaging,
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

/**
 * In-process messaging between agents. Each agent has its own FIFO queue that is
 * drained one message at a time (yielding between messages so processing stays serial
 * and observable).
 */
export function useMessaging(dependencies: MessagingDependencies): Messaging {
  const queues = useRef<Record<string, Message[]>>({});
  const processing = useRef<Record<string, boolean>>({});
  const idReference = useRef(0);
  const dependenciesReference = useRef(dependencies);
  dependenciesReference.current = dependencies;

  // Handle one message, calling `done` when finished. Commands/requests run a real
  // shell command in the recipient and may complete asynchronously.
  const handle = (message: Message, done: () => void): void => {
    const d = dependenciesReference.current;
    // info and response are both informational: shown in the recipient's transcript and
    // appended to its context.
    if (message.kind === 'info') {
      d.appendLog(message.to, { input: '', output: message.text, from: message.from, fromColor: d.agentColor(message.from), msgKind: 'info' });
      d.appendContext(message.to, `${message.from}: ${message.text}`);
      done();
      return;
    }
    if (message.kind === 'response') {
      d.appendLog(message.to, { input: '', output: message.text, from: `response from ${message.from}`, fromColor: d.agentColor(message.from), msgKind: 'response' });
      d.appendContext(message.to, `${message.from}: ${message.text}`);
      done();
      return;
    }
    if (message.kind === 'command') {
      d.appendLog(message.to, { input: '', output: `sent command: ${message.text}`, from: message.from, fromColor: d.agentColor(message.from), msgKind: 'info' });
      d.runCapture(message.to, message.text, () => done());
      return;
    }
    // request: show the command in the recipient's transcript as if the user typed it (full
    // dispatch including routing, acp, browser, etc.), then return the output to the sender.
    d.appendLog(message.to, { input: '', output: `sent request: ${message.text}`, from: message.from, fromColor: d.agentColor(message.from), msgKind: 'info' });
    d.runCapture(message.to, message.text, (output) => {
      send({ from: message.to, to: message.from, kind: 'response', text: output });
      done();
    });
  };

  const pump = (label: string): void => {
    if (processing.current[label]) return;
    const queue = queues.current[label];
    if (!queue || queue.length === 0) return;
    processing.current[label] = true;
    const message = queue.shift()!;
    handle(message, () => {
      processing.current[label] = false;
      if ((queues.current[label]?.length ?? 0) > 0) setTimeout(() => pump(label), 0);
    });
  };

  const send = (message: Omit<Message, 'id'>): boolean => {
    if (!dependenciesReference.current.hasAgent(message.to)) return false;
    const full: Message = { ...message, id: ++idReference.current };
    (queues.current[message.to] ??= []).push(full);
    pump(message.to);
    return true;
  };

  return { send };
}
