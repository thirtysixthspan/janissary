import type { RemoteFrame } from './protocol-frames.js';

// One field's binary payload on the wire. `text` is one base64 string, `list` an array of them, and
// `records` an array of objects each carrying one base64 string in the field named by `inner`.
export type BinaryField =
  | { field: string; shape: 'text' }
  | { field: string; shape: 'list' }
  | { field: string; shape: 'records'; inner: string };

// Which fields of which frame travel base64-encoded, keyed by every frame type so a new frame with a
// binary field cannot silently skip encoding: the compiler demands an entry here, and `toWire` reads
// nothing outside it. A field absent on a frame is left alone, which is what keeps the conditional
// cases (an `acp-turn` end, an optional `capture` or `output`) encoded only when they are present.
export const BINARY_FIELDS: Record<RemoteFrame['type'], readonly BinaryField[]> = {
  // Client frames.
  attach: [],
  'session-state': [],
  shutdown: [],
  provision: [],
  'clone-answer': [],
  spawn: [],
  input: [{ field: 'data', shape: 'text' }],
  resize: [],
  kill: [],
  'capture-request': [],
  'resume-ack': [],
  'filesystem-open': [],
  'filesystem-close': [],
  'filesystem-request': [],
  'agent-resolve': [],
  'run-clone': [],
  'acp-open': [],
  'acp-run': [{ field: 'text', shape: 'text' }],
  'acp-tool-result': [{ field: 'output', shape: 'text' }],
  'mcp-result': [{ field: 'text', shape: 'text' }],
  'acp-cancel': [],
  'acp-close': [],
  // Server frames.
  'attach-result': [],
  'session-state-result': [],
  'clone-offer': [],
  'root-refused': [],
  'workspace-ready': [],
  'workspace-failed': [],
  'name-in-use': [],
  output: [{ field: 'data', shape: 'text' }],
  exit: [],
  'browser-exited': [],
  'browser-started': [],
  transcript: [{ field: 'blocks', shape: 'list' }],
  'shell-history': [{ field: 'runs', shape: 'records', inner: 'text' }],
  'gate-event': [{ field: 'capture', shape: 'text' }],
  'busy-transition': [],
  'capture-reply': [{ field: 'text', shape: 'text' }],
  'resume-event': [{ field: 'capture', shape: 'text' }],
  'resume-cancel': [],
  'filesystem-reply': [],
  'filesystem-event': [],
  'agent-resolve-result': [],
  'run-clone-result': [],
  'acp-ready': [],
  'acp-session-started': [],
  'acp-chunk': [{ field: 'text', shape: 'text' }],
  'acp-turn': [{ field: 'display', shape: 'text' }],
  'acp-tool-request': [{ field: 'command', shape: 'text' }],
  'mcp-call': [{ field: 'args', shape: 'text' }],
  'mcp-cancel': [],
  'acp-tool-step': [
    { field: 'command', shape: 'text' },
    { field: 'result', shape: 'text' },
  ],
  'acp-run-end': [],
  'acp-activity': [{ field: 'text', shape: 'text' }],
  'acp-closed': [],
  'acp-error': [],
};
