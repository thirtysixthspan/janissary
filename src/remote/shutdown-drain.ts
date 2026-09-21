export const REMOTE_SHUTDOWN_DRAIN_MS = 250;

export class ShutdownDrain {
  private timer: ReturnType<typeof setTimeout> | undefined;

  schedule(close: () => void): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      close();
    }, REMOTE_SHUTDOWN_DRAIN_MS);
    this.timer.unref();
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
