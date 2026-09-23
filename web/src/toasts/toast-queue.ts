// The toasts on screen and each one's clock. Framework-free on purpose: the whole lifecycle — the
// visible phase, the fade, holding on hover and resuming with the time that was left — is plain
// timers and plain state, so it is testable under fake timers without a render, and nothing here
// depends on an `animationend` event jsdom never fires.

export type ToastPhase = 'visible' | 'fading';

export type Toast = {
  id: number;
  // The originating tab's label and dot color, and the message body. The same `from`/`fromColor`
  // split the feed's transcript line uses.
  from: string;
  message: string;
  color?: string;
  phase: ToastPhase;
  // Held by a pointer. A held toast's clock is stopped, and a held fading one renders fully
  // visible again — now that a toast is a click target, one that fades while being aimed at would
  // be worse than one that does not.
  held: boolean;
};

// Taken from the feature text: four seconds visible, then a two-second fade.
export const TOAST_VISIBLE_MS = 4000;
export const TOAST_FADE_MS = 2000;

const PHASE_DURATION: Record<ToastPhase, number> = {
  visible: TOAST_VISIBLE_MS,
  fading: TOAST_FADE_MS,
};

type Clock = { handle: ReturnType<typeof setTimeout>; deadline: number };

export class ToastQueue {
  private toasts: Toast[] = [];
  private clocks = new Map<number, Clock>();
  private paused = new Map<number, number>();
  private listeners = new Set<(toasts: Toast[]) => void>();
  private nextId = 1;

  get all(): Toast[] {
    return this.toasts;
  }

  subscribe(listener: (toasts: Toast[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.toasts);
  }

  private start(id: number, phase: ToastPhase, ms: number): void {
    const handle = setTimeout(() => {
      this.clocks.delete(id);
      if (phase === 'fading') { this.drop(id); return; }
      this.toasts = this.toasts.map((t) => (t.id === id ? { ...t, phase: 'fading' } : t));
      this.start(id, 'fading', TOAST_FADE_MS);
      this.emit();
    }, ms);
    this.clocks.set(id, { handle, deadline: Date.now() + ms });
  }

  private stop(id: number): number | undefined {
    const clock = this.clocks.get(id);
    if (!clock) return undefined;
    clearTimeout(clock.handle);
    this.clocks.delete(id);
    return Math.max(0, clock.deadline - Date.now());
  }

  private drop(id: number): void {
    this.stop(id);
    this.paused.delete(id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  add(notification: { from: string; message: string; color?: string }): void {
    const id = this.nextId++;
    this.toasts = [...this.toasts, { id, ...notification, phase: 'visible', held: false }];
    this.start(id, 'visible', TOAST_VISIBLE_MS);
    this.emit();
  }

  hold(id: number): void {
    const remaining = this.stop(id);
    if (remaining === undefined) return;
    this.paused.set(id, remaining);
    this.toasts = this.toasts.map((t) => (t.id === id ? { ...t, held: true } : t));
    this.emit();
  }

  release(id: number): void {
    const toast = this.toasts.find((t) => t.id === id);
    if (!toast?.held) return;
    const remaining = this.paused.get(id) ?? PHASE_DURATION[toast.phase];
    this.paused.delete(id);
    this.toasts = this.toasts.map((t) => (t.id === id ? { ...t, held: false } : t));
    this.start(id, toast.phase, remaining);
    this.emit();
  }

  private stopAll(): void {
    for (const clock of this.clocks.values()) clearTimeout(clock.handle);
    this.clocks.clear();
    this.paused.clear();
    this.toasts = [];
  }

  // Empty the corner at once, without fading: the feed is about to render these same lines, and
  // showing one notification in two places would be worse than showing it in neither.
  clear(): void {
    this.stopAll();
    this.emit();
  }

  dispose(): void {
    this.stopAll();
    this.listeners.clear();
  }
}
