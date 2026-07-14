import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import { loadFrameEnablerExtension } from './chrome-extension-loader.js';

describe('loadFrameEnablerExtension', () => {
  it('sends Extensions.loadUnpacked over the pipe and resolves on a matching response', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const written: string[] = [];
    writePipe.on('data', (chunk: Buffer) => { written.push(chunk.toString('utf8')); });

    const promise = loadFrameEnablerExtension(writePipe, readPipe, '/path/to/chrome-extension');
    readPipe.write(`${JSON.stringify({ id: 1, result: {} })}\0`);
    await promise;

    const sent = JSON.parse(written.join('').replace(/\0$/, '')) as {
      id: number;
      method: string;
      params: unknown;
    };
    expect(sent).toEqual({
      id: 1,
      method: 'Extensions.loadUnpacked',
      params: { path: '/path/to/chrome-extension' },
    });
  });

  it('warns on stderr when the pipe returns a CDP error', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const promise = loadFrameEnablerExtension(writePipe, readPipe, '/path/to/chrome-extension');
    readPipe.write(`${JSON.stringify({ id: 1, error: { message: 'extensions domain disabled' } })}\0`);
    await promise;

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('warning: Chrome frame-enabler extension failed to load (extensions domain disabled)'),
    );

    writeSpy.mockRestore();
  });

  it('warns on stderr and gives up when no response ever arrives', async () => {
    vi.useFakeTimers();
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const promise = loadFrameEnablerExtension(writePipe, readPipe, '/path/to/chrome-extension');
    await vi.advanceTimersByTimeAsync(10_000);
    await promise;

    expect(writeSpy).toHaveBeenCalledWith(
      expect.stringContaining('warning: Chrome frame-enabler extension failed to load'),
    );

    writeSpy.mockRestore();
    vi.useRealTimers();
  });
});
