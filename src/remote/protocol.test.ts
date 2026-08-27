import { describe, it, expect } from 'vitest';
import {
  REMOTE_PROTOCOL_VERSION, HANDSHAKE_SENTINEL,
  encodeFrame, decodeFrame, encodeHandshake, parseHandshake, heldBackLength,
  type RemoteFrame,
} from './protocol.js';

function roundTrip(frame: RemoteFrame): RemoteFrame | { error: string } {
  return decodeFrame(encodeFrame(frame));
}

describe('frame codec', () => {
  it('round-trips every client frame', () => {
    const frames: RemoteFrame[] = [
      {
        type: 'provision',
        label: 'claude',
        tokens: {
          github: 'github_pat_scoped',
          claude: 'sk-ant-oat01-scoped',
          opencode: 'oc_live_scoped',
          gemini: 'AIzaSyScoped',
        },
      },
      { type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', harness: 'claude', cols: 100, rows: 40 },
      { type: 'input', id: 'r1', data: 'hello' },
      { type: 'resize', id: 'r1', cols: 120, rows: 50 },
      { type: 'kill', id: 'r1' },
    ];
    for (const frame of frames) expect(roundTrip(frame)).toEqual(frame);
  });

  it('round-trips every server frame', () => {
    const frames: RemoteFrame[] = [
      { type: 'workspace-ready', dir: '/srv/proj/.janissary/workspace/claude' },
      { type: 'workspace-failed', message: 'no origin' },
      { type: 'output', id: 'r1', data: 'done' },
      { type: 'exit', id: 'r1', exitCode: 0 },
      { type: 'transcript', blocks: ['first', 'second'] },
    ];
    for (const frame of frames) expect(roundTrip(frame)).toEqual(frame);
  });

  // Base64 is the whole reason the payload can't be mistaken for framing.
  it('carries terminal control bytes and embedded newlines through intact', () => {
    const data = '[2J[H first\nsecond\r\n{"type":"kill"}\n';
    expect(roundTrip({ type: 'output', id: 'r1', data })).toEqual({ type: 'output', id: 'r1', data });
  });

  it('never lets an encoded frame contain a newline of its own', () => {
    const encoded = encodeFrame({ type: 'output', id: 'r1', data: 'one\ntwo\nthree' });
    expect(encoded).not.toContain('\n');
  });

  it('carries a multi-line transcript block through intact', () => {
    const blocks = ['# heading\n\nbody line\n', 'second\nblock'];
    expect(roundTrip({ type: 'transcript', blocks })).toEqual({ type: 'transcript', blocks });
  });

  it('rejects a frame with an unknown type rather than ignoring it', () => {
    expect(decodeFrame(JSON.stringify({ type: 'exec', id: 'r1' }))).toEqual({
      error: expect.stringContaining('Unknown remote frame type "exec"'),
    });
  });

  it('rejects a frame carrying no type at all', () => {
    expect(decodeFrame(JSON.stringify({ id: 'r1' }))).toEqual({
      error: expect.stringContaining('Unknown remote frame type'),
    });
  });

  it('rejects a line that is not JSON', () => {
    expect(decodeFrame('not json at all')).toEqual({ error: expect.stringContaining('Malformed remote frame') });
  });

  it('rejects a line that is JSON but not an object', () => {
    expect(decodeFrame('[1,2,3]')).toEqual({ error: expect.stringContaining('Malformed remote frame') });
  });

  it.each([
    ['provision without a label', { type: 'provision' }],
    ['provision with an unknown token', { type: 'provision', label: 'agent', tokens: { other: 'secret' } }],
    ['provision with a non-string token', { type: 'provision', label: 'agent', tokens: { github: 42 } }],
    ['spawn without an id', { type: 'spawn', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with an empty program', { type: 'spawn', id: 'r1', program: '', command: 'bash', mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with a non-string command', { type: 'spawn', id: 'r1', program: 'bash', command: 1, mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with an unknown mode', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'tty', cols: 80, rows: 24 }],
    ['spawn with a non-boolean offline flag', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24, offline: 'yes' }],
    ['input without string data', { type: 'input', id: 'r1', data: 1 }],
    ['resize with a zero column count', { type: 'resize', id: 'r1', cols: 0, rows: 24 }],
    ['resize with a fractional row count', { type: 'resize', id: 'r1', cols: 80, rows: 2.5 }],
    ['kill without a string id', { type: 'kill', id: 1 }],
    ['workspace-ready without a directory', { type: 'workspace-ready' }],
    ['workspace-ready with a non-string notice', { type: 'workspace-ready', dir: '/srv/ws', notice: false }],
    ['workspace-failed without a message', { type: 'workspace-failed' }],
    ['output without string data', { type: 'output', id: 'r1', data: [] }],
    ['exit with a fractional code', { type: 'exit', id: 'r1', exitCode: 1.5 }],
    ['transcript with a non-string block', { type: 'transcript', blocks: ['b25l', 2] }],
  ])('rejects %s', (_case, frame) => {
    expect(decodeFrame(JSON.stringify(frame))).toEqual({
      error: expect.stringContaining(`Malformed remote frame "${String(frame.type)}"`),
    });
  });

  it('preserves valid optional fields and drops undeclared properties', () => {
    const encoded = JSON.stringify({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe',
      harness: 'claude', cols: 80, rows: 24, offline: false, extra: 'ignored',
    });
    expect(decodeFrame(encoded)).toEqual({
      type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pipe',
      harness: 'claude', cols: 80, rows: 24, offline: false,
    });
  });
});

describe('handshake', () => {
  it('announces the sentinel, this build\'s version, and the resolved root', () => {
    const line = encodeHandshake('/srv/proj');
    expect(line.startsWith(HANDSHAKE_SENTINEL)).toBe(true);
    expect(parseHandshake(line)).toEqual({ version: REMOTE_PROTOCOL_VERSION, root: '/srv/proj' });
  });

  it('parses a handshake preceded by terminal output on the same line', () => {
    expect(parseHandshake(`motd tail ${encodeHandshake('/srv/proj')}`)).toEqual({
      version: REMOTE_PROTOCOL_VERSION, root: '/srv/proj',
    });
  });

  it('rejects a mismatched protocol version, naming both versions', () => {
    const line = `${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: REMOTE_PROTOCOL_VERSION + 1, root: '/srv/proj' })}`;
    const parsed = parseHandshake(line);
    expect(parsed).toEqual({ error: expect.stringContaining(String(REMOTE_PROTOCOL_VERSION + 1)) });
    expect('error' in parsed && parsed.error).toContain(String(REMOTE_PROTOCOL_VERSION));
  });

  // Versions 1 through 5 each carried one more named token field on `provision`; version 6 replaced
  // all of them with a `tokens` map. A remote speaking any of them decodes the frame happily and
  // finds none of the fields it reads, so it would provision a workspace with no credentials at all
  // — which is what refusing at the handshake exists to prevent, for every one of them.
  it.each([1, 2, 3, 4, 5])('rejects a remote speaking older protocol version %i', (version) => {
    const parsed = parseHandshake(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version, root: '/srv/proj' })}`);
    expect(parsed).toEqual({ error: expect.stringContaining('Update janissary') });
    expect('error' in parsed && parsed.error).toContain(String(REMOTE_PROTOCOL_VERSION));
  });

  it('rejects a malformed handshake payload', () => {
    expect(parseHandshake(`${HANDSHAKE_SENTINEL} {oops`)).toEqual({
      error: expect.stringContaining('Malformed remote handshake'),
    });
  });
});

describe('heldBackLength', () => {
  it('holds nothing back for ordinary terminal output', () => {
    expect(heldBackLength('admin@devbox\'s password: ')).toBe(0);
  });

  it('holds back exactly the tail that could be the sentinel split across two reads', () => {
    expect(heldBackLength(`ready\n${HANDSHAKE_SENTINEL.slice(0, 5)}`)).toBe(5);
  });

  it('holds nothing back for a tail that only resembles the sentinel', () => {
    expect(heldBackLength('__JANUS_OTHER')).toBe(0);
  });
});
