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
  it.each([
    { type: 'attach', session: '12345678-1234-1234-1234-123456789abc' },
    { type: 'attach', session: '12345678-1234-1234-1234-123456789abc', restore: true },
    { type: 'attach', session: '12345678-1234-1234-1234-123456789abc', restore: false },
    { type: 'attach-result', accepted: true },
    { type: 'attach-result', accepted: false },
  ] as const)('round-trips $type', (frame) => { expect(roundTrip(frame)).toEqual(frame); });

  it.each([
    { type: 'attach', session: '../../elsewhere' }, { type: 'attach' },
    { type: 'attach', session: '12345678-1234-1234-1234-123456789abc', restore: 'true' },
    { type: 'attach-result', accepted: 'true' }, { type: 'attach-result' },
  ])('rejects malformed attachment %j', (frame) => {
    expect(decodeFrame(JSON.stringify(frame))).toEqual({ error: expect.stringContaining('Malformed') });
  });
  // The two rejections are not the same fact. A line that is not a JSON object came off the far
  // side's stderr, which `ssh -t` folds into this stream; a JSON object the union does not admit is
  // the two ends disagreeing about the contract.
  it.each([
    "Unhandled pty write error [Error: EIO: i/o error, write] { errno: -5, code: 'EIO' }",
    'Warning: Permanently added devbox to the list of known hosts.',
    '"a bare json string"',
    '[1, 2, 3]',
    '',
  ])('marks far-side output as stray: %s', (line) => {
    expect(decodeFrame(line)).toMatchObject({ stray: true });
  });

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
      {
        type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', harness: 'claude',
        cols: 100, rows: 40, agentName: 'joined', autoApprove: true,
      },
      { type: 'input', id: 'r1', data: 'hello' },
      { type: 'resize', id: 'r1', cols: 120, rows: 50 },
      { type: 'kill', id: 'r1' },
      { type: 'capture-request', session: '12345678-1234-1234-1234-123456789abc', id: 'r1', request: 'q1' },
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
      {
        type: 'workspace-ready', dir: '/srv/proj/.janissary/workspace/claude', notice: 'isolation on',
        cleaned: '/srv/proj/.janissary/workspace/claude',
      },
      { type: 'workspace-failed', message: 'no origin' },
      { type: 'name-in-use', label: 'claude' },
      { type: 'name-in-use', label: 'claude', path: '/srv/proj/.janissary/workspace/claude', reason: 'EACCES: permission denied' },
      { type: 'output', id: 'r1', data: 'done' },
      { type: 'exit', id: 'r1', exitCode: 0 },
      { type: 'transcript', blocks: ['first', 'second'] },
      {
        type: 'shell-history', id: 'agent',
        runs: [
          { source: 'input', text: '{ :; ls\n} 2>&1; echo "__JS_END_3_1__"\n' },
          { source: 'output', text: 'web\n__JS_END_3_1__\n' },
        ],
      },
      { type: 'shell-history', id: 'agent', runs: [] },
      { type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1_700_000_000_000, capture: 'the screen text' },
      { type: 'gate-event', id: 'r1', message: 'Auto-approve could not clear the permission prompt; standing down', capturedAt: 1_700_000_000_000 },
      { type: 'busy-transition', id: 'r1', busy: true, unread: false },
      { type: 'busy-transition', id: 'r1', busy: false, unread: true },
      { type: 'capture-reply', id: 'r1', request: 'q1', text: 'the screen text', capturedAt: 1_700_000_000_000 },
      { type: 'capture-reply', id: 'r1', request: 'q1' },
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

  it('rejects a line that is not JSON, marking it as the far side\'s own output', () => {
    expect(decodeFrame('not json at all'))
      .toEqual({ error: expect.stringContaining('Malformed remote frame'), stray: true });
  });

  it('rejects a line that is JSON but not an object, marking it the same way', () => {
    expect(decodeFrame('[1,2,3]')).toEqual({ error: expect.stringContaining('Malformed remote frame'), stray: true });
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
    ['spawn with a non-boolean autoApprove flag', { type: 'spawn', id: 'r1', program: 'bash', command: 'bash', mode: 'pty', cols: 80, rows: 24, autoApprove: 'yes' }],
    ['capture-request without a session', { type: 'capture-request', id: 'r1' }],
    ['capture-request with a malformed session', { type: 'capture-request', session: 'not-a-uuid', id: 'r1' }],
    ['capture-request without an id', { type: 'capture-request', session: '12345678-1234-1234-1234-123456789abc' }],
    ['capture-reply with text but no capturedAt', { type: 'capture-reply', id: 'r1', text: 'x' }],
    ['capture-reply with capturedAt but no text', { type: 'capture-reply', id: 'r1', capturedAt: 1 }],
    ['capture-reply with a non-string text', { type: 'capture-reply', id: 'r1', text: 7, capturedAt: 1 }],
    ['capture-reply with a non-integer capturedAt', { type: 'capture-reply', id: 'r1', text: 'x', capturedAt: 1.5 }],
    ['capture-reply with an out-of-range capturedAt', { type: 'capture-reply', id: 'r1', text: 'x', capturedAt: 1e16 }],
    ['gate-event without an id', { type: 'gate-event', message: 'x', capturedAt: 1 }],
    ['gate-event without a message', { type: 'gate-event', id: 'r1', capturedAt: 1 }],
    ['gate-event without a capturedAt', { type: 'gate-event', id: 'r1', message: 'x' }],
    ['gate-event with a non-integer capturedAt', { type: 'gate-event', id: 'r1', message: 'x', capturedAt: 1.5 }],
    ['gate-event with an out-of-range capturedAt', { type: 'gate-event', id: 'r1', message: 'x', capturedAt: 1e16 }],
    ['gate-event with a non-string capture', { type: 'gate-event', id: 'r1', message: 'x', capturedAt: 1, capture: 7 }],
    ['busy-transition without an id', { type: 'busy-transition', busy: true, unread: false }],
    ['busy-transition with a non-boolean busy flag', { type: 'busy-transition', id: 'r1', busy: 'yes', unread: false }],
    ['busy-transition with a non-boolean unread flag', { type: 'busy-transition', id: 'r1', busy: true, unread: 'no' }],
    ['browser-exited without an id', { type: 'browser-exited' }],
    ['browser-exited with an empty id', { type: 'browser-exited', id: '' }],
    ['browser-exited with an empty message', { type: 'browser-exited', id: 'r1', message: '' }],
    ['browser-exited with a non-string message', { type: 'browser-exited', id: 'r1', message: 7 }],
    ['input without string data', { type: 'input', id: 'r1', data: 1 }],
    ['resize with a zero column count', { type: 'resize', id: 'r1', cols: 0, rows: 24 }],
    ['resize with a fractional row count', { type: 'resize', id: 'r1', cols: 80, rows: 2.5 }],
    ['kill without a string id', { type: 'kill', id: 1 }],
    ['workspace-ready without a directory', { type: 'workspace-ready' }],
    ['workspace-ready with a non-string notice', { type: 'workspace-ready', dir: '/srv/ws', notice: false }],
    ['workspace-ready with an empty cleaned path', { type: 'workspace-ready', dir: '/srv/ws', cleaned: '' }],
    ['workspace-ready with a non-string cleaned path', { type: 'workspace-ready', dir: '/srv/ws', cleaned: 1 }],
    ['workspace-failed without a message', { type: 'workspace-failed' }],
    ['name-in-use without a label', { type: 'name-in-use' }],
    ['name-in-use with an empty label', { type: 'name-in-use', label: '' }],
    ['name-in-use with a path but no reason', { type: 'name-in-use', label: 'claude', path: '/srv/ws/claude' }],
    ['name-in-use with a reason but no path', { type: 'name-in-use', label: 'claude', reason: 'EACCES' }],
    ['name-in-use with a non-string reason', { type: 'name-in-use', label: 'claude', path: '/srv/ws/claude', reason: 7 }],
    ['output without string data', { type: 'output', id: 'r1', data: [] }],
    ['exit with a fractional code', { type: 'exit', id: 'r1', exitCode: 1.5 }],
    ['transcript with a non-string block', { type: 'transcript', blocks: ['b25l', 2] }],
    ['shell-history without an id', { type: 'shell-history', runs: [] }],
    ['shell-history without a runs list', { type: 'shell-history', id: 'agent' }],
    ['shell-history with an unknown run source', { type: 'shell-history', id: 'agent', runs: [{ source: 'echo', text: 'bHM=' }] }],
    ['shell-history with a non-string run text', { type: 'shell-history', id: 'agent', runs: [{ source: 'input', text: 7 }] }],
    ['shell-history with a non-object run', { type: 'shell-history', id: 'agent', runs: ['bHM='] }],
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

  // The message is the confined browser's own output, so it carries newlines. JSON escaping is what
  // keeps that from being read as the end of a frame.
  it('round-trips a browser-exited frame carrying a multi-line message', () => {
    const message = 'e2e browser exited\nbrowserType.launchServer: Executable doesn\'t exist';
    const encoded = encodeFrame({ type: 'browser-exited', id: 'r1', message });
    expect(encoded).not.toContain('\n');
    expect(decodeFrame(encoded)).toEqual({ type: 'browser-exited', id: 'r1', message });
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

describe('session-state frames', () => {
  it('round-trips the query', () => {
    expect(roundTrip({ type: 'session-state' })).toEqual({ type: 'session-state' });
  });

  it('round-trips an answer describing a harness and an agent shell', () => {
    const frame = {
      type: 'session-state-result',
      processes: [
        { id: 'spawn-1', program: 'claude', mode: 'pty', harness: 'claude' },
        { id: 'spawn-2', program: 'bash', mode: 'pipe', agentName: 'bekir' },
      ],
    } as const;
    expect(roundTrip(frame)).toEqual(frame);
  });

  it('round-trips an empty answer, which is a peer holding nothing', () => {
    const frame = { type: 'session-state-result', processes: [] } as const;
    expect(roundTrip(frame)).toEqual(frame);
  });

  it.each([
    { what: 'a missing process list', record: { type: 'session-state-result' } },
    { what: 'a process list that is not an array', record: { type: 'session-state-result', processes: {} } },
    {
      what: 'an empty spawn id',
      record: { type: 'session-state-result', processes: [{ id: '', program: 'claude', mode: 'pty' }] },
    },
    {
      what: 'a mode outside the declared values',
      record: { type: 'session-state-result', processes: [{ id: 'a', program: 'claude', mode: 'tty' }] },
    },
    {
      what: 'a process that is not an object',
      record: { type: 'session-state-result', processes: ['spawn-1'] },
    },
  ])('refuses $what by name', ({ record }) => {
    expect(decodeFrame(JSON.stringify(record))).toEqual({
      error: expect.stringContaining('Malformed remote frame "session-state-result"'),
    });
  });

  // One malformed entry makes the whole answer malformed: a silently shortened list is
  // indistinguishable from a process that exited, and an empty one ends the session.
  it('refuses the whole answer when one entry among several is malformed', () => {
    const record = {
      type: 'session-state-result',
      processes: [{ id: 'spawn-1', program: 'claude', mode: 'pty' }, { id: 'spawn-2', mode: 'pipe' }],
    };
    expect(decodeFrame(JSON.stringify(record))).toEqual({
      error: expect.stringContaining('Malformed remote frame "session-state-result"'),
    });
  });
});

// Keyed by every frame type and mapped over the union, so the compiler demands a fixture for each new
// frame type. Each fixture fills every optional field its frame declares, which is what catches a
// hand-written decoder that validates a field and then forgets to copy it into the decoded frame.
// `filesystem-reply` carries `result` here because it and `error` are mutually exclusive; the error
// form has its own case below.
const FULLY_POPULATED_FRAMES: { [K in RemoteFrame['type']]: Extract<RemoteFrame, { type: K }> } = {
  'attach': {
    type: 'attach', session: '12345678-1234-1234-1234-123456789abc', restore: true, origin: 'git@github.com:owner/repo.git',
  },
  'session-state': { type: 'session-state' },
  'shutdown': { type: 'shutdown' },
  'provision': {
    type: 'provision', label: 'claude', tokens: { github: 'github_pat_scoped' },
    identity: { name: 'Ada Lovelace', email: 'ada@example.com' }, origin: 'git@github.com:owner/repo.git',
  },
  'clone-answer': { type: 'clone-answer', accept: true },
  'spawn': {
    type: 'spawn', id: 'r1', program: 'claude', command: 'claude', mode: 'pty', harness: 'claude',
    cols: 100, rows: 40, offline: true, agentName: 'joined', browser: true, autoApprove: true,
  },
  'input': { type: 'input', id: 'r1', data: 'hello' },
  'resize': { type: 'resize', id: 'r1', cols: 120, rows: 50 },
  'kill': { type: 'kill', id: 'r1' },
  'capture-request': {
    type: 'capture-request', session: '12345678-1234-1234-1234-123456789abc', id: 'r1', request: 'q1',
    origin: 'git@github.com:owner/repo.git',
  },
  'filesystem-open': { type: 'filesystem-open', session: 'files1' },
  'filesystem-close': { type: 'filesystem-close', session: 'files1' },
  'filesystem-request': {
    type: 'filesystem-request', session: 'files1', request: 'q1', operation: 'write-file',
    args: { path: 'notes.txt', content: 'héllo\nworld' },
  },
  'acp-open': {
    type: 'acp-open', id: 'racp1', command: 'opencode', args: ['acp'], env: { A: '1' }, offline: true,
  },
  'acp-prompt': { type: 'acp-prompt', id: 'racp1', text: 'summarize this project' },
  'acp-close': { type: 'acp-close', id: 'racp1' },
  'attach-result': { type: 'attach-result', accepted: true, truncated: true },
  'session-state-result': {
    type: 'session-state-result',
    processes: [{ id: 'spawn-1', program: 'claude', mode: 'pty', harness: 'claude', autoApprove: true, agentName: 'bekir' }],
  },
  'workspace-ready': {
    type: 'workspace-ready', dir: '/srv/ws/claude', notice: 'isolation on', cleaned: '/srv/ws/claude',
    cloned: { url: 'https://github.com/owner/repo.git', path: '/home/ada/repo' },
  },
  'clone-offer': { type: 'clone-offer', path: '/home/ada/repo', url: 'https://github.com/owner/repo.git', home: '/home/ada' },
  'root-refused': {
    type: 'root-refused',
    refusal: { kind: 'clone-failed', path: '/srv/proj', url: 'https://github.com/owner/repo.git', reason: 'fatal: denied' },
  },
  'workspace-failed': { type: 'workspace-failed', message: 'no origin' },
  'name-in-use': { type: 'name-in-use', label: 'claude', path: '/srv/ws/claude', reason: 'EACCES' },
  'output': { type: 'output', id: 'r1', data: 'done' },
  'exit': { type: 'exit', id: 'r1', exitCode: 1 },
  'browser-exited': { type: 'browser-exited', id: 'r1', message: 'e2e browser exited' },
  'transcript': { type: 'transcript', blocks: ['first'] },
  'shell-history': { type: 'shell-history', id: 'agent', runs: [{ source: 'input', text: 'ls\n' }] },
  'gate-event': { type: 'gate-event', id: 'r1', message: 'Auto-approved', capturedAt: 1_700_000_000_000, capture: 'screen' },
  'busy-transition': { type: 'busy-transition', id: 'r1', busy: true, unread: true },
  'capture-reply': { type: 'capture-reply', id: 'r1', request: 'q1', text: 'screen', capturedAt: 1_700_000_000_000 },
  'filesystem-reply': { type: 'filesystem-reply', session: 'files1', request: 'q1', result: { content: 'héllo' } },
  'filesystem-event': { type: 'filesystem-event', session: 'files1', path: 'src' },
  'acp-ready': { type: 'acp-ready', id: 'racp1' },
  'acp-chunk': { type: 'acp-chunk', id: 'racp1', text: 'partial reply' },
  'acp-end': { type: 'acp-end', id: 'racp1', stopReason: 'end_turn' },
  'acp-error': { type: 'acp-error', id: 'racp1', message: 'rate limited', fatal: false },
};

describe('optional frame fields', () => {
  it.each(Object.values(FULLY_POPULATED_FRAMES))('keeps every optional field of $type', (frame) => {
    expect(roundTrip(frame)).toEqual(frame);
  });

  it('keeps the error of a filesystem-reply that carries one', () => {
    const frame: RemoteFrame = { type: 'filesystem-reply', session: 'files1', request: 'q1', error: 'EACCES' };
    expect(roundTrip(frame)).toEqual(frame);
  });

  it('refuses a session-state-result process whose autoApprove is not a boolean', () => {
    const record = {
      type: 'session-state-result',
      processes: [{ id: 'spawn-1', program: 'claude', mode: 'pty', harness: 'claude', autoApprove: 'yes' }],
    };
    expect(decodeFrame(JSON.stringify(record))).toEqual({
      error: expect.stringContaining('Malformed remote frame "session-state-result"'),
    });
  });
});

describe('root settling frames', () => {
  it.each([
    { kind: 'not-found', path: '/srv/proj' },
    { kind: 'no-repository-found', path: '/home/ada' },
    { kind: 'not-repository', path: '/srv/proj' },
    { kind: 'no-origin', path: '/srv/proj' },
    { kind: 'different-origin', path: '/srv/proj', other: 'git@github.com:o/other.git', url: 'git@github.com:o/repo.git' },
    { kind: 'occupied', path: '/home/ada/repo' },
    { kind: 'no-repo-name', path: '/home/ada', url: 'https://github.com' },
    { kind: 'declined', path: '/srv/proj', url: 'https://github.com/o/repo.git' },
  ] as const)('round-trips a $kind refusal', (refusal) => {
    expect(roundTrip({ type: 'root-refused', refusal })).toEqual({ type: 'root-refused', refusal });
  });

  it('round-trips the offer without a home and the frames without their optional fields', () => {
    for (const frame of [
      { type: 'clone-offer', path: '/srv/proj', url: 'git@github.com:o/repo.git' },
      { type: 'clone-answer', accept: false },
      { type: 'provision', label: 'claude' },
      { type: 'workspace-ready', dir: '/srv/ws' },
    ] as const) expect(roundTrip(frame)).toEqual(frame);
  });

  it('drops a field the refusal kind does not carry', () => {
    const line = JSON.stringify({ type: 'root-refused', refusal: { kind: 'occupied', path: '/p', url: 'u' } });
    expect(decodeFrame(line)).toEqual({ type: 'root-refused', refusal: { kind: 'occupied', path: '/p' } });
  });

  it.each([
    ['clone-offer without a url', { type: 'clone-offer', path: '/srv/proj' }],
    ['clone-offer with an empty home', { type: 'clone-offer', path: '/srv/proj', url: 'u', home: '' }],
    ['clone-answer with a non-boolean accept', { type: 'clone-answer', accept: 'yes' }],
    ['root-refused with an unknown kind', { type: 'root-refused', refusal: { kind: 'exploded', path: '/p' } }],
    ['root-refused without a path', { type: 'root-refused', refusal: { kind: 'not-found' } }],
    ['root-refused missing a field its kind carries', { type: 'root-refused', refusal: { kind: 'clone-failed', path: '/p', url: 'u' } }],
    ['root-refused with no refusal', { type: 'root-refused' }],
    ['provision with an empty origin', { type: 'provision', label: 'claude', origin: '' }],
    ['provision with a non-string origin', { type: 'provision', label: 'claude', origin: 7 }],
    ['attach with an empty origin', { type: 'attach', session: '12345678-1234-1234-1234-123456789abc', origin: '' }],
    ['attach with a non-string origin', { type: 'attach', session: '12345678-1234-1234-1234-123456789abc', origin: 7 }],
    ['capture-request with an empty origin', {
      type: 'capture-request', session: '12345678-1234-1234-1234-123456789abc', id: 'r1', request: 'q1', origin: '',
    }],
    ['capture-request with a non-string origin', {
      type: 'capture-request', session: '12345678-1234-1234-1234-123456789abc', id: 'r1', request: 'q1', origin: 7,
    }],
    ['workspace-ready with a cloned record missing its path', { type: 'workspace-ready', dir: '/w', cloned: { url: 'u' } }],
    ['workspace-ready with a non-record cloned', { type: 'workspace-ready', dir: '/w', cloned: '/p' }],
  ])('refuses %s', (_name, record) => {
    expect(decodeFrame(JSON.stringify(record))).toEqual({ error: expect.stringContaining('Malformed remote frame') });
  });
});

describe('protocol version', () => {
  // Pinned as a literal so a frame added without its bump is a failing test rather than two hosts
  // agreeing on a version number while disagreeing about what it covers.
  it('is 21', () => {
    expect(REMOTE_PROTOCOL_VERSION).toBe(21);
  });
});

// The records are keyed by the frame unions, so the compiler already refuses an entry the union does
// not declare and demands one for every member it does. The edit it cannot see is a member and its
// entry deleted together — the contract silently shrinking — which is what these pin.
describe('admitted frame types', () => {
  it('admits exactly the declared client frame types', () => {
    expect(Object.keys(CLIENT_FRAME_TYPES).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'acp-close', 'acp-open', 'acp-prompt', 'attach', 'capture-request', 'clone-answer',
      'filesystem-close', 'filesystem-open', 'filesystem-request',
      'input', 'kill', 'provision', 'resize', 'session-state', 'shutdown', 'spawn',
    ]);
  });

  it('admits exactly the declared server frame types', () => {
    expect(Object.keys(SERVER_FRAME_TYPES).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'acp-chunk', 'acp-end', 'acp-error', 'acp-ready', 'attach-result', 'browser-exited',
      'busy-transition', 'capture-reply', 'clone-offer', 'exit', 'filesystem-event', 'filesystem-reply', 'gate-event', 'name-in-use',
      'output', 'root-refused', 'session-state-result', 'shell-history', 'transcript', 'workspace-failed', 'workspace-ready',
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
    // `shutdown` and `session-state` carry no fields at all — one workspace per peer leaves nothing
    // to address — so they are the two types that decode cleanly on their own.
    const payloadFree = new Set(['shutdown', 'session-state']);
    for (const type of admitted) {
      if (payloadFree.has(type)) { expect(decodeFrame(JSON.stringify({ type }))).toEqual({ type }); continue; }
      expect(decodeFrame(JSON.stringify({ type }))).toEqual({
        error: expect.stringContaining(`Malformed remote frame "${type}"`),
      });
    }
  });
});

describe('handshake', () => {
  // The root is settled after the handshake, by the first `provision` or `attach`, so the line
  // cannot carry it.
  it('announces the sentinel and this build\'s version, and no root', () => {
    const line = encodeHandshake();
    expect(line.startsWith(HANDSHAKE_SENTINEL)).toBe(true);
    expect(line).not.toContain('root');
    expect(parseHandshake(line)).toEqual({ version: REMOTE_PROTOCOL_VERSION });
  });

  it('parses a handshake preceded by terminal output on the same line', () => {
    expect(parseHandshake(`motd tail ${encodeHandshake()}`)).toEqual({ version: REMOTE_PROTOCOL_VERSION });
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
  // `chromium.connect` inside it fails with nothing to point at. Version 12 does not know the
  // `git-commit` filesystem operation, so the navigator's commit button would fail there.
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('rejects a remote speaking older protocol version %i', (version) => {
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
