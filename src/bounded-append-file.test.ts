import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BoundedAppendFile } from './bounded-append-file.js';

let dir: string;
let file: BoundedAppendFile | undefined;

async function waitFor(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((r) => setTimeout(r, 5));
}

async function readWhenFlushed(target: string, expected: string): Promise<string> {
  await waitFor(() => existsSync(target) && readFileSync(target, 'utf8') === expected);
  return readFileSync(target, 'utf8');
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'bounded-append-'));
  file = undefined;
});

afterEach(() => {
  file?.dispose();
  rmSync(dir, { recursive: true, force: true });
});

describe('BoundedAppendFile', () => {
  it('does nothing on construction', () => {
    const target = path.join(dir, 'out.txt');
    const resolvePath = vi.fn(() => target);
    file = new BoundedAppendFile(resolvePath, 1024, vi.fn());
    expect(resolvePath).not.toHaveBeenCalled();
    expect(existsSync(target)).toBe(false);
    expect(file.isOpen()).toBe(false);
    expect(file.openedPath()).toBeUndefined();
  });

  it('opens on the first write, resolves the path once, and appends every line in order', async () => {
    const target = path.join(dir, 'out.txt');
    const resolvePath = vi.fn(() => target);
    const failure = vi.fn();
    file = new BoundedAppendFile(resolvePath, 1024, failure);
    file.write('one\n');
    expect(file.isOpen()).toBe(true);
    expect(file.openedPath()).toBe(target);
    file.write('two\n');
    file.write('three\n');
    expect(resolvePath).toHaveBeenCalledOnce();
    file.dispose();
    expect(await readWhenFlushed(target, 'one\ntwo\nthree\n')).toBe('one\ntwo\nthree\n');
    expect(failure).not.toHaveBeenCalled();
  });

  it('abandons once when a write would push pending bytes past the limit', async () => {
    const target = path.join(dir, 'out.txt');
    const failure = vi.fn();
    file = new BoundedAppendFile(() => target, 20, failure);
    file.write('0123456789\n');
    file.write('0123456789\n');
    expect(failure).toHaveBeenCalledOnce();
    expect(file.isOpen()).toBe(false);
    expect(file.openedPath()).toBe(target);
    file.write('later\n');
    expect(failure).toHaveBeenCalledOnce();
    expect(() => file?.dispose()).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    expect(existsSync(target) ? readFileSync(target, 'utf8') : '').not.toContain('later');
  });

  it('counts UTF-8 bytes rather than characters', () => {
    const failure = vi.fn();
    file = new BoundedAppendFile(() => path.join(dir, 'out.txt'), 20, failure);
    file.write('é'.repeat(15));
    expect(failure).toHaveBeenCalledOnce();
    expect(file.isOpen()).toBe(false);
  });

  it('refuses a first line that alone exceeds the limit', () => {
    const failure = vi.fn();
    file = new BoundedAppendFile(() => path.join(dir, 'out.txt'), 20, failure);
    file.write('x'.repeat(21));
    expect(failure).toHaveBeenCalledOnce();
    expect(file.isOpen()).toBe(false);
  });

  it('abandons without retrying when resolving the path throws', () => {
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, '');
    const resolvePath = vi.fn(() => {
      mkdirSync(path.join(blocker, 'nested'), { recursive: true });
      return path.join(blocker, 'nested', 'out.txt');
    });
    const failure = vi.fn();
    file = new BoundedAppendFile(resolvePath, 1024, failure);
    file.write('one\n');
    expect(failure).toHaveBeenCalledOnce();
    expect(file.isOpen()).toBe(false);
    expect(file.openedPath()).toBeUndefined();
    file.write('two\n');
    expect(resolvePath).toHaveBeenCalledOnce();
  });

  it('abandons once on an asynchronous stream error', async () => {
    const failure = vi.fn();
    file = new BoundedAppendFile(() => dir, 1024, failure);
    file.write('one\n');
    await waitFor(() => failure.mock.calls.length > 0);
    expect(failure).toHaveBeenCalledOnce();
    expect(file.isOpen()).toBe(false);
  });

  it('opens nothing after dispose and disposes harmlessly twice', () => {
    const target = path.join(dir, 'out.txt');
    const resolvePath = vi.fn(() => target);
    const failure = vi.fn();
    file = new BoundedAppendFile(resolvePath, 1024, failure);
    file.dispose();
    file.write('one\n');
    file.dispose();
    expect(resolvePath).not.toHaveBeenCalled();
    expect(existsSync(target)).toBe(false);
    expect(file.isOpen()).toBe(false);
    expect(failure).not.toHaveBeenCalled();
  });
});
