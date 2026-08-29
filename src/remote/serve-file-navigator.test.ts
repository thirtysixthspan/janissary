import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RemoteFileNavigators } from './serve-file-navigator.js';
import type { FileSystemPort, WatchHandle } from '../file-navigator/filesystem-port.js';
import type { ClientFrame, ServerFrame } from './protocol.js';

type Request = Extract<ClientFrame, { type: 'filesystem-request' }>;

describe('RemoteFileNavigators', () => {
  let root: string;
  let frames: ServerFrame[];
  let files: RemoteFileNavigators;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'janus-remote-files-'));
    frames = [];
    files = new RemoteFileNavigators((frame) => { frames.push(frame); }, root);
    files.open('files1');
  });

  afterEach(() => {
    files.dispose();
    rmSync(root, { recursive: true, force: true });
  });

  async function request(operation: Request['operation'], args: Request['args']): Promise<ServerFrame> {
    const id = `q${frames.length + 1}`;
    files.request({ type: 'filesystem-request', session: 'files1', request: id, operation, args });
    await vi.waitFor(() => expect(frames.some((frame) => frame.type === 'filesystem-reply' && frame.request === id)).toBe(true));
    return frames.find((frame) => frame.type === 'filesystem-reply' && frame.request === id)!;
  }

  it('reads, lists, stats, searches, writes, and mutates inside the workspace', async () => {
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'a.txt'), 'héllo\nworld');

    expect(await request('read-directory', { path: 'src' })).toMatchObject({ result: [{ name: 'a.txt', dir: false }] });
    expect(await request('stat', { paths: ['src/a.txt'] })).toMatchObject({ result: { 'src/a.txt': expect.any(Object) } });
    expect(await request('search', {})).toMatchObject({ result: ['src/a.txt'] });
    expect(await request('read-file', { path: 'src/a.txt' })).toMatchObject({ result: { content: Buffer.from('héllo\nworld').toString('base64') } });
    await request('write-file', { path: 'src/a.txt', content: Buffer.from('changed').toString('base64') });
    expect(readFileSync(path.join(root, 'src', 'a.txt'), 'utf8')).toBe('changed');
    await request('rename', { path: 'src/a.txt', name: 'b.txt' });
    await request('create-directory', { destination: 'src' });
    await request('move', { from: 'src/b.txt', to: '' });
    await request('delete', { path: 'b.txt' });
    expect(statSync(path.join(root, 'src', 'untitled')).isDirectory()).toBe(true);
  });

  it.each([
    ['read-file', { path: '../outside' }],
    ['write-file', { path: '../outside', content: '' }],
    ['watch', { path: '../outside' }],
    ['move', { from: '../outside', to: '' }],
    ['move-many', { sources: ['../outside'], destination: '' }],
    ['delete', { path: '../outside' }],
    ['delete-many', { paths: ['../outside'] }],
    ['rename', { path: '../outside', name: 'x' }],
    ['paste', { sources: [path.join(tmpdir(), 'outside')], destination: '', mode: 'copy' }],
    ['create-file', { destination: '../outside' }],
    ['create-directory', { destination: '../outside' }],
    ['replay', {
      undoStack: [{ entries: [{ from: '../outside', to: 'inside' }] }], redoStack: [],
      direction: 'undo', overwrite: false, skipConflicts: false,
    }],
  ] as const)('refuses escaping paths for %s', async (operation, args) => {
    expect(await request(operation, args)).toMatchObject({ error: expect.stringContaining('outside this file navigator') });
  });

  it('stops every watcher on close and dispose', async () => {
    const stop = vi.fn();
    const fake = {
      watch: vi.fn((): WatchHandle => ({ stop })),
    } as unknown as FileSystemPort;
    const holder = new RemoteFileNavigators((frame) => { frames.push(frame); }, root, fake);
    holder.open('files2');
    holder.request({ type: 'filesystem-request', session: 'files2', request: 'watch', operation: 'watch', args: { path: '' } });
    await vi.waitFor(() => expect(fake.watch).toHaveBeenCalled());
    holder.dispose();
    expect(stop).toHaveBeenCalledOnce();
  });
});
