import { messageBus } from './bus.js';

export const RESUME_THRESHOLD_MS = 5000;
export const RESUME_TICK_MS = 500;

export class ResumeWatch {
  private timer: ReturnType<typeof setInterval> | undefined;
  private lastTick = Date.now();

  start(): void {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.check(), RESUME_TICK_MS);
    this.timer.unref();
  }

  check(): boolean {
    const now = Date.now();
    const sleptMs = now - this.lastTick - RESUME_TICK_MS;
    this.lastTick = now;
    if (sleptMs <= RESUME_THRESHOLD_MS) return false;
    messageBus.emit('system', { type: 'resumed', sleptMs });
    return true;
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
