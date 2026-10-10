type SendDraft = (text: string) => Promise<boolean>;

const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

export class DraftSync {
  private desired: string | null = null;
  private acknowledged: string | null = null;
  private hasDraft = false;
  private connected = false;
  private send: SendDraft | undefined;
  private pending: object | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;

  constructor(private debounceMs = 500) {}

  attach(send: SendDraft, connected: boolean): void {
    this.detach();
    this.send = send;
    this.connected = connected;
    if (this.hasDraft) this.acknowledged = null;
    void this.flush();
  }

  detach(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.retries = 0;
    this.pending = undefined;
    this.send = undefined;
    this.connected = false;
  }

  update(text: string): void {
    if (this.desired === null) {
      this.desired = text;
      this.acknowledged = text;
      return;
    }
    if (this.desired === text) return;
    this.desired = text;
    this.hasDraft = true;
    this.retries = 0;
    this.schedule();
  }

  setConnected(connected: boolean): void {
    if (!this.connected && !connected) return;
    this.connected = connected;
    this.pending = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (connected && this.hasDraft) {
      this.retries = 0;
      this.acknowledged = null;
      void this.flush();
    } else if (!connected) {
      this.retries = 0;
    }
  }

  private schedule(delayMs = this.debounceMs): void {
    clearTimeout(this.timer);
    if (!this.connected || !this.send) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, delayMs);
  }

  private async flush(): Promise<void> {
    if (!this.connected || !this.send || this.pending || !this.hasDraft || this.desired === this.acknowledged) return;
    const text = this.desired;
    if (text === null) return;
    const attempt = {};
    this.pending = attempt;
    let accepted: boolean;
    try { accepted = await this.send(text); } catch { accepted = false; }
    if (this.pending !== attempt) return;
    this.pending = undefined;
    if (accepted) {
      this.acknowledged = text;
      this.retries = 0;
    }
    if (this.desired !== text) {
      this.schedule();
    } else if (!accepted && this.retries < MAX_RETRIES) {
      this.retries += 1;
      this.schedule(RETRY_DELAY_MS);
    }
  }
}
