import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_POLICY_MAX_BYTES } from '../file-read/policy.js';
import { createPatchView } from './view.js';
import type { PatchView } from './view.js';

let root: string;
let outside: string;
let view: PatchView;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-patch-view-')));
  outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-patch-outside-')));
  view = createPatchView(root);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

function write(relative: string, content: string | Buffer = 'text'): string {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}
function resolve(requested: string) {
  const result = view.resolve(requested);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('patch view', () => {
  it('reads each file once and preserves original bytes, BOM, mode and identity', () => {
    const bytes = Buffer.from('\u{FEFF}hello');
    const file = write('a.txt', bytes);
    chmodSync(file, 0o640);
    const place = resolve('a.txt');
    writeFileSync(file, 'changed');
    expect(resolve('./sub/../a.txt')).toBe(place);
    expect(place).toMatchObject({ requested: 'a.txt', location: file, existed: true, exists: true });
    expect(place.content).toEqual({ realPath: file, original: bytes, mode: 0o640, hadBom: true, current: 'hello' });
    expect(view.places()).toEqual([place]);
    expect(view.contents()).toEqual([place.content]);
  });

  it('derives missing folders from existing places, deduplicated and ordered by depth', () => {
    const first = resolve('a/b/one');
    const second = resolve('a/two');
    const absent = resolve('z/unused');
    expect(first).toMatchObject({ existed: false, exists: false, missingFolders: [path.join(root, 'a'), path.join(root, 'a/b')] });
    expect(first.content).toMatchObject({ original: undefined, current: undefined, hadBom: false });
    expect(view.plannedFolders()).toEqual([]);
    view.setExists(first, true);
    view.setExists(second, true);
    expect(view.plannedFolders()).toEqual([path.join(root, 'a'), path.join(root, 'a/b')]);
    expect(view.places()).toEqual([first, second, absent]);
    view.setExists(first, false);
    expect(view.plannedFolders()).toEqual([path.join(root, 'a')]);
  });

  it('does not rebuild planned folders for each resolved path or existence change', () => {
    const sorted = vi.spyOn(Array.prototype, 'toSorted');
    for (let index = 0; index < 200; index += 1) resolve(`missing-${index}/file`);
    for (let index = 0; index < 200; index += 1) view.setExists(resolve(`added-${index}/file`), true);
    expect(sorted).not.toHaveBeenCalled();
    expect(view.plannedFolders()).toHaveLength(200);
    expect(sorted).toHaveBeenCalledTimes(1);
    sorted.mockRestore();
  });

  it('keeps planned-folder membership through add, move away and re-add', () => {
    const place = resolve('dir/file');
    view.setExists(place, true);
    view.setExists(place, true);
    expect(view.resolve('dir')).toEqual({ ok: false, reason: 'Is a directory' });
    view.setExists(place, false);
    expect(resolve('dir').exists).toBe(false);
    view.setExists(place, true);
    expect(view.resolve('dir')).toEqual({ ok: false, reason: 'Is a directory' });
    view.setExists(place, false);
    expect(resolve('dir').exists).toBe(false);
  });

  it('refuses invalid paths and contents without recording them', () => {
    mkdirSync(path.join(root, 'dir'));
    write('binary', Buffer.from([0xff]));
    write('nul', Buffer.from([0]));
    truncateSync(write('large'), FILE_POLICY_MAX_BYTES + 1);
    for (const [requested, reason] of [
      ['../x', 'Outside the workspace'], [path.join(outside, 'x'), 'Outside the workspace'],
      ['.git/config', 'Protected file'], ['.janissary/x', 'Protected file'], ['dir', 'Is a directory'],
      ['.', 'Is a directory'], ['.env', 'Secret file'], ['binary', 'Not a text file'],
      ['nul', 'Not a text file'], ['large', 'File too large (>5 MB)'],
    ]) expect(view.resolve(requested)).toEqual({ ok: false, reason });
    expect(view.places()).toEqual([]);
    expect(view.contents()).toEqual([]);
  });

  it('shares content between a link and its target while retaining distinct places', () => {
    const file = write('target', 'original');
    symlinkSync('target', path.join(root, 'link'));
    const link = resolve('link');
    writeFileSync(file, 'changed');
    const target = resolve('target');
    expect(link).toMatchObject({ location: path.join(root, 'link'), linkText: 'target' });
    expect(link.content.realPath).toBe(realpathSync.native(file));
    expect(target.location).toBe(file);
    expect(target.content).toBe(link.content);
    expect(target.content.current).toBe('original');
    expect(view.places()).toEqual([link, target]);
    expect(view.contents()).toEqual([link.content]);
  });

  it('refuses dangling and outside links', () => {
    symlinkSync(path.join(root, 'missing'), path.join(root, 'dangling'));
    writeFileSync(path.join(outside, 'file'), 'outside');
    symlinkSync(path.join(outside, 'file'), path.join(root, 'escape'));
    expect(view.resolve('dangling')).toEqual({ ok: false, reason: 'Not a text file' });
    expect(view.resolve('dangling/x')).toEqual({ ok: false, reason: 'Not a text file' });
    expect(view.resolve('escape')).toEqual({ ok: false, reason: 'Outside the workspace' });
    expect(view.places()).toEqual([]);
  });

  it('prevents planned files and folders from occupying the same location', () => {
    const child = resolve('a/b/file');
    view.setExists(child, true);
    expect(view.resolve('a/b')).toEqual({ ok: false, reason: 'Is a directory' });
    const file = resolve('file');
    view.setExists(file, true);
    expect(view.resolve('file/sub')).toEqual({ ok: false, reason: 'Filesystem error ENOTDIR; check the item and destination, then try again' });
    view.setExists(file, false);
    expect(resolve('file/sub').exists).toBe(false);
  });

  it('unifies case-only file and link spellings on a case-insensitive volume', (context) => {
    write('CaseProbe');
    if (!existsSync(path.join(root, 'caseprobe'))) context.skip();
    write('A.txt');
    symlinkSync('A.txt', path.join(root, 'Link'));
    expect(resolve('A.txt')).toBe(resolve('a.txt'));
    expect(resolve('Link')).toBe(resolve('link'));
  });
});
