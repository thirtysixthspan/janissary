import { describe, it, expect } from 'vitest';
import {
  REMOTE_PROTOCOL_VERSION, HANDSHAKE_SENTINEL,
  CLIENT_FRAME_TYPES, SERVER_FRAME_TYPES,
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
        identity: { name: 'Ada Lovelace', email: 'ada@example.com' },
      },
      { type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', harness: 'claude', cols: 100, rows: 40, agentName: 'joined' },
      { type: 'input', id: 'r1', data: 'hello' },
      { type: 'resize', id: 'r1', cols: 120, rows: 50 },
      { type: 'kill', id: 'r1' },
      { type: 'filesystem-open', session: 'files1' },
      { type: 'filesystem-close', session: 'files1' },
      { type: 'filesystem-request', session: 'files1', request: 'q1', operation: 'read-directory', args: { path: 'src' } },
      { type: 'filesystem-request', session: 'files1', request: 'q2', operation: 'write-file', args: { path: 'notes.txt', content: 'héllo\nworld' } },
      {
        type: 'filesystem-request', session: 'files1', request: 'q3', operation: 'replay',
        args: {
          undoStack: [{ entries: [{ from: 'a', to: 'dest/a' }] }], redoStack: [],
          direction: 'undo', overwrite: false, skipConflicts: false,
        },
      },
      {
        type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'],
        env: { OPENCODE_CONFIG_CONTENT: '{"model":"google/gemini-3.1-flash-lite"}' }, offline: false,
      },
      { type: 'acp-prompt', id: 'racp1', text: 'summarize this project' },
      { type: 'acp-close', id: 'racp1' },
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
      { type: 'filesystem-reply', session: 'files1', request: 'q1', result: { entries: [] } },
      { type: 'filesystem-reply', session: 'files1', request: 'q2', result: { content: 'héllo\nworld' } },
      { type: 'filesystem-event', session: 'files1', path: 'src' },
      { type: 'acp-ready', id: 'racp1' },
      { type: 'acp-chunk', id: 'racp1', text: 'partial reply' },
      { type: 'acp-end', id: 'racp1', stopReason: 'end_turn' },
      { type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false },
      { type: 'acp-error', id: 'racp1', message: 'ACP agent exited.', fatal: true },
    ];
    for (const frame of frames) expect(roundTrip(frame)).toEqual(frame);
  });

  it('carries a prompt and a reply chunk through the base64 path intact', () => {
    const text = '# heading\n\n```js\nconst x = `tick`;\n```\n\nnaïve — 🌍\n{"type":"kill"}';
    expect(roundTrip({ type: 'acp-prompt', id: 'racp1', text })).toEqual({ type: 'acp-prompt', id: 'racp1', text });
    expect(roundTrip({ type: 'acp-chunk', id: 'racp1', text })).toEqual({ type: 'acp-chunk', id: 'racp1', text });
    expect(encodeFrame({ type: 'acp-chunk', id: 'racp1', text })).not.toContain('\n');
  });

  // Ordinary, not a fault: an agent can stream an empty chunk, and refusing one would fail the
  // channel over nothing. An empty *prompt* never reaches the wire — `AcpManager.run` refuses it.
  it('accepts an empty reply chunk', () => {
    expect(roundTrip({ type: 'acp-chunk', id: 'racp1', text: '' }))
      .toEqual({ type: 'acp-chunk', id: 'racp1', text: '' });
  });

  it('accepts an acp-open carrying no env and no offline flag', () => {
    const frame: RemoteFrame = { type: 'acp-open', id: 'racp1', command: 'opencode', args: [] };
    expect(roundTrip(frame)).toEqual(frame);
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
    ['provision with a non-object identity', { type: 'provision', label: 'agent', identity: 'Ada Lovelace' }],
    ['provision with an array identity', { type: 'provision', label: 'agent', identity: ['Ada Lovelace'] }],
    ['provision with an unknown identity key', { type: 'provision', label: 'agent', identity: { handle: 'ada' } }],
    ['provision with a non-string identity value', { type: 'provision', label: 'agent', identity: { name: 42 } }],
    ['provision with an empty identity value', { type: 'provision', label: 'agent', identity: { name: '' } }],
    ['spawn without an id', { type: 'spawn', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with an empty program', { type: 'spawn', id: 'r1', program: '', command: 'bash', mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with a non-string command', { type: 'spawn', id: 'r1', program: 'bash', command: 1, mode: 'pty', cols: 80, rows: 24 }],
    ['spawn with an unknown mode', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'tty', cols: 80, rows: 24 }],
    ['spawn with a non-boolean offline flag', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24, offline: 'yes' }],
    ['spawn with a non-boolean browser flag', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24, browser: 'yes' }],
    ['browser-exited without an id', { type: 'browser-exited' }],
    ['browser-exited with an empty id', { type: 'browser-exited', id: '' }],
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
    ['filesystem request with an unknown operation', { type: 'filesystem-request', session: 'f1', request: 'q1', operation: 'unknown', args: {} }],
    ['filesystem request without a request id', { type: 'filesystem-request', session: 'f1', operation: 'search', args: {} }],
    ['filesystem request with malformed arguments', { type: 'filesystem-request', session: 'f1', request: 'q1', operation: 'rename', args: { path: 'a' } }],
    ['acp-open without an id', { type: 'acp-open', command: 'opencode', args: [] }],
    ['acp-open with an empty id', { type: 'acp-open', id: '', command: 'opencode', args: [] }],
    ['acp-open with an empty command', { type: 'acp-open', id: 'racp1', command: '', args: [] }],
    ['acp-open with a non-array args list', { type: 'acp-open', id: 'racp1', command: 'opencode', args: 'acp' }],
    ['acp-open with a non-string arg', { type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp', 7] }],
    ['acp-open with an array env', { type: 'acp-open', id: 'racp1', command: 'opencode', args: [], env: ['A=1'] }],
    ['acp-open with a null env', { type: 'acp-open', id: 'racp1', command: 'opencode', args: [], env: null }],
    ['acp-open with a non-string env value', { type: 'acp-open', id: 'racp1', command: 'opencode', args: [], env: { A: 1 } }],
    ['acp-open with a non-boolean offline flag', { type: 'acp-open', id: 'racp1', command: 'opencode', args: [], offline: 'yes' }],
    ['acp-prompt without an id', { type: 'acp-prompt', text: 'aGk=' }],
    ['acp-prompt without string text', { type: 'acp-prompt', id: 'racp1', text: 7 }],
    ['acp-close without an id', { type: 'acp-close' }],
    ['acp-ready without an id', { type: 'acp-ready' }],
    ['acp-chunk without string text', { type: 'acp-chunk', id: 'racp1', text: null }],
    ['acp-end without a stop reason', { type: 'acp-end', id: 'racp1' }],
    ['acp-end with an empty stop reason', { type: 'acp-end', id: 'racp1', stopReason: '' }],
    ['acp-error without a message', { type: 'acp-error', id: 'racp1', fatal: true }],
    ['acp-error without a fatal flag', { type: 'acp-error', id: 'racp1', message: 'gone' }],
    ['acp-error with a non-boolean fatal flag', { type: 'acp-error', id: 'racp1', message: 'gone', fatal: 'yes' }],
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

  it('round-trips a spawn frame carrying the browser flag', () => {
    const encoded = encodeFrame({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
      harness: 'claude', cols: 80, rows: 24, browser: true,
    });
    expect(decodeFrame(encoded)).toEqual({
      type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty',
      harness: 'claude', cols: 80, rows: 24, browser: true,
    });
  });

  it('round-trips a browser-exited frame', () => {
    expect(decodeFrame(encodeFrame({ type: 'browser-exited', id: 'r1' }))).toEqual({
      type: 'browser-exited', id: 'r1',
    });
  });

  it('drops undeclared filesystem arguments after validating the operation', () => {
    expect(decodeFrame(JSON.stringify({
      type: 'filesystem-request', session: 'files1', request: 'q1',
      operation: 'read-file', args: { path: 'src/a.txt', extra: 'ignored' },
    }))).toEqual({
      type: 'filesystem-request', session: 'files1', request: 'q1',
      operation: 'read-file', args: { path: 'src/a.txt' },
    });
  });

  // A provision that names neither keeps its shape rather than growing empty records, so a remote
  // that receives one can tell "sent nothing" from "sent nothing configured".
  it('leaves tokens and identity absent when the provision frame declares neither', () => {
    expect(decodeFrame(JSON.stringify({ type: 'provision', label: 'agent' })))
      .toEqual({ type: 'provision', label: 'agent' });
  });

  it('keeps the half of an identity the provision frame carries', () => {
    expect(decodeFrame(JSON.stringify({ type: 'provision', label: 'agent', identity: { email: 'ada@example.com' } })))
      .toEqual({ type: 'provision', label: 'agent', identity: { email: 'ada@example.com' } });
  });

  it('drops undeclared properties from an acp-open rather than forwarding them', () => {
    const encoded = JSON.stringify({
      type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'], cwd: '/somewhere/else', extra: 1,
    });
    expect(decodeFrame(encoded)).toEqual({ type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'] });
  });
});

// The records are keyed by the frame unions, so the compiler already refuses an entry the union does
// not declare and demands one for every member it does. The edit it cannot see is a member and its
// entry deleted together — the contract silently shrinking — which is what these pin.
describe('admitted frame types', () => {
  it('admits exactly the declared client frame types', () => {
    expect(Object.keys(CLIENT_FRAME_TYPES).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'acp-close', 'acp-open', 'acp-prompt',
      'filesystem-close', 'filesystem-open', 'filesystem-request',
      'input', 'kill', 'provision', 'resize', 'spawn',
    ]);
  });

  it('admits exactly the declared server frame types', () => {
    expect(Object.keys(SERVER_FRAME_TYPES).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'acp-chunk', 'acp-end', 'acp-error', 'acp-ready', 'browser-exited',
      'exit', 'filesystem-event', 'filesystem-reply', 'output',
      'transcript', 'workspace-failed', 'workspace-ready',
    ]);
  });

  it('keeps the two directions disjoint', () => {
    const client = Object.keys(CLIENT_FRAME_TYPES);
    expect(client.filter((type) => Object.hasOwn(SERVER_FRAME_TYPES, type))).toEqual([]);
  });

  it('decodes every admitted type rather than refusing one as unknown', () => {
    const admitted = [...Object.keys(CLIENT_FRAME_TYPES), ...Object.keys(SERVER_FRAME_TYPES)];
    // Each is sent with no fields, so every decoder rejects it as malformed — the point is that
    // none comes back as *unknown*, which is what an admitted-but-undecoded type would produce.
    for (const type of admitted) {
      expect(decodeFrame(JSON.stringify({ type }))).toEqual({
        error: expect.stringContaining(`Malformed remote frame "${type}"`),
      });
    }
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
  // Version 7 added workspace filesystem sessions and knows none of the ACP frames: it would refuse
  // each as unknown while the local tab sat waiting on a reply that never comes — accepting prompts
  // and answering nothing. Version 8 does not know the `git-pull` filesystem operation.
  // Version 9 does not know `provision`'s `identity`, and is the quietest failure of the set: it
  // provisions a workspace that looks entirely healthy and attributes every commit made in it to the
  // ssh destination's own account rather than to the user who opened janissary.
  // Version 10 answers a `git-pull` with no result. Version 11 ignores `spawn`'s `browser` flag: a
  // `-b` tab on that host comes up looking healthy with no browser variables set at all, so every
  // `chromium.connect` inside it fails with nothing to point at.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])('rejects a remote speaking older protocol version %i', (version) => {
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
