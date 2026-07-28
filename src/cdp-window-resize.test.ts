import { PassThrough } from 'node:stream';
import { describe, it, expect, vi } from 'vitest';
import { resizeAppWindow, getAppWindowBounds } from './cdp-window-resize.js';

describe('resizeAppWindow', () => {
  it('looks up the window id then sets its bounds over the pipe', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const written: string[] = [];
    writePipe.on('data', (chunk: Buffer) => { written.push(chunk.toString('utf8')); });

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write(`${JSON.stringify({ id: 1, result: { targetInfos: [{ targetId: 'abc', type: 'page' }] } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: { windowId: 7 } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: {} })}\0`);
    await promise;

    const [first, second, third] = written.join('').split('\0').filter(Boolean)
      .map((raw) => JSON.parse(raw) as { id: number; method: string; params: unknown });
    expect(first).toEqual({ id: 1, method: 'Target.getTargets', params: {} });
    expect(second).toEqual({ id: 1, method: 'Browser.getWindowForTarget', params: { targetId: 'abc' } });
    expect(third).toEqual({ id: 1, method: 'Browser.setWindowBounds', params: { windowId: 7, bounds: { width: 1440, height: 900 } } });
  });

  it('throws when no page target is found', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write(`${JSON.stringify({ id: 1, result: { targetInfos: [] } })}\0`);

    await expect(promise).rejects.toThrow('no page target found');
  });

  it('rejects when the pipe returns a CDP error', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write(`${JSON.stringify({ id: 1, error: { message: 'window not found' } })}\0`);

    await expect(promise).rejects.toThrow('window not found');
  });

  it('ignores malformed JSON and unrelated ids before matching the response', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();

    const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
    readPipe.write('not json at all\0');
    readPipe.write(`${JSON.stringify({ id: 99, result: { targetInfos: [] } })}\0`);
    readPipe.write(`${JSON.stringify({ id: 1, result: { targetInfos: [{ targetId: 'abc', type: 'page' }] } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: { windowId: 7 } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: {} })}\0`);
    await promise;
  });

  it('rejects when the pipe never responds before the timeout', async () => {
    vi.useFakeTimers();
    try {
      const writePipe = new PassThrough();
      const readPipe = new PassThrough();

      const promise = resizeAppWindow(writePipe, readPipe, 1440, 900);
      const assertion = expect(promise).rejects.toThrow('CDP command Target.getTargets timed out after 20000ms');
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('getAppWindowBounds', () => {
  it('looks up the window id then reads its bounds over the pipe', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const written: string[] = [];
    writePipe.on('data', (chunk: Buffer) => { written.push(chunk.toString('utf8')); });

    const promise = getAppWindowBounds(writePipe, readPipe);
    readPipe.write(`${JSON.stringify({ id: 1, result: { targetInfos: [{ targetId: 'abc', type: 'page' }] } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: { windowId: 7 } })}\0`);
    await new Promise((resolve) => { setImmediate(resolve); });
    readPipe.write(`${JSON.stringify({ id: 1, result: { bounds: { width: 1440, height: 900 } } })}\0`);
    const bounds = await promise;

    expect(bounds).toEqual({ width: 1440, height: 900 });
    const [first, second, third] = written.join('').split('\0').filter(Boolean)
      .map((raw) => JSON.parse(raw) as { id: number; method: string; params: unknown });
    expect(first).toEqual({ id: 1, method: 'Target.getTargets', params: {} });
    expect(second).toEqual({ id: 1, method: 'Browser.getWindowForTarget', params: { targetId: 'abc' } });
    expect(third).toEqual({ id: 1, method: 'Browser.getWindowBounds', params: { windowId: 7 } });
  });

  it('throws when no page target is found', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();

    const promise = getAppWindowBounds(writePipe, readPipe);
    readPipe.write(`${JSON.stringify({ id: 1, result: { targetInfos: [] } })}\0`);

    await expect(promise).rejects.toThrow('no page target found');
  });
});
