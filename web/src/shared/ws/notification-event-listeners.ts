export type ToastListener = (event: { from: string; message: string; color?: string }) => void;
export type ToastClearListener = () => void;
export type NotificationsRevealListener = (dock: 'left' | 'right') => void;

export class NotificationEventListeners {
  private toastListeners = new Set<ToastListener>();
  private clearListeners = new Set<ToastClearListener>();
  private revealListeners = new Set<NotificationsRevealListener>();

  onToast(listener: ToastListener): () => void {
    this.toastListeners.add(listener);
    return () => this.toastListeners.delete(listener);
  }

  onClear(listener: ToastClearListener): () => void {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }

  onReveal(listener: NotificationsRevealListener): () => void {
    this.revealListeners.add(listener);
    return () => this.revealListeners.delete(listener);
  }

  toast(event: Parameters<ToastListener>[0]): void {
    for (const listener of this.toastListeners) listener(event);
  }

  clear(): void {
    for (const listener of this.clearListeners) listener();
  }

  reveal(dock: 'left' | 'right'): void {
    for (const listener of this.revealListeners) listener(dock);
  }

  dispose(): void {
    this.toastListeners.clear();
    this.clearListeners.clear();
    this.revealListeners.clear();
  }
}
