type SendDraft = (text: string) => Promise<boolean>;

export class DraftSync {
  private desired: string | null = null;
  private acknowledged: string | null = null;
  private hasDraft = false;
  private connected = false;
  private send: SendDraft | undefined;
  private pending: object | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;

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
    this.schedule();
  }

  setConnected(connected: boolean): void {
    if (!this.connected && !connected) return;
    this.connected = connected;
    this.pending = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (connected && this.hasDraft) {
      this.acknowledged = null;
      void this.flush();
    }
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.connected || !this.send) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.debounceMs);
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
    if (accepted) this.acknowledged = text;
    if (this.desired !== text) this.schedule();
  }
}
