import type { LogEntry, MessageKind } from './types.js';

// Server-side port of useMessaging (the React hook): per-recipient FIFO queues drained one
// message at a time. info/response are shown in the recipient's transcript; command runs a shell
// command there; request runs and returns its output to the sender as a response.
type Message = { id: number; from: string; to: string; kind: MessageKind; text: string };

export type MessageBusDeps = {
  hasAgent: (label: string) => boolean;
  agentColor: (label: string) => string;
  isInteractive: (cmd: string) => boolean;
  appendLog: (label: string, entry: LogEntry) => void;
  appendContext: (label: string, text: string) => void;
  runShell: (label: string, cmd: string, done: (output: string) => void) => void;
  runCapture: (label: string, text: string, cb: (output: string) => void) => void;
};

export class MessageBus {
  private queues = new Map<string, Message[]>();
  private processing = new Set<string>();
  private nextId = 0;

  constructor(private deps: MessageBusDeps) {}

  send(msg: Omit<Message, 'id'>): boolean {
    if (!this.deps.hasAgent(msg.to)) return false;
    const full: Message = { ...msg, id: ++this.nextId };
    const q = this.queues.get(msg.to) ?? [];
    q.push(full);
    this.queues.set(msg.to, q);
    this.pump(msg.to);
    return true;
  }

  private pump(label: string): void {
    if (this.processing.has(label)) return;
    const queue = this.queues.get(label);
    if (!queue || queue.length === 0) return;
    this.processing.add(label);
    const msg = queue.shift()!;
    this.handle(msg, () => {
      this.processing.delete(label);
      if ((this.queues.get(label)?.length ?? 0) > 0) setTimeout(() => this.pump(label), 0);
    });
  }

  private handle(msg: Message, done: () => void): void {
    const d = this.deps;
    if (msg.kind === 'info' || msg.kind === 'response') {
      d.appendLog(msg.to, { input: '', output: msg.text, from: msg.from, fromColor: d.agentColor(msg.from), msgKind: msg.kind });
      d.appendContext(msg.to, `${msg.from}: ${msg.text}`);
      done();
      return;
    }
    if (msg.kind === 'command') {
      if (d.isInteractive(msg.text)) {
        d.appendLog(msg.to, { input: '', output: `Cannot run interactive command remotely: ${msg.text}`, from: msg.from, fromColor: d.agentColor(msg.from), msgKind: 'info' });
        done();
        return;
      }
      d.runShell(msg.to, msg.text, () => done());
      return;
    }
    // request: show it in the recipient, run it capturing output, return that to the sender.
    d.appendLog(msg.to, { input: '', output: msg.text, from: msg.from, fromColor: d.agentColor(msg.from), msgKind: 'request' });
    d.runCapture(msg.to, msg.text, (output) => {
      this.send({ from: msg.to, to: msg.from, kind: 'response', text: output });
      done();
    });
  }
}
