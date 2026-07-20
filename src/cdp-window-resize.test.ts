import { PassThrough } from 'node:stream';
import { describe, it, expect } from 'vitest';
import { resizeAppWindow } from './cdp-window-resize.js';

describe('resizeAppWindow', () => {
  it('looks up the window id then sets its bounds over the pipe', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const written: string[] = [];
    writePipe.on('data', (chunk: Buffer) => { written.push(chunk.toString('utf8')); });

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write(`${JSON.stringify({ id: 1, result: { windowId: 7 } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: {} })}\0`);
    await promise;

    const [first, second] = written.join('').split('\0').filter(Boolean)
      .map((raw) => JSON.parse(raw) as { id: number; method: string; params: unknown });
    expect(first).toEqual({ id: 1, method: 'Browser.getWindowForTarget', params: {} });
    expect(second).toEqual({ id: 1, method: 'Browser.setWindowBounds', params: { windowId: 7, bounds: { width: 1440, height: 900 } } });
  });

  it('rejects when the pipe returns a CDP error', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write(`${JSON.stringify({ id: 1, error: { message: 'window not found' } })}\0`);

    await expect(promise).rejects.toThrow('window not found');
  });
});
