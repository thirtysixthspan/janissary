import { afterEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonlTail } from './jsonl-tail.js';

let roots: string[] = [];

function session(lines: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'janus-jsonl-tail-'));
  roots.push(root);
  const file = path.join(root, 'session.jsonl');
  writeFileSync(file, lines.length === 0 ? '' : `${lines.join('\n')}\n`);
  return file;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('JsonlTail', () => {
  // Only the bytes added since the last call are read: a session file grows without bound, so a
  // whole-file re-read per poll would cost more with every message.
  it('reads the records a completed file holds', () => {
    const tail = new JsonlTail(session([JSON.stringify({ type: 'user' }), JSON.stringify({ type: 'a' })]));
    expect(tail.read()).toEqual([{ type: 'user' }, { type: 'a' }]);
  });

  it('returns nothing on a second read, having not re-read the file', () => {
    const file = session([JSON.stringify({ type: 'user' })]);
    const tail = new JsonlTail(file);
    tail.read();

    expect(tail.read()).toEqual([]);
  });

  it('reads only what was appended since the last call', () => {
    const file = session([JSON.stringify({ type: 'user' })]);
    const tail = new JsonlTail(file);
    tail.read();

    appendFileSync(file, `${JSON.stringify({ type: 'assistant' })}\n`);

    expect(tail.read()).toEqual([{ type: 'assistant' }]);
  });

  // A poll routinely lands mid-record, so a trailing partial line is held back until its newline
  // arrives — otherwise half a record renders and then again, doubled, once the rest lands.
  it('holds a trailing partial line until its newline arrives', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-jsonl-tail-'));
    roots.push(root);
    const file = path.join(root, 'session.jsonl');
    const tail = new JsonlTail(file);

    writeFileSync(file, '{"type":"user"}\n{"type":"assis');
    expect(tail.read()).toEqual([{ type: 'user' }]);

    appendFileSync(file, 'tant"}\n');
    expect(tail.read()).toEqual([{ type: 'assistant' }]);
  });

  it('skips a corrupt line rather than stopping at it', () => {
    const tail = new JsonlTail(session(['{"type":"user"}', 'not json at all', '{"type":"assistant"}']));
    expect(tail.read()).toEqual([{ type: 'user' }, { type: 'assistant' }]);
  });

  it('reads nothing from an empty file', () => {
    expect(new JsonlTail(session([])).read()).toEqual([]);
  });

  // A session file that has not been created yet is not an error: the harness may not have written
  // its first record, and the next poll will find it.
  it('reads nothing while the session file does not exist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-jsonl-tail-'));
    roots.push(root);
    const tail = new JsonlTail(path.join(root, 'not-yet.jsonl'));

    expect(tail.read()).toEqual([]);

    writeFileSync(path.join(root, 'not-yet.jsonl'), '{"type":"user"}\n');
    expect(tail.read()).toEqual([{ type: 'user' }]);
  });

  // A file that shrank was rotated or replaced, so its old offset names nothing. Reading from the
  // start is the only way to see the new file, and the held-back partial line belonged to the old
  // one and would otherwise be prepended to the new file's first record.
  it('reads a shrunk file from the start, dropping the held-back partial line', () => {
    const file = session([JSON.stringify({ type: 'user' })]);
    const tail = new JsonlTail(file);
    tail.read();
    writeFileSync(file, '{"type":"par');

    expect(tail.read()).toEqual([]);

    appendFileSync(file, 'tial"}\n');
    expect(tail.read()).toEqual([{ type: 'partial' }]);
  });

  // A read error yields nothing and leaves the offset alone, so the next poll retries the same
  // bytes rather than skipping past whatever it could not read.
  it('reads nothing and holds its offset when the file cannot be read', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'janus-jsonl-tail-'));
    roots.push(root);
    const asDirectory = path.join(root, 'session.jsonl');
    mkdirSync(asDirectory);

    const tail = new JsonlTail(asDirectory);

    expect(tail.read()).toEqual([]);

    // Still asked for every poll: nothing was consumed, so nothing is lost.
    expect(tail.read()).toEqual([]);
  });
});
