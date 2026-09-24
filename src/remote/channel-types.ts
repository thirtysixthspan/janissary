import type { RemoteHandshake, ServerFrame } from './protocol.js';

// The pure type declarations `RemoteChannel` is built against, split out so the class file itself
// holds only the state machine — the same reason `SessionListener` and `AcpSessionListener` already
// live in their own modules.

// One ssh session's lifetime and its state machine. Until `remote-serve` announces itself the
// session is a plain terminal: bytes pass through to the tab's terminal and keystrokes pass through
// to the PTY, so ssh's own password, key-passphrase, host-key-verification, and keyboard-interactive
// prompts render and can be answered in the tab. The sentinel handshake line flips the channel to
// `attached`, after which every byte is a frame.
//
// The transport is injected rather than spawned here so the state machine can be driven over a fake
// PTY in tests; `RemoteManager` supplies the real one (an `ssh -t … janus remote-serve` PTY).
export type ChannelTransport = {
  id: string;
  write: (data: string) => void;
  kill: () => void;
};

export type NavigatorListener = {
  onReply: (frame: Extract<ServerFrame, { type: 'filesystem-reply' }>) => void;
  onEvent: (path: string) => void;
  onClose?: () => void;
};

// The frames that belong to the tab rather than to one process's I/O: the provisioning answer (a
// ready workspace, a failed one, or a refused label), the transcript pushes, and the browser-gone
// report. Everything else inbound is routed to a `SessionListener` instead. `browser-exited` carries
// a session id but is not that session's output — the tab it names is resolved by the manager,
// since joined tabs share a channel.
export type ChannelFrame = Extract<ServerFrame, { type: 'workspace-ready' | 'workspace-failed' | 'name-in-use' | 'transcript' | 'browser-exited' | 'attach-result' | 'session-state-result' }>;

export type RemoteChannelHandlers = {
  // Bytes produced before the handshake — ssh's banner, motd, and authentication prompts.
  onTerminalData: (data: string) => void;
  onAttached: (handshake: RemoteHandshake) => void;
  onFrame: (frame: ChannelFrame) => void;
  // A protocol-level fault (a version mismatch, a frame outside the union). Closes the channel.
  onError: (message: string) => void;
  onClose: () => void;
  onSessionExit?: (id: string, label: string | undefined, harness: boolean) => void;
  // The set of processes this channel has spawned changed — a `spawn` went out, or a `kill` did.
  // What makes a session recordable is having something running in its workspace, so this is the
  // moment a launch becomes attachable. Per process, never per byte.
  onProcesses?: () => void;
  // The held-frame buffer overflowed and dropped its oldest frames. Reported through the same line
  // a truncated replay already has, since it is the same fact one layer further in.
  onTruncatedReplay?: () => void;
};
