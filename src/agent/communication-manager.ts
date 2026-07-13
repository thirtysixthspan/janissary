import type { MessageKind } from '../types.js';
import type { Managers } from '../managers.js';

// Server-side port of useMessaging (the React hook): per-recipient FIFO queues drained one
// message at a time. info/response are shown in the recipient's transcript; command runs the
// command through full dispatch (as if typed by the user); request runs it and returns the
// output to the sender as a response.
type Message = { id: number; from: string; to: string; kind: MessageKind; text: string };

export class AgentCommunicationManager {
  private queues = new Map<string, Message[]>();
  private processing = new Set<string>();
  private nextId = 0;

  constructor(private managers: Managers) {}

  // Recipients may be addressed by their label or by their display alias (see `rename`);
  // either way, routing and queuing key off the tab's canonical label.
  send(message: Omit<Message, 'id'>): boolean {
    const to = message.to.toLowerCase();
    const target = this.managers.tab.tabs.find(
      (t) => t.label.toLowerCase() === to || t.title?.toLowerCase() === to,
    );
    if (!target) return false;
    const full: Message = { ...message, to: target.label, id: ++this.nextId };
    const q = this.queues.get(target.label) ?? [];
    q.push(full);
    this.queues.set(target.label, q);
    this.pump(target.label);
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
    const agentColor = (label: string) => this.managers.tab.tabs.find((t) => t.label === label)?.dotColor ?? '#e4e5e7';
    const appendContext = (label: string, text: string) => {
      this.managers.tab.appendContext(label, text);
      const tab = this.managers.tab.tabs.find((t) => t.label === label);
      if (tab) this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: this.managers.schedule.get(tab.label) }));
    };

    if (message.kind === 'info') {
      this.managers.tab.append(message.to, { input: '', output: message.text, from: message.from, fromColor: agentColor(message.from), msgKind: 'info' });
      appendContext(message.to, `${message.from}: ${message.text}`);
      done();
      return;
    }
    if (message.kind === 'response') {
      this.managers.tab.append(message.to, { input: '', output: message.text, from: `response from ${message.from}`, fromColor: agentColor(message.from), msgKind: 'response' });
      appendContext(message.to, `${message.from}: ${message.text}`);
      done();
      return;
    }
    if (message.kind === 'command') {
      this.managers.tab.append(message.to, { input: '', output: `sent command: ${message.text}`, from: message.from, fromColor: agentColor(message.from), msgKind: 'info' });
      this.managers.capture.run(message.to, message.text, () => done());
      return;
    }
    if (message.kind === 'request') {
      this.managers.tab.append(message.to, { input: '', output: `sent request: ${message.text}`, from: message.from, fromColor: agentColor(message.from), msgKind: 'info' });
      this.managers.capture.run(message.to, message.text, (output) => {
        this.send({ from: message.to, to: message.from, kind: 'response', text: output });
        done();
      });
      return;
    }
  }
}
