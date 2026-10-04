import type { RpcCall } from '@shared/protocol';

export type PtyActions = {
  attach: (id: string, onData: (data: string) => void) => () => void;
  input: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  reportColors: (id: string, fg: string, bg: string) => void;
  kill: (id: string) => void;
};

type PtyTransport = {
  send: (call: RpcCall) => void;
  attachPty: (id: string, onData: (data: string) => void) => () => void;
};

export function ptyActions(transport: PtyTransport): PtyActions {
  return {
    attach: (id, onData) => transport.attachPty(id, onData),
    input: (id, data) => transport.send({ method: 'ptyInput', params: { id, data } }),
    resize: (id, cols, rows) => transport.send({ method: 'ptyResize', params: { id, cols, rows } }),
    reportColors: (id, fg, bg) => transport.send({ method: 'reportTerminalColors', params: { id, fg, bg } }),
    kill: (id) => transport.send({ method: 'ptyKill', params: { id } }),
  };
}
