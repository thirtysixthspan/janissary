import type { PendingQuestionView, QuestionKind } from './protocol.js';

export const QUESTION_CANCELLED = 'Question cancelled.';

export type QuestionRequest = {
  tab: string;
  kind: QuestionKind;
  question: string;
  options?: string[];
};

type QueuedQuestion = QuestionRequest & {
  id: string;
  resolve: (value: string) => void;
  cleanup?: () => void;
};

export class Questions {
  private active = new Map<string, QueuedQuestion>();
  private queued = new Map<string, QueuedQuestion[]>();
  private nextId = 1;

  constructor(private onChange: (tab: string, pending: PendingQuestionView | undefined) => void = () => {}) {}

  register(request: QuestionRequest, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.resolve(QUESTION_CANCELLED);
    return new Promise((resolve) => {
      const entry: QueuedQuestion = { ...request, id: `question-${this.nextId++}`, resolve };
      if (signal) {
        const cancel = () => this.cancelEntry(entry);
        signal.addEventListener('abort', cancel, { once: true });
        entry.cleanup = () => signal.removeEventListener('abort', cancel);
      }
      if (this.active.has(request.tab)) {
        const queue = this.queued.get(request.tab) ?? [];
        queue.push(entry);
        this.queued.set(request.tab, queue);
        return;
      }
      this.activate(entry);
    });
  }

  pendingFor(tab: string): PendingQuestionView | undefined {
    const entry = this.active.get(tab);
    if (!entry) return undefined;
    return {
      id: entry.id,
      tab: entry.tab,
      kind: entry.kind,
      question: entry.question,
      options: entry.options,
    };
  }

  answer(tab: string, id: string, answer: string | null): boolean {
    const entry = this.active.get(tab);
    if (!entry || entry.id !== id) return false;
    if (answer !== null && entry.kind === 'approve' && !entry.options?.includes(answer)) return false;
    this.finish(entry, answer ?? QUESTION_CANCELLED);
    return true;
  }

  cancelTab(tab: string): void {
    const queue = this.queued.get(tab) ?? [];
    this.queued.delete(tab);
    for (const entry of queue) {
      entry.cleanup?.();
      entry.resolve(QUESTION_CANCELLED);
    }
    const entry = this.active.get(tab);
    if (entry) this.finish(entry, QUESTION_CANCELLED);
  }

  closeTab(tab: string): void { this.cancelTab(tab); }

  closeAll(): void {
    const tabs = new Set([...this.active.keys(), ...this.queued.keys()]);
    for (const tab of tabs) this.cancelTab(tab);
  }

  dispose(): void {
    this.closeAll();
  }

  private activate(entry: QueuedQuestion): void {
    this.active.set(entry.tab, entry);
    this.onChange(entry.tab, this.pendingFor(entry.tab));
  }

  private cancelEntry(entry: QueuedQuestion): void {
    if (this.active.get(entry.tab) === entry) {
      this.finish(entry, QUESTION_CANCELLED);
      return;
    }
    const queue = this.queued.get(entry.tab);
    const index = queue?.indexOf(entry) ?? -1;
    if (!queue || index < 0) return;
    queue.splice(index, 1);
    if (queue.length === 0) this.queued.delete(entry.tab);
    entry.cleanup?.();
    entry.resolve(QUESTION_CANCELLED);
  }

  private finish(entry: QueuedQuestion, value: string): void {
    if (this.active.get(entry.tab) !== entry) return;
    this.active.delete(entry.tab);
    entry.cleanup?.();
    entry.resolve(value);
    this.onChange(entry.tab, undefined);
    const next = this.queued.get(entry.tab)?.shift();
    if (!next) {
      this.queued.delete(entry.tab);
      return;
    }
    this.activate(next);
  }
}
