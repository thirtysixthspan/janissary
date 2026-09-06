import { describe, expect, it } from 'vitest';
import { PassThrough } from 'node:stream';
import { childOutputTail, withChildOutput } from './child-output.js';

// A stream stands in for a child's stdout/stderr. `PassThrough` is a real `Readable`, so these
// exercise the same `setEncoding`/`readable`/`read()` path the spawned children take.
function stream(): PassThrough {
  return new PassThrough();
}

describe('childOutputTail', () => {
  it('captures what a stream said', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    output.write('launch failed: no such executable\n');

    expect(tail.text()).toBe('launch failed: no such executable');
  });

  it('captures across several writes and both watched streams', () => {
    const tail = childOutputTail();
    const out = stream();
    const error = stream();
    tail.watch(out);
    tail.watch(error);

    out.write('first\n');
    error.write('second\n');

    expect(tail.text()).toBe('first\nsecond');
  });

  it('returns nothing for a child that said nothing', () => {
    const tail = childOutputTail();
    tail.watch(stream());

    expect(tail.text()).toBe('');
  });

  it('returns nothing when no stream was ever watched', () => {
    expect(childOutputTail().text()).toBe('');
  });

  // A child spawned with a stdio slot it was not given exposes `null` there, and the caller should
  // not have to branch on which slots it piped.
  it('takes an absent stream without complaint', () => {
    const tail = childOutputTail();

    expect(() => { tail.watch(null); tail.watch(undefined); }).not.toThrow();
    expect(tail.text()).toBe('');
  });

  // Reading synchronously at report time is the whole point: a message composed inside an `exit`
  // handler has no later tick to wait for.
  it('takes output written in the same tick as the read', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    output.write('written and read without yielding\n');
    const text = tail.text();

    expect(text).toBe('written and read without yielding');
  });

  it('keeps the newest lines when a child says more than the line cap', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    for (let line = 1; line <= 30; line++) output.write(`line ${line}\n`);

    const lines = tail.text().split('\n');
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe('line 21');
    expect(lines.at(-1)).toBe('line 30');
  });

  it('bounds what it holds when a child spews without newlines', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    output.write('a'.repeat(9000));
    output.write('tail-marker');

    const text = tail.text();
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text.endsWith('tail-marker')).toBe(true);
  });

  it('reassembles a multi-byte character split across two writes', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);
    const bytes = Buffer.from('héllo wörld 🌍', 'utf8');

    output.write(bytes.subarray(0, 5));
    output.write(bytes.subarray(5));

    expect(tail.text()).toBe('héllo wörld 🌍');
  });

  // Reporting some other failure must not be derailed by the pipe breaking underneath it.
  it('survives a stream that errors', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    output.write('said this much\n');
    output.emit('error', new Error('EPIPE'));

    expect(tail.text()).toBe('said this much');
  });

  it('trims surrounding blank space', () => {
    const tail = childOutputTail();
    const output = stream();
    tail.watch(output);

    output.write('\n\n  spaced out  \n\n');

    expect(tail.text()).toBe('spaced out');
  });
});

describe('withChildOutput', () => {
  it('leaves the message alone when the child said nothing', () => {
    expect(withChildOutput('e2e browser exited', '')).toBe('e2e browser exited');
  });

  it('puts the child\'s own words beneath the message', () => {
    expect(withChildOutput('e2e browser exited', 'launch failed')).toBe('e2e browser exited\nlaunch failed');
  });
});
