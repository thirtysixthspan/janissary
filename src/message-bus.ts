import type { LogEntry, MessageKind } from './types.js';

// Server-side port of useMessaging (the React hook): per-recipient FIFO queues drained one
// message at a time. info/response are shown in the recipient's transcript; command runs the
// command through full dispatch (as if typed by the user); request runs it and returns the
// output to the sender as a response.
type Message = { id: number; from: string; to: string; kind: MessageKind; text: string };

export type AgentBusDeps = {
  hasAgent: (label: string) => boolean;
  agentColor: (label: string) => string;
  isInteractive: (command: string) => boolean;
  appendLog: (label: string, entry: LogEntry) => void;
  appendContext: (label: string, text: string) => void;
  runShell: (label: string, command: string, done: (output: string) => void) => void;
  runCapture: (label: string, text: string, callback: (output: string) => void) => void;
};

export class AgentBus {
  private queues = new Map<string, Message[]>();
  private processing = new Set<string>();
  private nextId = 0;

  constructor(private dependencies: AgentBusDeps) {}

  send(message: Omit<Message, 'id'>): boolean {
    if (!this.dependencies.hasAgent(message.to)) return false;
    const full: Message = { ...message, id: ++this.nextId };
    const q = this.queues.get(message.to) ?? [];
    q.push(full);
    this.queues.set(message.to, q);
    this.pump(message.to);
    return true;
  }

  private pump(label: string): void {
    if (this.processing.has(label)) return;
    const queue = this.queues.get(label);
    if (!queue || queue.length === 0) return;
    this.processing.add(label);
    const message = queue.shift()!;
    this.handle(message, () => {
      this.processing.delete(label);
      if ((this.queues.get(label)?.length ?? 0) > 0) setTimeout(() => this.pump(label), 0);
    });
  }

  private handle(message: Message, done: () => void): void {
    const d = this.dependencies;
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
    if (message.kind === 'request') {
      d.appendLog(message.to, { input: '', output: `sent request: ${message.text}`, from: message.from, fromColor: d.agentColor(message.from), msgKind: 'info' });
      d.runCapture(message.to, message.text, (output) => {
        this.send({ from: message.to, to: message.from, kind: 'response', text: output });
        done();
      });
      return;
    }
  }
}
