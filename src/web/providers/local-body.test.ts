import { describe, expect, it } from 'vitest';
import { LOCAL_MAX_BODY_BYTES, readCappedBody } from './local-body.js';

type StreamHooks = {
  onPull?: () => void;
  onCancel?: () => void | Promise<void>;
};

function makeStream(chunks: Uint8Array[], hooks: StreamHooks = {}): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        hooks.onPull?.();
        if (index >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[index]);
        index += 1;
      },
      async cancel() {
        await hooks.onCancel?.();
      },
    },
    { highWaterMark: 0 },
  );
}

describe('LOCAL_MAX_BODY_BYTES', () => {
  it('is 50 MiB', () => {
    expect(LOCAL_MAX_BODY_BYTES).toBe(52_428_800);
  });
});

describe('readCappedBody', () => {
  it('concatenates chunks in order under the cap', async () => {
    const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect([...await readCappedBody(new Response(stream), 10)]).toEqual([1, 2, 3, 4, 5]);
  });

  it('refuses a declared length above the cap before pulling, cancelling the source', async () => {
    let pulls = 0;
    let cancels = 0;
    const stream = makeStream([new Uint8Array([1, 2, 3])], {
      onPull: () => {
        pulls += 1;
      },
      onCancel: () => {
        cancels += 1;
      },
    });
    const response = new Response(stream, { headers: { 'content-length': '4' } });
    await expect(readCappedBody(response, 3)).rejects.toThrow('response larger than 50 MB');
    expect(pulls).toBe(0);
    expect(cancels).toBe(1);
  });

  it('accepts a declared length equal to the cap', async () => {
    const stream = makeStream([new Uint8Array([1, 2, 3])]);
    const response = new Response(stream, { headers: { 'content-length': '3' } });
    expect([...await readCappedBody(response, 3)]).toEqual([1, 2, 3]);
  });

  it('ignores a non-numeric declared length', async () => {
    for (const length of ['abc', '1e9', '3, 3']) {
      const stream = makeStream([new Uint8Array([1, 2, 3])]);
      const response = new Response(stream, { headers: { 'content-length': length } });
      expect([...await readCappedBody(response, 3)]).toEqual([1, 2, 3]);
    }
  });

  it('stops at the cap while streaming, cancelling the source and pulling no later chunk', async () => {
    let pulls = 0;
    let cancels = 0;
    const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3, 4]), new Uint8Array([5, 6])], {
      onPull: () => {
        pulls += 1;
      },
      onCancel: () => {
        cancels += 1;
      },
    });
    await expect(readCappedBody(new Response(stream), 3)).rejects.toThrow('response larger than 50 MB');
    expect(cancels).toBe(1);
    expect(pulls).toBe(2);
  });

  it('accepts a body exactly at the cap', async () => {
    const stream = makeStream([new Uint8Array([1, 2]), new Uint8Array([3])]);
    expect([...await readCappedBody(new Response(stream), 3)]).toEqual([1, 2, 3]);
  });

  it('keeps the cap reason when the source cancel throws', async () => {
    const stream = makeStream([new Uint8Array([1, 2, 3])], {
      onCancel: () => {
        throw new Error('cancel failed');
      },
    });
    await expect(readCappedBody(new Response(stream), 1)).rejects.toThrow('response larger than 50 MB');
  });

  it('returns an empty Uint8Array for a null body', async () => {
    const result = await readCappedBody(new Response(null), 3);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBe(0);
  });

  it('propagates a stream read error unchanged', async () => {
    const failure = new Error('boom');
    const stream = new ReadableStream<Uint8Array>(
      {
        pull() {
          throw failure;
        },
      },
      { highWaterMark: 0 },
    );
    await expect(readCappedBody(new Response(stream), 10)).rejects.toBe(failure);
  });
});
