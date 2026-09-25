import type { MessageKind } from '../messaging.js';
import type { Managers } from '../managers.js';
import { sendMessage, pumpQueue } from './message-queue.js';

// Server-side port of useMessaging (the React hook): per-recipient FIFO queues drained one
// message at a time. info/response are shown in the recipient's transcript; command runs the
// command through full dispatch (as if typed by the user); request runs it and returns the
// output to the sender as a response.
export type Message = { id: number; from: string; to: string; kind: MessageKind; text: string };

export class AgentCommunicationManager {
  private queues = new Map<string, Message[]>();
  // Label → id of the message being handled, so a completion from a closed tab's message can be
  // told apart from one belonging to a newer tab that reused the label.
  private processing = new Map<string, number>();
  private nextId = 0;

  constructor(private managers: Managers) {}

  // Recipients may be addressed by their label or by their display alias (see `rename`);
  // either way, routing and queuing key off the tab's canonical label.
  send(message: Omit<Message, 'id'>): boolean {
    return sendMessage(this.managers, this.queues, message, () => ++this.nextId, (label) => this.pump(label));
  }

  // Drops the closed tab's queued messages and its in-progress flag. A message in flight at close
  // (a shell command waiting on a sentinel that dies with the shell) never calls `done`, and without
  // this the flag would block every later tab that reuses the label.
  closeTab(label: string): void {
    this.queues.delete(label);
    this.processing.delete(label);
  }

  private pump(label: string): void {
    pumpQueue(this.queues, this.processing, label, (m, done) => this.handle(m, done), (l) => this.pump(l));
  }

  private handle(message: Message, done: () => void): void {
    const agentColor = (label: string) => this.managers.tab.byLabel(label)?.dotColor ?? '#e4e5e7';
    const appendContext = (label: string, text: string) => {
      this.managers.tab.appendContext(label, text);
      const tab = this.managers.tab.byLabel(label);
      if (tab) this.managers.tab.persist(this.managers.tab.buildAgentState(tab));
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
