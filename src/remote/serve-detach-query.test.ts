import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requestParkedCapture, answerCaptureRequest } from './serve-detach-query.js';
import { DetachedPeer } from './serve-detach.js';
import { encodeFrame } from './protocol.js';
import type { ServerFrame } from './protocol.js';

let root: string;

beforeEach(() => { root = mkdtempSync(path.join(tmpdir(), 'janus-detach-query-test-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

// A hand-built unix socket server, for the two cases a real `DetachedPeer` cannot produce: a
// reply written across two separate socket writes, and a peer that accepts the connection but
// never answers at all.
function fakePeer(onConnect: (write: (data: string) => void) => void): { session: string; close: () => void } {
  const socketDir = mkdtempSync(path.join(tmpdir(), 'janus-fake-peer-'));
  const socketPath = path.join(socketDir, 'peer.sock');
  const server: Server = createServer((socket) => onConnect((data) => socket.write(data)));
  server.listen(socketPath);
  const session = randomUUID();
  mkdirSync(path.join(root, '.janissary', 'remote'), { recursive: true });
  writeFileSync(path.join(root, '.janissary', 'remote', `${session}.json`), JSON.stringify({ socket: socketPath }));
  return { session, close: () => { server.close(); rmSync(socketDir, { recursive: true, force: true }); } };
}

describe('requestParkedCapture', () => {
  it('resolves with the text and timestamp from a live parked peer\'s reply', async () => {
    const peer = new DetachedPeer(root, randomUUID(), vi.fn(), vi.fn(), () => ({ text: 'screen text', capturedAt: 555 }));
    await peer.start(vi.fn());
    peer.detach();
    try {
      await expect(requestParkedCapture(root, peer.session, 'r1', 'q1')).resolves.toEqual({ text: 'screen text', capturedAt: 555 });
    } finally { peer.dispose(); }
  });

  it('resolves the same reply when it arrives split across two socket writes', async () => {
    const frame = encodeFrame({ type: 'capture-reply', id: 'r1', request: 'q1', text: 'split screen', capturedAt: 42 });
    const line = `${frame}\n`;
    const split = Math.floor(line.length / 2);
    const peer = fakePeer((write) => {
      write(line.slice(0, split));
      setTimeout(() => write(line.slice(split)), 5);
    });
    try {
      await expect(requestParkedCapture(root, peer.session, 'r1', 'q1')).resolves.toEqual({ text: 'split screen', capturedAt: 42 });
    } finally { peer.close(); }
  });

  it('resolves undefined without throwing when the record file does not exist', async () => {
    await expect(requestParkedCapture(root, randomUUID(), 'r1', 'q1')).resolves.toBeUndefined();
  });

  it('resolves undefined without throwing when the record file is not valid JSON', async () => {
    const session = randomUUID();
    mkdirSync(path.join(root, '.janissary', 'remote'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'remote', `${session}.json`), 'not json');
    await expect(requestParkedCapture(root, session, 'r1', 'q1')).resolves.toBeUndefined();
  });

  it('resolves undefined when the record\'s socket field is not a string', async () => {
    const session = randomUUID();
    mkdirSync(path.join(root, '.janissary', 'remote'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'remote', `${session}.json`), JSON.stringify({ socket: 42 }));
    await expect(requestParkedCapture(root, session, 'r1', 'q1')).resolves.toBeUndefined();
  });

  it('resolves undefined once the ten-second timeout fires, for a peer that never answers', async () => {
    // The socket's idle timeout runs through libuv rather than the global `setTimeout` fake timers
    // patch, so this waits out the real ten seconds rather than advancing a fake clock.
    const peer = fakePeer(() => { /* accepts the connection, answers nothing */ });
    try {
      await expect(requestParkedCapture(root, peer.session, 'r1', 'q1')).resolves.toBeUndefined();
    } finally { peer.close(); }
  }, 15_000);

  it('resolves undefined for a reply naming a different id than the one requested', async () => {
    const peer = fakePeer((write) => {
      write(`${encodeFrame({ type: 'capture-reply', id: 'someone-else', request: 'q1', text: 'x', capturedAt: 1 })}\n`);
    });
    try {
      await expect(requestParkedCapture(root, peer.session, 'r1', 'q1')).resolves.toBeUndefined();
    } finally { peer.close(); }
  });

  it('resolves undefined for a reply naming a different request than the one sent', async () => {
    const peer = fakePeer((write) => {
      write(`${encodeFrame({ type: 'capture-reply', id: 'r1', request: 'other-request', text: 'x', capturedAt: 1 })}\n`);
    });
    try {
      await expect(requestParkedCapture(root, peer.session, 'r1', 'q1')).resolves.toBeUndefined();
    } finally { peer.close(); }
  });
});

describe('answerCaptureRequest', () => {
  it('emits a capture-reply carrying latestCapture(id) when processes holds the live workspace', () => {
    const emitted: ServerFrame[] = [];
    const processes = { latestCapture: vi.fn(() => ({ text: 'live screen', capturedAt: 99 })) };
    answerCaptureRequest({ session: 's1', id: 'r1', request: 'q1' }, processes, root, (frame) => { emitted.push(frame); });
    expect(processes.latestCapture).toHaveBeenCalledWith('r1');
    expect(emitted).toEqual([{ type: 'capture-reply', id: 'r1', request: 'q1', text: 'live screen', capturedAt: 99 }]);
  });

  it('emits a capture-reply with no fields when processes has nothing captured for id', () => {
    const emitted: ServerFrame[] = [];
    const processes = { latestCapture: vi.fn(() => { /* nothing captured */ }) };
    answerCaptureRequest({ session: 's1', id: 'r1', request: 'q1' }, processes, root, (frame) => { emitted.push(frame); });
    expect(emitted).toEqual([{ type: 'capture-reply', id: 'r1', request: 'q1' }]);
  });

  it('delegates to the parked-peer query when processes is undefined, and emits its result', async () => {
    const peer = new DetachedPeer(root, randomUUID(), vi.fn(), vi.fn(), () => ({ text: 'parked screen', capturedAt: 7 }));
    await peer.start(vi.fn());
    peer.detach();
    const emitted: ServerFrame[] = [];
    try {
      answerCaptureRequest({ session: peer.session, id: 'r1', request: 'q1' }, undefined, root, (frame) => { emitted.push(frame); });
      await vi.waitFor(() => expect(emitted).toEqual([{ type: 'capture-reply', id: 'r1', request: 'q1', text: 'parked screen', capturedAt: 7 }]));
    } finally { peer.dispose(); }
  });
});
