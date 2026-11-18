import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPatchView } from '../file-patch/view.js';
import { resolveMutationTarget } from '../file-write/target.js';
import { canonicalPath, foldCase } from './canonical.js';
import { readWorkspaceCommand } from './read.js';

let root: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-canonical-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('canonical file keys', () => {
  it('canonicalPath preserves the on-disk spelling of a mixed-case file', () => {
    const file = path.join(root, 'MixedCase.txt');
    writeFileSync(file, 'one\n');
    expect(canonicalPath(file)).toBe(realpathSync.native(file));
  });

  it('foldCase gives a Unicode alias the same key as its ASCII spelling', () => {
    expect(foldCase('.JANI\u{17F}\u{17F}ARY')).toBe(foldCase('.janissary'));
    expect(foldCase('MixedCase')).toBe('mixedcase');
  });

  it('reads, writes and patches a mixed-case path under one canonical key', () => {
    const file = path.join(root, 'MixedCase.txt');
    writeFileSync(file, 'one\ntwo\n');
    const onDisk = realpathSync.native(file);

    expect(readWorkspaceCommand(root, 'file read MixedCase.txt')).toBe('1\tone\n2\ttwo');

    const target = resolveMutationTarget(root, 'MixedCase.txt');
    if (!target.ok) throw new Error(target.reason);
    expect(target.value.realPath).toBe(onDisk);

    const place = createPatchView(root).resolve('MixedCase.txt');
    if (!place.ok) throw new Error(place.reason);
    expect(place.value.location).toBe(onDisk);
    expect(place.value.content.realPath).toBe(onDisk);
  });
});
