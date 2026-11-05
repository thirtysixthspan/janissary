import type { PromptHandlers } from './types.js';

export type ProviderTurn = {
  handlers: PromptHandlers;
  cancelled: boolean;
  sent: boolean;
  terminal?: () => void;
  notificationPending: boolean;
  drained: Promise<void>;
  resolveDrain: () => void;
  released: Promise<void>;
  resolveRelease: () => void;
  cancellation?: Promise<void>;
};

export class AcpPromptControl {
  current?: ProviderTurn;
  private closed = false;

  admit(handlers: PromptHandlers): ProviderTurn | undefined {
    if (this.closed || this.current) {
      handlers.onError(this.closed ? 'ACP session closed.' : 'ACP: a prompt is already running.');
      return;
    }
    const completion = { resolve: () => {} };
    const drained = new Promise<void>((resolve) => { completion.resolve = resolve; });
    const release = { resolve: () => {} };
    const released = new Promise<void>((resolve) => { release.resolve = resolve; });
    const turn = {
      handlers, cancelled: false, sent: false, notificationPending: false,
      drained, resolveDrain: completion.resolve, released, resolveRelease: release.resolve,
    };
    this.current = turn;
    return turn;
  }

  owns(turn: ProviderTurn): boolean {
    return !this.closed && this.current === turn;
  }

  end(turn: ProviderTurn, reason: string): void {
    this.terminal(turn, () => turn.handlers.onEnd(reason));
  }

  error(turn: ProviderTurn, message: string): void {
    this.terminal(turn, () => turn.handlers.onError(message));
  }

  cancel(send: (turn: ProviderTurn) => Promise<void>): Promise<void> {
    const turn = this.current;
    if (!turn) return Promise.resolve();
    if (turn.cancellation) return turn.cancellation;
    turn.cancelled = true;
    turn.notificationPending = true;
    turn.cancellation = (async () => {
      await Promise.all([Promise.race([send(turn), turn.released]), turn.drained]);
      turn.notificationPending = false;
      this.flush(turn);
    })();
    return turn.cancellation;
  }

  release(message = 'ACP session closed.'): void {
    this.closed = true;
    const turn = this.current;
    this.current = undefined;
    if (!turn) return;
    turn.resolveDrain();
    turn.resolveRelease();
    turn.handlers.onError(message);
  }

  private terminal(turn: ProviderTurn, callback: () => void): void {
    if (!this.owns(turn) || turn.terminal) return;
    turn.terminal = callback;
    turn.resolveDrain();
    this.flush(turn);
  }

  private flush(turn: ProviderTurn): void {
    if (!this.owns(turn) || !turn.terminal || turn.notificationPending) return;
    this.current = undefined;
    turn.resolveDrain();
    turn.terminal();
  }
}
