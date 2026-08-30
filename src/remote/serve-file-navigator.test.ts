import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    ['watch', { path: '../outside' }],
    ['read-directory', { path: '../outside' }],
    ['stat', { paths: ['../outside'] }],
  ] as const)('refuses escaping paths as an error for %s, which has no failure channel', async (operation, args) => {
    const reply = await request(operation, args);
    expect(reply).toMatchObject({ error: expect.stringContaining('outside this file navigator') });
    expect(reply).not.toHaveProperty('result');
  });

  it.each([
    ['write-file', { path: '../outside', content: '' }],
    ['move', { from: '../outside', to: '' }],
    ['delete', { path: '../outside' }],
    ['rename', { path: '../outside', name: 'x' }],
    ['create-file', { destination: '../outside' }],
    ['create-directory', { destination: '../outside' }],
  ] as const)('refuses escaping paths as a failure result for %s', async (operation, args) => {
    const reply = await request(operation, args);
    expect(reply).toMatchObject({
      result: { ok: false, reason: expect.stringContaining('outside this file navigator') },
    });
    expect(reply).not.toHaveProperty('error');
  });

  it.each([
    ['move-many', { sources: ['../outside'], destination: '' }, ['../outside', '']],
    ['delete-many', { paths: ['../outside'] }, ['../outside']],
    ['paste', { sources: [path.join(tmpdir(), 'outside')], destination: '', mode: 'copy' }, [path.join(tmpdir(), 'outside'), '']],
  ] as const)('refuses escaping paths as a batch report for %s', async (operation, args, attempted) => {
    const reply = await request(operation, args);

    expect(reply).toMatchObject({
      result: {
        total: attempted.length,
        failedPaths: [...attempted],
        mutated: false,
        failureReasons: Object.fromEntries(attempted.map((item) => [
          item, expect.stringContaining('outside this file navigator'),
        ])),
      },
    });
    expect(reply).not.toHaveProperty('error');
  });

  it('refuses an escaping replay as a result carrying the stacks back untouched', async () => {
    const undoStack = [{ entries: [{ from: '../outside', to: 'inside' }] }];
    const reply = await request('replay', {
      undoStack, redoStack: [], direction: 'undo', overwrite: false, skipConflicts: false,
    });

    expect(reply).toMatchObject({
      result: {
        result: { failedPaths: ['../outside', 'inside'], mutated: false },
        undoStack, redoStack: [], mutated: false,
      },
    });
    expect(reply).not.toHaveProperty('error');
  });

  it('names every path of a refused batch, not only the escaping one', async () => {
    writeFileSync(path.join(root, 'inside.txt'), 'keep');

    const reply = await request('delete-many', { paths: ['inside.txt', '../outside'] });

    expect(reply).toMatchObject({
      result: { total: 2, failedPaths: ['inside.txt', '../outside'], mutated: false },
    });
    expect(readFileSync(path.join(root, 'inside.txt'), 'utf8')).toBe('keep');
  });

  it('runs nothing at all when a paste source escapes but the destination is inside', async () => {
    mkdirSync(path.join(root, 'dest'));

    const reply = await request('paste', {
      sources: [path.join(tmpdir(), 'outside')], destination: 'dest', mode: 'copy',
    });

    expect(reply).toMatchObject({ result: { mutated: false, pairs: [] } });
    expect(existsSync(path.join(root, 'dest', 'outside'))).toBe(false);
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
