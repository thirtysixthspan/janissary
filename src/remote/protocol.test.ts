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
        type: 'provision', label: 'claude', githubToken: 'github_pat_scoped',
        claudeToken: 'sk-ant-oat01-scoped', opencodeToken: 'oc_live_scoped',
        geminiToken: 'AIzaSyScoped',
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

  // Version 1 is every installation predating token forwarding. Such a remote decodes the provision
  // frame happily and ignores its `githubToken`, so accepting it would mean a workspace that runs
  // fine and cannot push — refusing it at the handshake is the point of the bump to 2.
  it('rejects a remote too old to honor the forwarded GitHub token', () => {
    const parsed = parseHandshake(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: 1, root: '/srv/proj' })}`);
    expect(parsed).toEqual({ error: expect.stringContaining('Update janissary') });
    expect('error' in parsed && parsed.error).toContain(String(REMOTE_PROTOCOL_VERSION));
  });

  // Version 2 honors `githubToken` but drops `claudeToken`, which on a host with no Keychain means
  // a harness that reports itself logged out rather than one that cannot push. Same reasoning, same
  // refusal — the bump to 3 is what makes it visible at the handshake instead of at first use.
  it('rejects a remote too old to honor the forwarded Claude token', () => {
    const parsed = parseHandshake(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: 2, root: '/srv/proj' })}`);
    expect(parsed).toEqual({ error: expect.stringContaining('Update janissary') });
    expect('error' in parsed && parsed.error).toContain(String(REMOTE_PROTOCOL_VERSION));
  });

  // Version 3 honors both earlier tokens and drops `opencodeToken`, leaving an opencode harness on
  // a host with no login of its own with nothing to authenticate with. Third field, same refusal.
  it('rejects a remote too old to honor the forwarded OpenCode key', () => {
    const parsed = parseHandshake(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: 3, root: '/srv/proj' })}`);
    expect(parsed).toEqual({ error: expect.stringContaining('Update janissary') });
    expect('error' in parsed && parsed.error).toContain(String(REMOTE_PROTOCOL_VERSION));
  });

  // Version 4 honors the first three tokens and drops `geminiToken`, so a workspace whose Google
  // provider is the one that matters provisions and cannot authenticate. Fourth field, same refusal.
  it('rejects a remote too old to honor the forwarded Gemini key', () => {
    const parsed = parseHandshake(`${HANDSHAKE_SENTINEL} ${JSON.stringify({ version: 4, root: '/srv/proj' })}`);
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
