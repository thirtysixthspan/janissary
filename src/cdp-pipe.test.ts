import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { CdpPipe } from './cdp-pipe.js';

describe('CdpPipe', () => {
  it('routes concurrent replies by unique id even when they arrive out of order', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const written: string[] = [];
    writePipe.on('data', (chunk: Buffer) => { written.push(chunk.toString('utf8')); });
    const cdp = new CdpPipe(writePipe, readPipe);

    const first = cdp.send('First.command', { value: 1 });
    const second = cdp.send('Second.command', { value: 2 });
    const commands = written.join('').split('\0').filter(Boolean)
      .map((raw) => JSON.parse(raw) as { id: number; method: string });

    expect(commands).toEqual([
      { id: 1, method: 'First.command', params: { value: 1 } },
      { id: 2, method: 'Second.command', params: { value: 2 } },
    ]);
    readPipe.write(`${JSON.stringify({ id: 2, result: 'second' })}\0`);
    readPipe.write(`${JSON.stringify({ id: 1, result: 'first' })}\0`);
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('parses split frames and ignores malformed and unrelated messages', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const cdp = new CdpPipe(writePipe, readPipe);
    const response = cdp.send('Example.command', {});

    readPipe.write('not json\0');
    readPipe.write(`${JSON.stringify({ id: 99, result: 'unrelated' })}\0`);
    readPipe.write('{"id":1,"result":"sp');
    readPipe.write('lit"}\0');

    await expect(response).resolves.toBe('split');
  });

  it('rejects every pending command when the pipe closes', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const cdp = new CdpPipe(writePipe, readPipe);
    const first = cdp.send('First.command', {});
    const second = cdp.send('Second.command', {});

    readPipe.end();

    await expect(first).rejects.toThrow('CDP pipe closed');
    await expect(second).rejects.toThrow('CDP pipe closed');
  });

  it('times out one command without disrupting later commands', async () => {
    vi.useFakeTimers();
    try {
      const writePipe = new PassThrough();
      const readPipe = new PassThrough();
      const cdp = new CdpPipe(writePipe, readPipe, 100);
      const expired = cdp.send('Expired.command', {});
      const assertion = expect(expired).rejects.toThrow('timed out after 100ms');

      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      const next = cdp.send('Next.command', {});
      readPipe.write(`${JSON.stringify({ id: 2, result: 'ok' })}\0`);
      await expect(next).resolves.toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects every pending command when a pipe errors', async () => {
    const writePipe = new PassThrough();
    const readPipe = new PassThrough();
    const cdp = new CdpPipe(writePipe, readPipe);
    const first = cdp.send('First.command', {});
    const second = cdp.send('Second.command', {});

    readPipe.emit('error', new Error('pipe failed'));

    await expect(first).rejects.toThrow('pipe failed');
    await expect(second).rejects.toThrow('pipe failed');
  });
});
