export type Sinks = {
  emitState: () => void;
  sendPty: (id: string, data: string) => void;
  sendPtyExit: (id: string, exitCode: number) => void;
  exit?: () => void;
  sendLayout?: (event: {
    sidebarLeft?: number;
    sidebarRight?: number;
    tabAreaPct?: number;
    focusLeft?: 'files' | 'notifications';
    focusRight?: 'files' | 'notifications';
  }) => void;
  sendCollectTreeState?: (event: { id: number }) => void;
  // One notification to show in the corner, and the signal that empties the corner at once. Both
  // are one-shot: nothing about a toast is state, so nothing about it survives a reconnect.
  sendToast?: (event: { from: string; message: string; color?: string }) => void;
  sendToastClear?: () => void;
};
