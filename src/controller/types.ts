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
};
