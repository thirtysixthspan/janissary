import { useRef } from 'react';
import type { LogEntry } from './tab.js';

export type MessageKind = 'info' | 'request' | 'command';

export type Message = {
  id: number;
  from: string;
  to: string;
  kind: MessageKind;
  text: string;
};

const KIND_ALIASES: Record<string, MessageKind> = {
  i: 'info', info: 'info', informational: 'info',
  r: 'request', req: 'request', request: 'request',
  c: 'command', cmd: 'command', command: 'command',
};

export function parseKind(token: string): MessageKind | null {
  return KIND_ALIASES[token.trim().toLowerCase()] ?? null;
}

export type ParsedMsg = { to: string; kind: MessageKind; text: string };

/** Parse a `msg <agent> <kind> <text...>` command (the leading `msg` is optional). */
export function parseMsgCommand(input: string): ParsedMsg | { error: string } {
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

export type MessagingDeps = {
  hasAgent: (label: string) => boolean;
  agentColor: (label: string) => string;
  // Whether a command needs an interactive PTY (those cannot be run on behalf of a
  // non-foreground agent and are rejected).
  isInteractive: (cmd: string) => boolean;
  appendLog: (label: string, entry: LogEntry) => void;
  appendContext: (label: string, text: string) => void;
  // Run a shell command in the recipient's own persistent shell, streaming output to its
  // transcript, and invoke onComplete with the final output.
  runShell: (label: string, cmd: string, onComplete: (output: string) => void) => void;
  // Process text through the recipient's window as if typed into its prompt (built-ins +
  // shell, interactive commands skipped). Invokes onComplete when finished.
  runWindow: (label: string, text: string, onComplete: () => void) => void;
};

export type Messaging = {
  /** Enqueue a message for delivery. Returns false if the recipient does not exist. */
  send: (msg: Omit<Message, 'id'>) => boolean;
};

/**
 * In-process messaging between agents. Each agent has its own FIFO queue that is
 * drained one message at a time (yielding between messages so processing stays serial
 * and observable).
 */
export function useMessaging(deps: MessagingDeps): Messaging {
  const queues = useRef<Record<string, Message[]>>({});
  const processing = useRef<Record<string, boolean>>({});
  const idRef = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  // Handle one message, calling `done` when finished. Commands/requests run a real
  // shell command in the recipient and may complete asynchronously.
  const handle = (msg: Message, done: () => void): void => {
    const d = depsRef.current;
    if (msg.kind === 'info') {
      d.appendLog(msg.to, { input: '', output: msg.text, from: msg.from, fromColor: d.agentColor(msg.from) });
      d.appendContext(msg.to, `${msg.from}: ${msg.text}`);
      done();
      return;
    }
    if (msg.kind === 'command') {
      // Run the shell command in the recipient's shell as if it issued it; no response.
      // Interactive programs need a foreground tab, so they are refused remotely.
      if (d.isInteractive(msg.text)) {
        const note = `Cannot run interactive command remotely: ${msg.text}`;
        d.appendLog(msg.to, { input: '', output: note, from: msg.from, fromColor: d.agentColor(msg.from) });
        done();
        return;
      }
      d.runShell(msg.to, msg.text, () => done());
      return;
    }
    // request: process through the recipient's window as if typed into its prompt
    // (built-ins + shell; interactive commands are skipped). No response is returned.
    d.runWindow(msg.to, msg.text, () => done());
  };

  const pump = (label: string): void => {
    if (processing.current[label]) return;
    const queue = queues.current[label];
    if (!queue || queue.length === 0) return;
    processing.current[label] = true;
    const msg = queue.shift()!;
    handle(msg, () => {
      processing.current[label] = false;
      if ((queues.current[label]?.length ?? 0) > 0) setTimeout(() => pump(label), 0);
    });
  };

  const send = (msg: Omit<Message, 'id'>): boolean => {
    if (!depsRef.current.hasAgent(msg.to)) return false;
    const full: Message = { ...msg, id: ++idRef.current };
    (queues.current[msg.to] ??= []).push(full);
    pump(msg.to);
    return true;
  };

  return { send };
}
